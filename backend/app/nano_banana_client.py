"""
Image editing client — Gemini ("Nano Banana 2")
────────────────────────────────────────────────
Primary:  gemini-2.0-flash-exp        (supports IMAGE response modality)
Fallback: gemini-1.5-flash            (text-only; used to surface a cleaner error
                                       if the primary model is unavailable)

Accepts a source image + natural-language prompt and returns an edited image.
Works well for prompts like:
  "Change ethnicity to Black American, same exact pose/lighting/background,
   new face and outfit details, photoreal UGC iPhone style, zero artifacts"
"""
import base64
import logging
from typing import Optional

from google import genai
from google.genai import types
from google.genai.errors import ClientError

from .config import settings

logger = logging.getLogger(__name__)

_PRIMARY_MODEL  = "gemini-2.0-flash-exp"
_FALLBACK_MODEL = "gemini-1.5-flash"

# System instruction that improves fidelity for face/ethnicity/clothes swaps
_SYSTEM_INSTRUCTION = (
    "You are a professional photo editor. "
    "When asked to edit an image, apply ONLY the requested changes. "
    "Preserve everything else: composition, lighting, pose, background, "
    "shadows, image quality, and aspect ratio. "
    "Output a photorealistic result with zero artifacts."
)


def _client() -> genai.Client:
    return genai.Client(api_key=settings.GOOGLE_API_KEY)


def _extract_image_bytes(response) -> Optional[bytes]:
    """Return the first image bytes found in a generate_content response."""
    try:
        for part in response.candidates[0].content.parts:
            if part.inline_data and part.inline_data.data:
                return part.inline_data.data
    except (IndexError, AttributeError):
        pass
    return None


def _finish_reason_label(response) -> str:
    try:
        return str(response.candidates[0].finish_reason)
    except Exception:
        return "UNKNOWN"


async def nano_edit_image(
    image_bytes: bytes,
    prompt: str,
    image_content_type: str = "image/jpeg",
    *,
    strength: float = 0.78,  # kept for API compatibility — unused
    mode: str = "edit",      # kept for API compatibility — unused
) -> dict:
    """
    Edit / swap an image using Gemini.

    Args:
        image_bytes        : Raw bytes of the source image.
        prompt             : Natural-language editing instruction.
        image_content_type : MIME type of the source image.
        strength           : Unused — kept for call-site compatibility.
        mode               : Unused — kept for call-site compatibility.

    Returns dict with keys:
        edited_image_url : None  (Gemini returns bytes; upload handled upstream)
        edited_image_b64 : str   — Base-64 encoded result PNG
        request_id       : str   — model identifier used
        original_prompt  : str   — echo of the prompt sent
    """
    mime = image_content_type if image_content_type.startswith("image/") else "image/jpeg"
    client = _client()

    logger.info(
        "Gemini image-edit request | model=%s | size=%dKB | prompt=%.120s",
        _PRIMARY_MODEL,
        len(image_bytes) // 1024,
        prompt,
    )

    contents = [
        types.Content(
            role="user",
            parts=[
                types.Part.from_bytes(data=image_bytes, mime_type=mime),
                types.Part.from_text(text=prompt),
            ],
        )
    ]

    config = types.GenerateContentConfig(
        system_instruction=_SYSTEM_INSTRUCTION,
        response_modalities=["IMAGE", "TEXT"],
        temperature=1,
        top_p=0.95,
    )

    # ── Attempt primary model ──────────────────────────────────────────────────
    result_bytes: Optional[bytes] = None
    model_used = _PRIMARY_MODEL

    try:
        response = client.models.generate_content(
            model=_PRIMARY_MODEL,
            contents=contents,
            config=config,
        )
        result_bytes = _extract_image_bytes(response)
        if result_bytes is None:
            finish = _finish_reason_label(response)
            logger.warning(
                "Gemini primary returned no image | finish_reason=%s | "
                "prompt=%.120s",
                finish,
                prompt,
            )

    except ClientError as exc:
        status = getattr(exc, "status_code", None)
        logger.warning(
            "Gemini primary model failed (%s %s) — trying fallback",
            status,
            exc,
        )

    # ── Fallback: gemini-1.5-flash ─────────────────────────────────────────────
    # gemini-1.5-flash does not support IMAGE output modality; if we reach here
    # it means the primary is unavailable. We surface a clear error rather than
    # a silent failure.
    if result_bytes is None:
        model_used = _FALLBACK_MODEL
        logger.info("Trying fallback model: %s", _FALLBACK_MODEL)
        try:
            fallback_config = types.GenerateContentConfig(
                system_instruction=_SYSTEM_INSTRUCTION,
                response_modalities=["IMAGE", "TEXT"],
                temperature=1,
                top_p=0.95,
            )
            fb_response = client.models.generate_content(
                model=_FALLBACK_MODEL,
                contents=contents,
                config=fallback_config,
            )
            result_bytes = _extract_image_bytes(fb_response)
            if result_bytes is None:
                finish = _finish_reason_label(fb_response)
                logger.warning(
                    "Gemini fallback also returned no image | finish_reason=%s",
                    finish,
                )
        except ClientError as exc:
            logger.error("Gemini fallback model also failed: %s", exc)

    if result_bytes is None:
        raise RuntimeError(
            "Image editing failed: Gemini returned no image. "
            "The prompt may have triggered safety filters — try rephrasing. "
            f"(primary={_PRIMARY_MODEL}, fallback={_FALLBACK_MODEL})"
        )

    result_b64 = base64.b64encode(result_bytes).decode("utf-8")
    logger.info(
        "Gemini image-edit complete | model=%s | output_size=%dKB",
        model_used,
        len(result_bytes) // 1024,
    )

    return {
        "edited_image_url": None,
        "edited_image_b64": result_b64,
        "request_id":       model_used,
        "original_prompt":  prompt,
    }


async def download_nano_result(url: str) -> bytes:
    """Download a result image from a URL (used when edited_image_url is set)."""
    import httpx
    async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as c:
        resp = await c.get(url)
        resp.raise_for_status()
        return resp.content
