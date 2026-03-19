"""
Image editing client — Gemini ("Nano Banana 2")
────────────────────────────────────────────────
Primary:  gemini-2.0-flash-001   (stable 2026 release, supports IMAGE modality)
Fallback: gemini-1.5-pro         (higher reasoning; IMAGE modality fallback)

Accepts a source image + natural-language prompt and returns an edited image.
Optimised for ethnicity / face / clothes swap prompts.
"""
import base64
import logging
from typing import Optional

from google import genai
from google.genai import types
from google.genai.errors import ClientError

from .config import settings

logger = logging.getLogger(__name__)

_PRIMARY_MODEL  = "gemini-2.0-flash-001"
_FALLBACK_MODEL = "gemini-1.5-pro"

# ── System instruction ─────────────────────────────────────────────────────────
_SYSTEM_INSTRUCTION = (
    "You are a professional photo retoucher and digital artist. "
    "Apply ONLY the changes described in the user's prompt. "
    "Preserve everything else exactly: composition, pose, lighting direction, "
    "background, shadows, depth-of-field, image resolution, and aspect ratio. "
    "Render all human subjects with photorealistic natural skin tone, "
    "respectful and dignified representation, and zero artifacts. "
    "Never alter text, logos, or objects that are not mentioned in the prompt."
)

# Phrases appended to every user prompt to improve safety pass-through and
# output quality for ethnicity / face / clothes edits.
_PROMPT_SUFFIX = (
    " Photorealistic natural skin tone, respectful representation, "
    "same pose and lighting preserved, zero artifacts, high fidelity."
)


def _client() -> genai.Client:
    return genai.Client(api_key=settings.GOOGLE_API_KEY)


def _enrich_prompt(user_prompt: str) -> str:
    """
    Append quality/safety phrases to the user prompt.
    Avoids double-appending if the user already included key phrases.
    """
    p = user_prompt.strip().rstrip(".")
    if "photorealistic" not in p.lower():
        p += _PROMPT_SUFFIX
    return p


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


def _call_model(client: genai.Client, model: str, contents, config) -> Optional[bytes]:
    """
    Call generate_content and return image bytes, or None on failure.
    Logs the outcome; does NOT re-raise so the caller can try the fallback.
    """
    try:
        response = client.models.generate_content(
            model=model,
            contents=contents,
            config=config,
        )
        result = _extract_image_bytes(response)
        if result is None:
            logger.warning(
                "model=%s returned no image | finish_reason=%s",
                model,
                _finish_reason_label(response),
            )
        return result
    except ClientError as exc:
        logger.warning(
            "model=%s ClientError %s — %s",
            model,
            getattr(exc, "status_code", "?"),
            exc,
        )
        return None
    except Exception as exc:
        logger.warning("model=%s unexpected error — %s", model, exc)
        return None


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
        edited_image_url : None  (bytes returned inline; upload handled upstream)
        edited_image_b64 : str   — Base-64 encoded result PNG
        request_id       : str   — model identifier that succeeded
        original_prompt  : str   — the original prompt (pre-enrichment)
    """
    mime = image_content_type if image_content_type.startswith("image/") else "image/jpeg"
    enriched_prompt = _enrich_prompt(prompt)

    logger.info(
        "Gemini image-edit | primary=%s | size=%dKB | prompt=%.140s",
        _PRIMARY_MODEL,
        len(image_bytes) // 1024,
        enriched_prompt,
    )

    client = _client()

    contents = [
        types.Content(
            role="user",
            parts=[
                types.Part.from_bytes(data=image_bytes, mime_type=mime),
                types.Part.from_text(text=enriched_prompt),
            ],
        )
    ]

    config = types.GenerateContentConfig(
        system_instruction=_SYSTEM_INSTRUCTION,
        response_modalities=["IMAGE", "TEXT"],
        temperature=1,
        top_p=0.95,
    )

    # ── Primary ────────────────────────────────────────────────────────────────
    result_bytes = _call_model(client, _PRIMARY_MODEL, contents, config)
    model_used   = _PRIMARY_MODEL

    # ── Fallback ───────────────────────────────────────────────────────────────
    if result_bytes is None:
        logger.info("Primary failed — trying fallback model=%s", _FALLBACK_MODEL)
        result_bytes = _call_model(client, _FALLBACK_MODEL, contents, config)
        model_used   = _FALLBACK_MODEL

    if result_bytes is None:
        raise RuntimeError(
            "Image editing failed: both models returned no image. "
            "The prompt may have triggered safety filters — try adding "
            "'photorealistic, respectful representation' to the description. "
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
