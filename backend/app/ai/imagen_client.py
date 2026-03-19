"""
Vertex AI Imagen 3 client — image generation only.

  Model (HQ)   : imagen-3.0-generate-002
  Model (fast) : imagen-3.0-fast-generate-001
  Method       : ImageGenerationModel.generate_images()   ← ONLY valid method
  Region       : us-central1 (set by vertexai.init in GeminiClient / pipeline)

NEVER use:
  - predict()
  - generateContent()
  - v1beta endpoints
  - response_modalities=["IMAGE"] on text models
"""
from __future__ import annotations

import asyncio
import io
import logging
from typing import Optional

from .models import PipelineError, PipelineErrorType, classify_vertex_error

logger = logging.getLogger(__name__)

# Maximum number of generation attempts (initial + retries)
_MAX_ATTEMPTS = 3
# Base back-off in seconds (doubles each retry: 2 → 4 → 8)
_BACKOFF_BASE  = 2.0


class ImagenClient:
    """
    Lazy-initialised Vertex AI Imagen 3 wrapper.

    vertexai.init() is expected to have been called before the first
    generate_image() invocation.  The ImageGenerationPipeline handles that.
    """

    def __init__(
        self,
        model_name: str = "imagen-3.0-generate-002",
        aspect_ratio: str = "1:1",
        safety_filter_level: str = "block_some",
        person_generation: str = "allow_adult",
        number_of_images: int = 1,
    ) -> None:
        self._model_name          = model_name
        self._aspect_ratio        = aspect_ratio
        self._safety_filter_level = safety_filter_level
        self._person_generation   = person_generation
        self._number_of_images    = number_of_images
        self._model               = None   # lazy

    # ── Initialisation ─────────────────────────────────────────────────────────

    def _ensure_model(self):
        """Load the Imagen model (cheap — metadata only, no generation call)."""
        if self._model is not None:
            return
        from vertexai.preview.vision_models import ImageGenerationModel  # noqa: PLC0415
        self._model = ImageGenerationModel.from_pretrained(self._model_name)
        logger.info("Imagen model loaded: %s", self._model_name)

    # ── Core generation ────────────────────────────────────────────────────────

    def _generate_sync(self, prompt: str) -> bytes:
        """
        Synchronous Imagen generate call.
        Returns raw JPEG/PNG bytes of the first generated image.
        Raises PipelineError on any unrecoverable condition.
        """
        self._ensure_model()

        response = self._model.generate_images(
            prompt=prompt,
            number_of_images=self._number_of_images,
            aspect_ratio=self._aspect_ratio,
            safety_filter_level=self._safety_filter_level,
            person_generation=self._person_generation,
        )

        images = response.images
        if not images:
            raise PipelineError(
                PipelineErrorType.SAFETY_ERROR,
                "Imagen returned zero images — prompt likely blocked by safety filters. "
                "Try adding 'photorealistic, respectful representation' to the prompt.",
                retryable=False,
            )

        return _extract_bytes(images[0])

    # ── Public async API ───────────────────────────────────────────────────────

    async def generate_image(self, prompt: str) -> bytes:
        """
        Generate one image from *prompt* with automatic retry + back-off.

        Returns raw image bytes (JPEG).
        Raises PipelineError on unrecoverable failure.
        """
        last_error: Optional[PipelineError] = None

        for attempt in range(1, _MAX_ATTEMPTS + 1):
            try:
                logger.info(
                    "Imagen generate | model=%s | attempt=%d/%d | prompt=%.120s…",
                    self._model_name,
                    attempt,
                    _MAX_ATTEMPTS,
                    prompt,
                )
                result = await asyncio.to_thread(self._generate_sync, prompt)
                logger.info(
                    "Imagen complete | model=%s | attempt=%d | size=%dKB",
                    self._model_name,
                    attempt,
                    len(result) // 1024,
                )
                return result

            except PipelineError as exc:
                last_error = exc
                if not exc.retryable:
                    raise
                wait = _BACKOFF_BASE ** attempt
                logger.warning(
                    "Imagen attempt %d/%d failed (%s) — retrying in %.0fs. Detail: %s",
                    attempt,
                    _MAX_ATTEMPTS,
                    exc.error_type.value,
                    wait,
                    exc.message,
                )
                await asyncio.sleep(wait)

            except Exception as exc:
                last_error = classify_vertex_error(exc)
                if not last_error.retryable:
                    raise last_error from exc
                wait = _BACKOFF_BASE ** attempt
                logger.warning(
                    "Imagen attempt %d/%d failed (%s) — retrying in %.0fs. Detail: %s",
                    attempt,
                    _MAX_ATTEMPTS,
                    last_error.error_type.value,
                    wait,
                    exc,
                )
                await asyncio.sleep(wait)

        raise last_error or PipelineError(
            PipelineErrorType.UNKNOWN_ERROR,
            f"Imagen failed after {_MAX_ATTEMPTS} attempts",
            retryable=False,
        )


# ── Byte extraction helper ─────────────────────────────────────────────────────

def _extract_bytes(image) -> bytes:
    """
    Extract raw bytes from a Vertex AI GeneratedImage object.

    Tries _image_bytes first (fastest), then PIL round-trip as fallback.
    """
    # Direct bytes attribute (set by SDK when available)
    raw = getattr(image, "_image_bytes", None)
    if raw:
        return raw

    # PIL round-trip fallback
    pil_img = getattr(image, "_pil_image", None)
    if pil_img is not None:
        buf = io.BytesIO()
        pil_img.save(buf, format="JPEG", quality=95)
        return buf.getvalue()

    raise PipelineError(
        PipelineErrorType.UNKNOWN_ERROR,
        "Could not extract bytes from Imagen response — "
        "unexpected SDK response structure.",
        retryable=False,
    )
