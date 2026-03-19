"""
Image Generation Pipeline
─────────────────────────
Orchestrates the two-step brand-swap flow:

  source image (optional)
       │
       ▼
  GeminiClient.describe_image()   ← multimodal, optional
       │  scene description
       ▼
  GeminiClient.enhance_prompt()   ← text → enhanced Imagen prompt
       │  rich prompt
       ▼
  ImagenClient.generate_image()   ← text-to-image (Imagen 3)
       │  image bytes
       ▼
  return bytes

Gemini is NEVER asked to produce image output.
Imagen is ALWAYS called with generateImages() — never predict() or generateContent().
Auth is handled entirely by app.ai.auth — never inline here.
"""
from __future__ import annotations

import base64
import logging
from typing import Optional

from .auth          import initialize_vertex_ai, get_project_id
from .gemini_client import GeminiClient
from .imagen_client import ImagenClient
from .models        import PipelineError, PipelineErrorType

logger = logging.getLogger(__name__)


class ImageGenerationPipeline:
    """
    Production-ready orchestrator for Vertex AI Gemini + Imagen 3.

    Usage
    -----
    pipeline = ImageGenerationPipeline.default()
    result   = await pipeline.generate(
        user_prompt="Change model to Black American, 55 yrs old",
        source_image_bytes=<bytes>,
    )
    image_bytes = result["image_bytes"]

    All errors surface as PipelineError with .to_dict() for structured logging.
    Auth errors are always PipelineErrorType.AUTH_ERROR — never REGION_ERROR.
    """

    def __init__(
        self,
        gemini: GeminiClient,
        imagen: ImagenClient,
    ) -> None:
        self._gemini = gemini
        self._imagen = imagen

    # ── Factory ────────────────────────────────────────────────────────────────

    @classmethod
    def default(
        cls,
        *,
        aspect_ratio: str = "1:1",
    ) -> "ImageGenerationPipeline":
        """
        Create a pipeline from settings.
        Vertex AI is initialised here so startup errors surface immediately.
        """
        from ..config import settings  # noqa: PLC0415

        # Auth + vertexai.init() — raises PipelineError(AUTH_ERROR) on failure
        initialize_vertex_ai()

        model = settings.VERTEX_IMAGEN_MODEL

        gemini = GeminiClient()
        imagen = ImagenClient(
            model_name=model,
            aspect_ratio=aspect_ratio,
            safety_filter_level="block_some",
            person_generation="allow_adult",
        )
        return cls(gemini=gemini, imagen=imagen)

    # ── Main entry point ───────────────────────────────────────────────────────

    async def generate(
        self,
        user_prompt: str,
        source_image_bytes: Optional[bytes] = None,
        image_mime_type: str = "image/jpeg",
        enhance_prompt: bool = False,
    ) -> dict:
        """
        Run the full pipeline and return a result dict.

        Parameters
        ----------
        enhance_prompt : bool
            False (default) — send the user's prompt to Imagen unchanged.
            True            — run through GeminiClient to expand the prompt first.

        Returns
        -------
        {
            "image_bytes":      bytes,
            "image_b64":        str,
            "enhanced_prompt":  str,   # same as user_prompt when enhance_prompt=False
            "model":            str,
        }

        Raises PipelineError on unrecoverable failure.
        """
        logger.info(
            "Pipeline start | enhance=%s | has_source_image=%s | prompt=%.100s…",
            enhance_prompt,
            source_image_bytes is not None,
            user_prompt,
        )

        if enhance_prompt:
            # ── Step 1: describe source image (optional, best-effort) ──────────
            scene_description: Optional[str] = None
            if source_image_bytes:
                scene_description = await self._gemini.describe_image(
                    source_image_bytes,
                    mime_type=image_mime_type,
                )

            # ── Step 2: enhance the swap instruction ───────────────────────────
            final_prompt = await self._gemini.enhance_prompt(
                swap_instruction=user_prompt,
                scene_description=scene_description,
            )
        else:
            # Raw mode — user's prompt goes straight to Imagen, unchanged
            final_prompt = user_prompt

        # ── Step 3: generate image with Imagen 3 ───────────────────────────────
        image_bytes = await self._imagen.generate_image(final_prompt)

        result = {
            "image_bytes":     image_bytes,
            "image_b64":       base64.b64encode(image_bytes).decode(),
            "enhanced_prompt": final_prompt,
            "model":           self._imagen._model_name,
        }
        logger.info(
            "Pipeline complete | model=%s | output_size=%dKB",
            result["model"],
            len(image_bytes) // 1024,
        )
        return result
