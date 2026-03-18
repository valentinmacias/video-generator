"""
Google Imagen 3 Image Generation Client

Handles synchronous image generation via the GenAI SDK.
Unlike Veo, Imagen returns results immediately — no polling needed.
"""
import asyncio
import logging
from typing import Optional, List
from google import genai
from google.genai import types as genai_types
from .config import settings
from .models import ImageParams, ImageStyle, Quality, AspectRatio

logger = logging.getLogger(__name__)

IMAGEN_MODEL = "imagen-3.0-generate-001"

_imagen_client: Optional[genai.Client] = None


def get_imagen_client() -> genai.Client:
    global _imagen_client
    if _imagen_client is None:
        _imagen_client = genai.Client(api_key=settings.GOOGLE_API_KEY)
    return _imagen_client


# ── Style hint builder ─────────────────────────────────────────────────────────

_STYLE_PHRASES = {
    ImageStyle.PHOTOREALISTIC: "photorealistic, ultra-detailed photography, true-to-life",
    ImageStyle.CINEMATIC:      "cinematic film quality, dramatic composition, movie still",
    ImageStyle.ARTISTIC:       "fine art, painterly aesthetic, expressive composition",
    ImageStyle.COMMERCIAL:     "polished commercial photography, brand-safe, clean",
    ImageStyle.ANIME:          "anime art style, vibrant colours, sharp linework",
    ImageStyle.ILLUSTRATION:   "detailed digital illustration, rich colours",
    ImageStyle.THREE_D_RENDER: "3D rendered, CGI quality, realistic materials",
}

_QUALITY_PHRASES = {
    Quality.STANDARD: "",
    Quality.HIGH:     "high quality, professional, sharp details",
    Quality.ULTRA:    "ultra high quality, 8K resolution, masterpiece, highly detailed",
}

# Imagen 3 only accepts a subset of aspect ratios
_ASPECT_RATIO_MAP = {
    AspectRatio.WIDE:      "16:9",
    AspectRatio.PORTRAIT:  "9:16",
    AspectRatio.SQUARE:    "1:1",
    AspectRatio.ULTRAWIDE: "16:9",  # not natively supported → closest match
    AspectRatio.CLASSIC:   "4:3",
}


def build_image_style_suffix(params: ImageParams) -> str:
    """Convert ImageParams into a natural-language prompt suffix for Imagen."""
    parts = [
        _STYLE_PHRASES.get(params.style, ""),
        _QUALITY_PHRASES.get(params.quality, ""),
    ]
    if params.negative_prompt:
        # Negative prompts are passed separately to the API, but we note them
        # in the suffix too as belt-and-suspenders guidance.
        pass

    return ", ".join(p for p in parts if p)


# ── Image generation ───────────────────────────────────────────────────────────

async def generate_images(
    prompt: str,
    params: ImageParams,
    brand_instructions: Optional[str] = None,
) -> List[bytes]:
    """
    Generate images with Imagen 3. Returns a list of raw image bytes.
    This is synchronous at the Imagen API level; we run it in a thread
    so it doesn't block the async event loop.

    Args:
        prompt:             The (optionally enhanced) prompt.
        params:             Image generation parameters.
        brand_instructions: Optional brand style context prepended to the prompt.

    Returns:
        List of image bytes (one per generated image).
    """
    client = get_imagen_client()

    # Build final prompt with brand context + style hints
    segments = []
    if brand_instructions:
        segments.append(f"Brand style: {brand_instructions}.")
    segments.append(prompt)
    style_suffix = build_image_style_suffix(params)
    if style_suffix:
        segments.append(style_suffix)
    final_prompt = " ".join(segments)

    aspect = _ASPECT_RATIO_MAP.get(params.aspect_ratio, "16:9")

    config = genai_types.GenerateImagesConfig(
        number_of_images=params.number_of_images,
        aspect_ratio=aspect,
        output_mime_type="image/jpeg",
        **({"seed": params.seed} if params.seed is not None else {}),
        **({"negative_prompt": params.negative_prompt} if params.negative_prompt else {}),
    )

    logger.info(
        f"Starting Imagen generation | model={IMAGEN_MODEL} "
        f"| n={params.number_of_images} | aspect={aspect} "
        f"| prompt={final_prompt[:80]}…"
    )

    def _sync_generate() -> List[bytes]:
        response = client.models.generate_images(
            model=IMAGEN_MODEL,
            prompt=final_prompt,
            config=config,
        )
        results = []
        for img in response.generated_images:
            if img.image and img.image.image_bytes:
                results.append(img.image.image_bytes)
        return results

    try:
        image_bytes_list = await asyncio.to_thread(_sync_generate)
        logger.info(f"Imagen generated {len(image_bytes_list)} image(s)")
        return image_bytes_list

    except Exception as e:
        logger.error(f"Imagen generation failed: {e}")
        raise
