"""
Nano Banana / Symphony Brand Swap — explicit two-mode pipeline.

MODE A — GENERATE (no source image)
    Caller: run_generation_pipeline(prompt, ...)
    Uses the text-to-image Imagen 3 generation pipeline.

MODE B — EDIT (source image provided)
    Caller: run_edit_pipeline(image_bytes, prompt, ...)
    Uses: PersonSegmenter → mask → Imagen inpainting (imagegeneration@006).

    Fallback rules inside edit mode (per spec):
        segmentation failure / mask too small → return ORIGINAL IMAGE (not generation)
        large mask          → clamp strength only, continue with edit
        exception / timeout / API failure → fall back to generation pipeline

Routing is decided by main.py — this module NEVER decides which mode to run.

Structured log events:
    SYMPHONY_MODE=edit        — edit pipeline started
    SYMPHONY_MODE=generate    — generation pipeline started
    SEGMENTATION_SUCCESS      — mask produced, inpainting in progress
    SEGMENTATION_FALLBACK     — no mask; original image returned as-is
    EDIT_MODE_ACTIVE          — Imagen inpainting call dispatched
    EDIT_MODE_DISABLED        — mask area guard; original image returned
    EDIT_HARD_FALLBACK        — exception / timeout; falling back to generation

Public API consumed by main.py:
    run_edit_pipeline(image_bytes, prompt, ...) -> dict
    run_generation_pipeline(prompt, ...)        -> dict
    download_nano_result(url)                   -> bytes
"""
from __future__ import annotations

import asyncio
import io
import logging
import threading
from typing import TYPE_CHECKING, Optional

# Heavy deps imported lazily inside functions so a missing package does NOT
# prevent this module from loading or break the generation-pipeline path.
if TYPE_CHECKING:
    from PIL import Image as PILImage

from .ai import ImageGenerationPipeline, PipelineError
from .ai.image_edit_params import ImageEditParams
from .ai.segmentation import get_segmenter

logger = logging.getLogger(__name__)

# ── Imagen edit model singleton ────────────────────────────────────────────────
# imagegeneration@006 = Imagen 2.x — the documented model that supports
# edit_image() inpainting with a mask.
_EDIT_MODEL = "imagegeneration@006"

_edit_model_lock = threading.Lock()
_edit_model = None


def _get_edit_model():
    """Return the Imagen inpainting model (loads once, thread-safe)."""
    global _edit_model
    if _edit_model is not None:
        return _edit_model
    with _edit_model_lock:
        if _edit_model is not None:
            return _edit_model
        from vertexai.preview.vision_models import ImageGenerationModel  # noqa: PLC0415
        _edit_model = ImageGenerationModel.from_pretrained(_EDIT_MODEL)
        logger.info("Imagen edit model loaded: %s", _EDIT_MODEL)
        return _edit_model


# ── Generation pipeline singleton ─────────────────────────────────────────────
_pipeline: Optional[ImageGenerationPipeline] = None


def _get_pipeline() -> ImageGenerationPipeline:
    global _pipeline
    if _pipeline is None:
        _pipeline = ImageGenerationPipeline.default()
    return _pipeline


# ── Helpers ────────────────────────────────────────────────────────────────────

def _mask_to_png_bytes(mask) -> bytes:
    """Convert a HxW uint8 mask to grayscale PNG bytes for Imagen."""
    from PIL import Image as _PIL  # noqa: PLC0415
    buf = io.BytesIO()
    _PIL.fromarray(mask, mode="L").save(buf, format="PNG")
    return buf.getvalue()


# ── Core synchronous edit function ────────────────────────────────────────────

def _edit_person_identity(image, prompt: str, params: ImageEditParams):
    """
    Synchronous worker: segment person → inpaint with Imagen.

    Called via asyncio.to_thread() — must not contain any async code.

    Returns
    -------
    PIL.Image
        Edited image on success, or the ORIGINAL image when:
          • segmentation returns no mask
          • mask covers < 5 % of the frame (identity too small to edit safely)
        Only raises on hard API failure so the async caller can decide whether
        to fall back to generation.
    """
    import numpy as np  # noqa: PLC0415

    h, w = image.height, image.width
    total_px = h * w

    # ── Step 1: PIL → numpy RGB ────────────────────────────────────────────────
    img_rgb = np.array(image.convert("RGB"))

    # ── Step 2: person segmentation ───────────────────────────────────────────
    mask = get_segmenter().get_person_mask(img_rgb)

    if mask is None:
        logger.warning(
            "SEGMENTATION_FALLBACK: no mask produced — returning original image"
        )
        return image  # identity preserved; NOT a hard failure

    # ── Step 3: safety guards ─────────────────────────────────────────────────
    coverage = float((mask > 127).sum()) / total_px

    if coverage < 0.05:
        logger.warning(
            "EDIT_MODE_DISABLED: mask coverage %.1f%% < 5%% — "
            "returning original image",
            coverage * 100,
        )
        return image  # identity preserved; NOT a hard failure

    effective_strength = params.image_strength
    if coverage > 0.70:
        effective_strength = min(effective_strength, 0.18)
        logger.info(
            "Safety guard: coverage %.1f%% > 70%% → strength clamped to %.2f",
            coverage * 100, effective_strength,
        )
    if effective_strength > 0.4:
        effective_strength = 0.25
        logger.info("Safety guard: strength > 0.4 → forced to 0.25")

    logger.info(
        "EDIT_MODE_ACTIVE: coverage=%.1f%% | strength=%.2f | "
        "guidance=%.1f | seed=%s",
        coverage * 100, effective_strength,
        params.guidance_scale, params.seed,
    )

    # ── Step 4: mask → PNG bytes ───────────────────────────────────────────────
    mask_bytes = _mask_to_png_bytes(mask)

    # ── Step 5: Imagen inpainting ─────────────────────────────────────────────
    from vertexai.preview.vision_models import Image as VertexImage  # noqa: PLC0415
    from PIL import Image as _PIL                                      # noqa: PLC0415

    base_buf = io.BytesIO()
    image.convert("RGB").save(base_buf, format="PNG")

    response = _get_edit_model().edit_image(
        prompt=prompt,
        base_image=VertexImage(image_bytes=base_buf.getvalue()),
        mask=VertexImage(image_bytes=mask_bytes),
        number_of_images=1,
        edit_mode="inpainting-insert",
        guidance_scale=params.guidance_scale,
        seed=params.seed,
        safety_filter_level="block_some",
        person_generation="allow_adult",
    )

    images = response.images
    if not images:
        logger.warning("EDIT_MODE_DISABLED: Imagen returned no images — returning original")
        return image

    # ── Step 6: extract result → PIL ──────────────────────────────────────────
    raw = getattr(images[0], "_image_bytes", None)
    if raw:
        return _PIL.open(io.BytesIO(raw)).convert("RGB")
    pil_result = getattr(images[0], "_pil_image", None)
    if pil_result:
        return pil_result.convert("RGB")

    logger.warning("EDIT_MODE_DISABLED: cannot extract image bytes — returning original")
    return image


# ── Generation fallback (hard failures in edit mode only) ─────────────────────

async def _generation_fallback(
    image_bytes: Optional[bytes],
    mime: str,
    prompt: str,
) -> dict:
    """
    Full-frame Imagen generation.  Called ONLY on:
      • asyncio.TimeoutError   (segmentation / inpainting hung)
      • Exception              (Imagen API hard failure)
    NOT called for segmentation failure or mask-area guards (those return
    the original image directly from _edit_person_identity).
    """
    logger.warning("EDIT_HARD_FALLBACK: using full-frame generation pipeline")
    try:
        result = await _get_pipeline().generate(
            user_prompt=prompt,
            source_image_bytes=image_bytes,
            image_mime_type=mime,
            enhance_prompt=False,
        )
        return {
            "edited_image_url": None,
            "edited_image_b64": result["image_b64"],
            "request_id":       result["model"],
            "original_prompt":  prompt,
            "enhanced_prompt":  result["enhanced_prompt"],
        }
    except PipelineError as exc:
        logger.error("Generation fallback failed [%s]: %s", exc.error_type.value, exc.message)
        raise RuntimeError(
            f"Image generation failed [{exc.error_type.value}]: {exc.message}"
        ) from exc


# ═══════════════════════════════════════════════════════════════════════════════
# Public API — called by main.py based on mode determined at the API layer
# ═══════════════════════════════════════════════════════════════════════════════

_EDIT_TIMEOUT_S = 30.0


async def run_edit_pipeline(
    image_bytes: bytes,
    prompt: str,
    image_content_type: str = "image/jpeg",
    *,
    image_strength: float = 0.22,
    guidance_scale: float = 4.5,
    seed: Optional[int] = None,
) -> dict:
    """
    MODE B — Edit pipeline.

    Flow: source image → PersonSegmenter → mask → Imagen inpainting.

    Fallback rules (per product spec):
        • segmentation failure   → return ORIGINAL IMAGE  (not generation)
        • mask area < 5 %        → return ORIGINAL IMAGE  (not generation)
        • mask area > 70 %       → clamp strength, continue edit
        • exception / timeout    → generation fallback    (EDIT_HARD_FALLBACK)

    Returns the same dict shape as run_generation_pipeline for unified handling
    in main.py.
    """
    import base64  # noqa: PLC0415

    mime = image_content_type if image_content_type.startswith("image/") else "image/jpeg"

    # Server-side clamp (belt-and-suspenders on top of dataclass validation)
    image_strength = max(0.1, min(0.35, image_strength))
    guidance_scale = max(3.0, min(7.0, guidance_scale))

    logger.info(
        "SYMPHONY_MODE=edit | size=%dKB | strength=%.2f | guidance=%.1f | "
        "seed=%s | prompt=%.120s",
        len(image_bytes) // 1024, image_strength, guidance_scale, seed, prompt,
    )

    try:
        params = ImageEditParams(
            image_strength=image_strength,
            guidance_scale=guidance_scale,
            seed=seed,
        )
    except ValueError as exc:
        logger.warning("ImageEditParams validation: %s — using defaults", exc)
        params = ImageEditParams()

    # Decode source image
    try:
        from PIL import Image as _PIL  # noqa: PLC0415
        source_pil = _PIL.open(io.BytesIO(image_bytes)).convert("RGB")
    except Exception as exc:
        logger.error("Failed to decode source image: %s", exc)
        raise RuntimeError(f"Invalid source image: {exc}") from exc

    # Run segmentation + inpainting in a thread with hard timeout
    try:
        edited_pil = await asyncio.wait_for(
            asyncio.to_thread(_edit_person_identity, source_pil, prompt, params),
            timeout=_EDIT_TIMEOUT_S,
        )
        out_buf = io.BytesIO()
        edited_pil.save(out_buf, format="JPEG", quality=95)
        return {
            "edited_image_url": None,
            "edited_image_b64": base64.b64encode(out_buf.getvalue()).decode(),
            "request_id":       f"{_EDIT_MODEL}/inpainting",
            "original_prompt":  prompt,
            "enhanced_prompt":  prompt,
        }

    except asyncio.TimeoutError:
        logger.warning(
            "EDIT_HARD_FALLBACK: timed out after %.0fs — falling back to generation",
            _EDIT_TIMEOUT_S,
        )
        return await _generation_fallback(image_bytes, mime, prompt)

    except PipelineError as exc:
        logger.error("Pipeline error [%s]: %s", exc.error_type.value, exc.message)
        raise RuntimeError(
            f"Image edit failed [{exc.error_type.value}]: {exc.message}"
        ) from exc

    except Exception as exc:
        logger.error(
            "EDIT_HARD_FALLBACK: edit failed (%s) — falling back to generation",
            exc, exc_info=True,
        )
        return await _generation_fallback(image_bytes, mime, prompt)


async def run_generation_pipeline(
    prompt: str,
    *,
    guidance_scale: float = 4.5,
    seed: Optional[int] = None,
) -> dict:
    """
    MODE A — Text-to-image generation pipeline.

    No source image.  Calls the Imagen 3 generation model directly.
    guidance_scale and seed are accepted for API consistency but the
    generation pipeline's ImagenClient handles its own parameter mapping.
    """
    logger.info(
        "SYMPHONY_MODE=generate | guidance=%.1f | seed=%s | prompt=%.120s",
        guidance_scale, seed, prompt,
    )
    try:
        result = await _get_pipeline().generate(
            user_prompt=prompt,
            source_image_bytes=None,
            image_mime_type="image/jpeg",
            enhance_prompt=False,
        )
        return {
            "edited_image_url": None,
            "edited_image_b64": result["image_b64"],
            "request_id":       result["model"],
            "original_prompt":  prompt,
            "enhanced_prompt":  result["enhanced_prompt"],
        }
    except PipelineError as exc:
        logger.error(
            "Generation pipeline error [%s]: %s", exc.error_type.value, exc.message
        )
        raise RuntimeError(
            f"Image generation failed [{exc.error_type.value}]: {exc.message}"
        ) from exc


async def download_nano_result(url: str) -> bytes:
    """Download a result image from a URL (used when edited_image_url is set)."""
    import httpx  # noqa: PLC0415
    async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as c:
        resp = await c.get(url)
        resp.raise_for_status()
        return resp.content
