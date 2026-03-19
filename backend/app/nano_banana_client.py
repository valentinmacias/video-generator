"""
Image editing client — Gemini 2.0 Flash (image generation / "Nano Banana 2")
─────────────────────────────────────────────────────────────────────────────
Uses gemini-2.0-flash-exp-image-generation via the standard API-key client.
Send the source image + text prompt, receive an edited image back.
"""
import base64
import logging

from google import genai
from google.genai import types

from .config import settings

logger = logging.getLogger(__name__)

_MODEL = "gemini-2.0-flash-preview-image-generation"


def _client() -> genai.Client:
    return genai.Client(api_key=settings.GOOGLE_API_KEY)


async def nano_edit_image(
    image_bytes: bytes,
    prompt: str,
    image_content_type: str = "image/jpeg",
    *,
    strength: float = 0.78,  # kept for API compatibility — unused
    mode: str = "edit",      # kept for API compatibility — unused
) -> dict:
    """
    Edit / swap an image using Gemini 2.0 Flash image generation.

    Returns dict with keys:
        edited_image_url : None
        edited_image_b64 : str  — Base-64 encoded result PNG
        request_id       : str
        original_prompt  : str
    """
    mime = image_content_type if image_content_type.startswith("image/") else "image/jpeg"

    logger.info(
        "Gemini 2.0 Flash image-edit request | size=%dKB | prompt=%.80s…",
        len(image_bytes) // 1024,
        prompt,
    )

    client = _client()

    response = client.models.generate_content(
        model=_MODEL,
        contents=[
            types.Content(
                role="user",
                parts=[
                    types.Part.from_bytes(data=image_bytes, mime_type=mime),
                    types.Part.from_text(text=prompt),
                ],
            )
        ],
        config=types.GenerateContentConfig(
            response_modalities=["IMAGE", "TEXT"],
        ),
    )

    # Find the image part in the response
    result_bytes: bytes | None = None
    for part in response.candidates[0].content.parts:
        if part.inline_data and part.inline_data.data:
            result_bytes = part.inline_data.data
            break

    if result_bytes is None:
        raise RuntimeError(
            "Gemini returned no image. The prompt may have been blocked by "
            "safety filters — try rephrasing it."
        )

    result_b64 = base64.b64encode(result_bytes).decode("utf-8")
    logger.info("Gemini image-edit complete | output_size=%dKB", len(result_bytes) // 1024)

    return {
        "edited_image_url": None,
        "edited_image_b64": result_b64,
        "request_id":       "gemini-2.0-flash-img",
        "original_prompt":  prompt,
    }


async def download_nano_result(url: str) -> bytes:
    """Download a result image from a URL (used when edited_image_url is set)."""
    import httpx
    async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as c:
        resp = await c.get(url)
        resp.raise_for_status()
        return resp.content
