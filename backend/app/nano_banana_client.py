"""
Nano Banana / Symphony Brand Swap — person-masked image editing.

Pipeline
--------
input image
    │
    ▼
PersonSegmenter.get_person_mask()   ← rembg u2net_human_seg (CPU, singleton)
    │  HxW uint8 mask
    ▼
safety guards                       ← area checks, strength clamping
    │
    ▼
Imagen edit_image()                 ← inpainting with mask (imagegeneration@006)
    │  edited image bytes
    ▼
return result dict

Public API (unchanged for main.py):
    nano_edit_image(image_bytes, prompt, ...) -> dict
    download_nano_result(url)                 -> bytes

Structured log events:
    SEGMENTATION_SUCCESS   — mask produced, edit mode active
    SEGMENTATION_FALLBACK  — mask failed, original image returned
    EDIT_MODE_ACTIVE       — Imagen inpainting call in progress
    EDIT_MODE_DISABLED     — mask area guard triggered, returning original
"""
from __future__ import annotations

import asyncio
import io
import logging
import threading
from typing import TYPE_CHECKING, Optional

# Heavy deps (numpy, Pillow, rembg, cv2) are imported lazily inside functions
# so a missing package does NOT prevent this module from loading and does NOT
# break the existing generation-pipeline fallback path.
if TYPE_CHECKING:
    from PIL import Image as PILImage

from .ai import ImageGenerationPipeline, PipelineError
from .ai.image_edit_params import ImageEditParams
from .ai.segmentation import get_segmenter

logger = logging.getLogger(__name__)

# ── Imagen edit model singleton ────────────────────────────────────────────────
# imagegeneration@006 = Imagen 2.x, the documented model that supports
# edit_image() inpainting.  We keep this separate from the generation pipeline's
# imagen-3.0-generate-002 which is text-to-image only.
_EDIT_MODEL = "imagegeneration@006"

_edit_model_lock = threading.Lock()
_edit_model = None          # vertexai.preview.vision_models.ImageGenerationModel


def _get_edit_model():
    """Return the Imagen edit model (loads once, thread-safe)."""
    global _edit_model
    if _edit_model is not None:
        return _edit_model
    with _edit_model_lock:
        if _edit_model is not None:
            return _edit_model
        # vertexai.init() has already been called by the generation pipeline at
        # startup — we can safely load the model here.
        from vertexai.preview.vision_models import ImageGenerationModel  # noqa: PLC0415
        _edit_model = ImageGenerationModel.from_pretrained(_EDIT_MODEL)
        logger.info("Imagen edit model loaded: %s", _EDIT_MODEL)
        return _edit_model


# ── Generation pipeline singleton (fallback) ───────────────────────────────────
_pipeline: Optional[ImageGenerationPipeline] = None


def _get_pipeline() -> ImageGenerationPipeline:
    global _pipeline
    if _pipeline is None:
        _pipeline = ImageGenerationPipeline.default()
    return _pipeline


# ── Mask → PNG bytes helper ────────────────────────────────────────────────────

def _mask_to_png_bytes(mask) -> bytes:
    """Convert a HxW uint8 mask to grayscale PNG bytes for Imagen."""
    from PIL import Image as _PIL  # noqa: PLC0415
    pil_mask = _PIL.fromarray(mask, mode="L")
    buf = io.BytesIO()
    pil_mask.save(buf, format="PNG")
    return buf.getvalue()


# ── Core edit function ─────────────────────────────────────────────────────────

def edit_person_identity(
    image,
    prompt: str,
    params: ImageEditParams,
):
    """
    Edit the person region in *image* using Imagen inpainting.

    Steps
    -----
    1. PIL → numpy RGB
    2. PersonSegmenter.get_person_mask() → uint8 HxW mask
    3. Safety guards (area checks, strength clamping)
    4. mask → PNG bytes
    5. Imagen edit_image() with inpainting-insert
    6. Return edited PIL image (background preserved)

    Falls back to *image* unchanged if:
      - mask is None (segmentation failed)
      - mask covers < 5 % of the frame
      - Imagen API call fails

    This function is *synchronous* — wrap in asyncio.to_thread() for async use.
    """
    h, w = image.height, image.width
    total_px = h * w

    # ── Step 1: PIL → numpy RGB ────────────────────────────────────────────────
    import numpy as np  # noqa: PLC0415 — lazy to avoid top-level import failure
    img_rgb = np.array(image.convert("RGB"))

    # ── Step 2: person segmentation ───────────────────────────────────────────
    segmenter = get_segmenter()
    mask = segmenter.get_person_mask(img_rgb)

    if mask is None:
        logger.warning(
            "SEGMENTATION_FALLBACK: no mask produced — returning original image"
        )
        return image

    # ── Step 3: safety guards ─────────────────────────────────────────────────
    person_px = int((mask > 127).sum())
    coverage = person_px / total_px

    # Guard A: person too small → skip edit entirely
    if coverage < 0.05:
        logger.warning(
            "EDIT_MODE_DISABLED: mask coverage %.1f%% < 5%% threshold — "
            "returning original image",
            coverage * 100,
        )
        return image

    # Guard B: person fills almost whole frame → reduce strength
    effective_strength = params.image_strength
    if coverage > 0.70:
        effective_strength = min(effective_strength, 0.18)
        logger.info(
            "Safety guard: mask coverage %.1f%% > 70%% → clamped strength to %.2f",
            coverage * 100,
            effective_strength,
        )

    # Guard C: caller passed an out-of-range strength (extra belt-and-suspenders)
    if effective_strength > 0.4:
        effective_strength = 0.25
        logger.info(
            "Safety guard: image_strength > 0.4 → forced to 0.25"
        )

    logger.info(
        "EDIT_MODE_ACTIVE: coverage=%.1f%% | strength=%.2f | guidance=%.1f | seed=%s",
        coverage * 100,
        effective_strength,
        params.guidance_scale,
        params.seed,
    )

    # ── Step 4: mask → PNG bytes for Imagen ───────────────────────────────────
    mask_bytes = _mask_to_png_bytes(mask)

    # ── Step 5: Imagen edit_image() ───────────────────────────────────────────
    from vertexai.preview.vision_models import Image as VertexImage  # noqa: PLC0415

    base_buf = io.BytesIO()
    image.convert("RGB").save(base_buf, format="PNG")
    base_bytes = base_buf.getvalue()

    model = _get_edit_model()
    response = model.edit_image(
        prompt=prompt,
        base_image=VertexImage(image_bytes=base_bytes),
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
        logger.warning(
            "EDIT_MODE_DISABLED: Imagen returned no images — returning original"
        )
        return image

    # ── Step 6: extract result bytes → PIL ────────────────────────────────────
    raw = getattr(images[0], "_image_bytes", None)
    if not raw:
        pil_result = getattr(images[0], "_pil_image", None)
        if pil_result is None:
            logger.warning("EDIT_MODE_DISABLED: cannot extract bytes — returning original")
            return image
        return pil_result.convert("RGB")

    from PIL import Image as _PIL  # noqa: PLC0415
    return _PIL.open(io.BytesIO(raw)).convert("RGB")


# ── Public async API ───────────────────────────────────────────────────────────

async def nano_edit_image(
    image_bytes: bytes,
    prompt: str,
    image_content_type: str = "image/jpeg",
    *,
    image_strength: float = 0.22,
    guidance_scale: float = 4.5,
    seed: Optional[int] = None,
    # Legacy kwargs — kept for call-site compatibility
    strength: float = 0.78,
    mode: str = "edit",
) -> dict:
    """
    Brand-swap an image using person-masked Imagen inpainting.

    Flow
    ----
    1. Decode image bytes → PIL
    2. PersonSegmenter → binary mask
    3. Safety guards (area, strength clamping)
    4. Imagen edit_image() → inpaint person region only
    5. Return base64-encoded result

    Falls back to full-frame Imagen generation if segmentation or edit fails.

    Returns
    -------
    {
        "edited_image_url":  None,   # caller uploads to GCS
        "edited_image_b64":  str,    # base64 result image
        "request_id":        str,    # model identifier
        "original_prompt":   str,
        "enhanced_prompt":   str,
    }

    Frontend parameters (passed from POST body):
        image_strength : 0.1–0.35  (server-side clamped)
        guidance_scale : 3–7
        seed           : int or null
    """
    import base64  # noqa: PLC0415

    mime = image_content_type if image_content_type.startswith("image/") else "image/jpeg"

    # Server-side clamping (belt-and-suspenders on top of dataclass validation)
    image_strength = max(0.1, min(0.35, image_strength))
    guidance_scale = max(3.0, min(7.0, guidance_scale))

    logger.info(
        "nano_edit_image | size=%dKB | mime=%s | strength=%.2f | guidance=%.1f | "
        "seed=%s | prompt=%.120s",
        len(image_bytes) // 1024,
        mime,
        image_strength,
        guidance_scale,
        seed,
        prompt,
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

    # ── Decode source image ────────────────────────────────────────────────────
    try:
        from PIL import Image as _PIL  # noqa: PLC0415
        source_pil = _PIL.open(io.BytesIO(image_bytes)).convert("RGB")
    except Exception as exc:
        logger.error("Failed to decode source image: %s", exc)
        raise RuntimeError(f"Invalid source image: {exc}") from exc

    # ── Attempt masked edit (runs in thread — segmentation + Imagen are sync) ──
    # Hard 30-second timeout guards against rembg model download on first use
    # or any other blocking operation inside the thread.
    _EDIT_TIMEOUT_S = 30.0
    try:
        edited_pil = await asyncio.wait_for(
            asyncio.to_thread(edit_person_identity, source_pil, prompt, params),
            timeout=_EDIT_TIMEOUT_S,
        )

        # Encode result
        out_buf = io.BytesIO()
        edited_pil.save(out_buf, format="JPEG", quality=95)
        result_b64 = base64.b64encode(out_buf.getvalue()).decode()

        return {
            "edited_image_url": None,
            "edited_image_b64": result_b64,
            "request_id":       f"{_EDIT_MODEL}/inpainting",
            "original_prompt":  prompt,
            "enhanced_prompt":  prompt,   # raw prompt used unchanged
        }

    except PipelineError as exc:
        logger.error(
            "Pipeline error [%s] retryable=%s: %s",
            exc.error_type.value,
            exc.retryable,
            exc.message,
        )
        raise RuntimeError(
            f"Image edit failed [{exc.error_type.value}]: {exc.message}"
        ) from exc

    except asyncio.TimeoutError:
        logger.warning(
            "SEGMENTATION_FALLBACK: edit_person_identity timed out after %.0fs "
            "— falling back to full-frame generation",
            _EDIT_TIMEOUT_S,
        )
        # fall through to fallback below
        return await _run_generation_fallback(image_bytes, mime, prompt)

    except Exception as exc:
        logger.error(
            "Edit-mode failed (%s) — falling back to full-frame generation", exc,
            exc_info=True,
        )
        return await _run_generation_fallback(image_bytes, mime, prompt)


async def _run_generation_fallback(
    image_bytes: bytes,
    mime: str,
    prompt: str,
) -> dict:
    """Full-frame Imagen generation — original pre-masking behaviour."""
    logger.warning("SEGMENTATION_FALLBACK: using full-frame generation pipeline")
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
    except PipelineError as exc2:
        logger.error(
            "Fallback pipeline error [%s]: %s",
            exc2.error_type.value,
            exc2.message,
        )
        raise RuntimeError(
            f"Image generation failed [{exc2.error_type.value}]: {exc2.message}"
        ) from exc2


async def download_nano_result(url: str) -> bytes:
    """Download a result image from a URL (used when edited_image_url is set)."""
    import httpx  # noqa: PLC0415
    async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as c:
        resp = await c.get(url)
        resp.raise_for_status()
        return resp.content
