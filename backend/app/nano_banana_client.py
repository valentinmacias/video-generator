"""
Nano Banana / Symphony Brand Swap — thin delegation layer.

All generation logic lives in app.ai (Vertex AI Gemini + Imagen 3 pipeline).
This module keeps the same public API that main.py expects:

    nano_edit_image(image_bytes, prompt, ...) -> dict
    download_nano_result(url)                 -> bytes
"""
from __future__ import annotations

import logging
from typing import Optional

from .ai import ImageGenerationPipeline, PipelineError

logger = logging.getLogger(__name__)

# Module-level singleton — initialised on first call (cold-start mitigation)
_pipeline: Optional[ImageGenerationPipeline] = None


def _get_pipeline() -> ImageGenerationPipeline:
    global _pipeline
    if _pipeline is None:
        _pipeline = ImageGenerationPipeline.default()
    return _pipeline


async def nano_edit_image(
    image_bytes: bytes,
    prompt: str,
    image_content_type: str = "image/jpeg",
    *,
    strength: float = 0.78,   # kept for call-site compatibility — unused
    mode: str = "edit",        # kept for call-site compatibility — unused
) -> dict:
    """
    Brand-swap an image using the Vertex AI Gemini + Imagen 3 pipeline.

    Flow
    ----
    1. GeminiClient.describe_image(source)   — scene context
    2. GeminiClient.enhance_prompt(swap)     — Imagen-optimised prompt
    3. ImagenClient.generate_image(prompt)   — final image bytes

    Returns
    -------
    {
        "edited_image_url":  None,          # upstream uploads to GCS
        "edited_image_b64":  str,           # base-64 result image
        "request_id":        str,           # Imagen model name used
        "original_prompt":   str,           # original user prompt
        "enhanced_prompt":   str,           # Gemini-enhanced prompt sent to Imagen
    }

    Raises RuntimeError (wrapping PipelineError details) on unrecoverable failure.
    """
    mime = image_content_type if image_content_type.startswith("image/") else "image/jpeg"

    logger.info(
        "nano_edit_image | size=%dKB | mime=%s | prompt=%.120s",
        len(image_bytes) // 1024,
        mime,
        prompt,
    )

    try:
        result = await _get_pipeline().generate(
            user_prompt=prompt,
            source_image_bytes=image_bytes,
            image_mime_type=mime,
        )
    except PipelineError as exc:
        logger.error(
            "Pipeline error [%s] retryable=%s: %s",
            exc.error_type.value,
            exc.retryable,
            exc.message,
        )
        raise RuntimeError(
            f"Image generation failed [{exc.error_type.value}]: {exc.message}"
        ) from exc
    except Exception as exc:
        logger.error("Unexpected pipeline error: %s", exc, exc_info=True)
        raise RuntimeError(f"Image generation failed: {exc}") from exc

    return {
        "edited_image_url": None,
        "edited_image_b64": result["image_b64"],
        "request_id":       result["model"],
        "original_prompt":  prompt,
        "enhanced_prompt":  result["enhanced_prompt"],
    }


async def download_nano_result(url: str) -> bytes:
    """Download a result image from a URL (used when edited_image_url is set)."""
    import httpx
    async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as c:
        resp = await c.get(url)
        resp.raise_for_status()
        return resp.content
