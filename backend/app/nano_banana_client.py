"""
Image editing client — Google Imagen 3 (Symphony Video Creator flow)
────────────────────────────────────────────────────────────────────
Uses the google-genai SDK with GOOGLE_API_KEY (already configured).
Handles face / ethnicity / clothes swap via Imagen 3's edit_image API.
"""
import base64
import logging
from typing import Optional

from google import genai
from google.genai import types

from .config import settings

logger = logging.getLogger(__name__)

# Imagen 3 editing model
_IMAGEN_EDIT_MODEL = "imagen-3.0-capability-001"


def _client() -> genai.Client:
    return genai.Client(api_key=settings.GOOGLE_API_KEY)


async def nano_edit_image(
    image_bytes: bytes,
    prompt: str,
    image_content_type: str = "image/jpeg",
    *,
    strength: float = 0.78,  # kept for API compatibility — unused by Imagen
    mode: str = "edit",      # "edit" | "swap" — both use EDIT_MODE_DEFAULT
) -> dict:
    """
    Edit / swap an image using Google Imagen 3.

    Args:
        image_bytes        : Raw bytes of the source image.
        prompt             : Editing instruction, e.g.
                             "Change the white t-shirt to a Nike dri-fit in coral red".
        image_content_type : MIME type of the source image (image/jpeg or image/png).
        strength           : Unused — kept for call-site compatibility.
        mode               : Unused — kept for call-site compatibility.

    Returns dict with keys:
        edited_image_url   : None  (Imagen returns bytes, not a hosted URL)
        edited_image_b64   : str   — Base-64 encoded result PNG
        request_id         : str   — placeholder
        original_prompt    : str   — echo of the prompt sent
    """
    mime = image_content_type if image_content_type.startswith("image/") else "image/jpeg"

    logger.info(
        "Imagen 3 edit request | size=%dKB | prompt=%.80s…",
        len(image_bytes) // 1024,
        prompt,
    )

    client = _client()

    reference_image = types.RawReferenceImage(
        reference_id=1,
        reference_image=types.Image(
            image_bytes=image_bytes,
            mime_type=mime,
        ),
    )

    response = client.models.edit_image(
        model=_IMAGEN_EDIT_MODEL,
        prompt=prompt,
        reference_images=[reference_image],
        config=types.EditImageConfig(
            edit_mode=types.EditMode.EDIT_MODE_DEFAULT,
            number_of_images=1,
            safety_filter_level=types.SafetyFilterLevel.BLOCK_NONE,
            person_generation=types.PersonGeneration.ALLOW_ADULT,
        ),
    )

    if not response.generated_images:
        raise RuntimeError(
            "Imagen 3 returned no images. The prompt may have been blocked by "
            "safety filters — try rephrasing it."
        )

    img = response.generated_images[0].image
    # Imagen returns raw bytes; encode to base64 for transport
    result_b64 = base64.b64encode(img.image_bytes).decode("utf-8")

    logger.info("Imagen 3 edit complete | output_size=%dKB", len(img.image_bytes) // 1024)

    return {
        "edited_image_url": None,
        "edited_image_b64": result_b64,
        "request_id":       "imagen3",
        "original_prompt":  prompt,
    }


async def download_nano_result(url: str) -> bytes:
    """
    Download a result image from a URL (used when edited_image_url is set).
    Not used by the Imagen path (which always returns bytes directly).
    """
    import httpx
    async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        return resp.content
