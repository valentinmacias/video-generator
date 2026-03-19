"""
Image editing client — Imagen 3 + Gemini 2.5 Pro
──────────────────────────────────────────────────
Step 1 — gemini-2.5-pro:   Analyse the source image and produce a detailed
                            scene description (composition, lighting, pose,
                            colours, background, subject details).
Step 2 — imagen-3.0-generate-002: Generate a new image using a prompt that
                            merges the scene description with the user's
                            brand-swap instruction.

This two-step approach is required because Imagen 3 is a text-to-image model
(no image-input / inpainting via the standard AI-Studio API key).
"""
import base64
import logging
from typing import Optional

from google import genai
from google.genai import types
from google.genai.errors import ClientError

from .config import settings

logger = logging.getLogger(__name__)

_DESCRIBE_MODEL = "gemini-2.5-pro"
_IMAGEN_MODEL   = "imagen-3.0-generate-002"

# ── Gemini system prompt: extract a rich scene description ─────────────────────
_DESCRIBE_SYSTEM = (
    "You are a professional photo analyst. "
    "Describe the image in precise, visual terms suitable for re-generating it "
    "with a text-to-image model. Include: scene setting, background, lighting "
    "direction and quality, camera angle and distance, subject pose, clothing "
    "details, colours, textures, and overall mood. "
    "Be exhaustive but concise — one dense paragraph, no bullet points."
)

# ── Safety / quality phrases appended to the Imagen prompt ────────────────────
_PROMPT_SUFFIX = (
    " Photorealistic natural skin tone, respectful and dignified representation, "
    "same pose and lighting preserved, zero artifacts, high fidelity, "
    "photoreal UGC iPhone style."
)


def _client() -> genai.Client:
    return genai.Client(api_key=settings.GOOGLE_API_KEY)


def _enrich_swap_prompt(user_prompt: str) -> str:
    """Append quality/safety phrases unless the user already included them."""
    p = user_prompt.strip().rstrip(".")
    if "photorealistic" not in p.lower():
        p += _PROMPT_SUFFIX
    return p


def _describe_image(
    client: genai.Client,
    image_bytes: bytes,
    mime: str,
) -> Optional[str]:
    """
    Use gemini-2.5-pro to produce a rich scene description of the source image.
    Returns the description string, or None on failure.
    """
    try:
        response = client.models.generate_content(
            model=_DESCRIBE_MODEL,
            contents=[
                types.Content(
                    role="user",
                    parts=[
                        types.Part.from_bytes(data=image_bytes, mime_type=mime),
                        types.Part.from_text(
                            text=(
                                "Describe this image in full visual detail so it can "
                                "be faithfully recreated by a text-to-image model. "
                                "Include scene, background, lighting, pose, clothing, "
                                "colours, and mood. One dense paragraph."
                            )
                        ),
                    ],
                )
            ],
            config=types.GenerateContentConfig(
                system_instruction=_DESCRIBE_SYSTEM,
                temperature=0.2,
            ),
        )
        desc = response.text.strip() if response.text else None
        if desc:
            logger.info(
                "Scene description (%d chars): %.200s…",
                len(desc),
                desc,
            )
        else:
            logger.warning("gemini-2.5-pro returned no description text")
        return desc
    except ClientError as exc:
        logger.warning("Description step failed (ClientError): %s", exc)
        return None
    except Exception as exc:
        logger.warning("Description step failed: %s", exc)
        return None


def _build_imagen_prompt(description: Optional[str], swap_instruction: str) -> str:
    """
    Combine the scene description and the user's swap instruction into a
    single, coherent Imagen prompt.
    """
    enriched = _enrich_swap_prompt(swap_instruction)
    if description:
        return (
            f"{enriched}. "
            f"Full scene context: {description}"
        )
    # No description available — fall back to the swap instruction alone
    logger.warning("No scene description — generating from swap instruction only")
    return enriched


def _generate_with_imagen(client: genai.Client, prompt: str) -> Optional[bytes]:
    """
    Call imagen-3.0-generate-002 and return the first image's bytes, or None.
    """
    try:
        response = client.models.generate_images(
            model=_IMAGEN_MODEL,
            prompt=prompt,
            config=types.GenerateImagesConfig(
                number_of_images=1,
                safety_filter_level="block_some",
                person_generation="allow_adult",
            ),
        )
        images = response.generated_images
        if images and images[0].image and images[0].image.image_bytes:
            return images[0].image.image_bytes
        logger.warning("Imagen returned no image bytes")
        return None
    except ClientError as exc:
        logger.warning(
            "Imagen ClientError %s — %s",
            getattr(exc, "status_code", "?"),
            exc,
        )
        return None
    except Exception as exc:
        logger.warning("Imagen unexpected error — %s", exc)
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
    Brand-swap an image: analyse with Gemini 2.5 Pro, generate with Imagen 3.

    Args:
        image_bytes        : Raw bytes of the source image.
        prompt             : Natural-language swap instruction.
        image_content_type : MIME type of the source image.
        strength           : Unused — kept for call-site compatibility.
        mode               : Unused — kept for call-site compatibility.

    Returns dict with keys:
        edited_image_url : None  (bytes returned inline)
        edited_image_b64 : str   — Base-64 encoded result PNG
        request_id       : str   — model that generated the image
        original_prompt  : str   — original user prompt (pre-enrichment)
    """
    mime = image_content_type if image_content_type.startswith("image/") else "image/jpeg"
    client = _client()

    logger.info(
        "Brand-swap | describe=%s | generate=%s | size=%dKB | prompt=%.120s",
        _DESCRIBE_MODEL,
        _IMAGEN_MODEL,
        len(image_bytes) // 1024,
        prompt,
    )

    # Step 1 — describe source image
    description = _describe_image(client, image_bytes, mime)

    # Step 2 — build and execute Imagen prompt
    imagen_prompt = _build_imagen_prompt(description, prompt)
    logger.info("Imagen prompt (%.200s…)", imagen_prompt)

    result_bytes = _generate_with_imagen(client, imagen_prompt)

    if result_bytes is None:
        raise RuntimeError(
            "Image generation failed: Imagen returned no image. "
            "The prompt may have triggered safety filters — try rephrasing "
            "with 'photorealistic, respectful representation'. "
            f"(model={_IMAGEN_MODEL})"
        )

    result_b64 = base64.b64encode(result_bytes).decode("utf-8")
    logger.info(
        "Brand-swap complete | model=%s | output_size=%dKB",
        _IMAGEN_MODEL,
        len(result_bytes) // 1024,
    )

    return {
        "edited_image_url": None,
        "edited_image_b64": result_b64,
        "request_id":       _IMAGEN_MODEL,
        "original_prompt":  prompt,
    }


async def download_nano_result(url: str) -> bytes:
    """Download a result image from a URL (used when edited_image_url is set)."""
    import httpx
    async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as c:
        resp = await c.get(url)
        resp.raise_for_status()
        return resp.content
