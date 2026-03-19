"""
Vertex AI Gemini client — prompt enhancement only.

Responsibilities:
  1. describe_image()  — multimodal: analyse source image → dense scene description
  2. enhance_prompt()  — text-only: expand a swap instruction into an Imagen prompt

Model : gemini-2.5-flash  (configurable via settings.VERTEX_GEMINI_MODEL)
Region: us-central1       (hard-coded per Vertex AI requirements)
Auth  : Application Default Credentials (service account JSON via
        GOOGLE_APPLICATION_CREDENTIALS or Workload Identity on GCP)
"""
from __future__ import annotations

import asyncio
import logging
from typing import Optional

from .models import PipelineError, PipelineErrorType, classify_vertex_error

logger = logging.getLogger(__name__)

# ── System instructions ────────────────────────────────────────────────────────

_DESCRIBE_SYSTEM = (
    "You are a visual analyst for AI image re-generation. "
    "Describe the provided image in precise, dense visual terms. Include: "
    "scene setting, background, subject pose and framing, lighting direction and "
    "quality, clothing colours and textures, camera angle and depth-of-field, "
    "overall mood. Output ONE dense paragraph. No bullet points, no preamble."
)

_ENHANCE_SYSTEM = (
    "You are a professional photo director and Imagen 3 prompt engineer. "
    "Transform a brand-swap instruction into a single, rich Imagen generation prompt. "
    "Rules: "
    "(1) Lead with the main subject and the requested change. "
    "(2) Add: natural photorealistic lighting, camera angle, background detail. "
    "(3) Always include: 'photorealistic natural skin tone, respectful and dignified "
    "representation, same pose preserved, zero artifacts, high fidelity'. "
    "(4) Style: photoreal UGC iPhone style. "
    "(5) Output ONLY the enhanced prompt — no explanations, no metadata, one paragraph."
)


class GeminiClient:
    """
    Lazy-initialised Vertex AI Gemini wrapper.

    vertexai.init() is called once on first use (cold-start mitigation).
    All network calls are wrapped in asyncio.to_thread() so they never
    block the FastAPI event loop.
    """

    def __init__(self) -> None:
        self._ready       = False
        self._project_id  = ""
        self._model_name  = ""

    # ── Initialisation ─────────────────────────────────────────────────────────

    def _init(self) -> None:
        """
        Ensure Vertex AI is initialised — delegates entirely to auth.py.
        vertexai.init() is idempotent; calling it again after startup is a no-op.
        """
        if self._ready:
            return

        from ..config import settings   # noqa: PLC0415
        from .auth import initialize_vertex_ai, get_project_id  # noqa: PLC0415

        # initialize_vertex_ai() is safe to call multiple times — skips if already done
        initialize_vertex_ai()

        self._project_id = get_project_id()
        self._model_name = settings.VERTEX_GEMINI_MODEL
        self._ready      = True
        logger.info("GeminiClient ready | model=%s", self._model_name)

    def _build_model(self, system_instruction: str):
        """Return a GenerativeModel instance (cheap — no network call)."""
        from vertexai.generative_models import GenerativeModel   # noqa: PLC0415
        return GenerativeModel(self._model_name, system_instruction=[system_instruction])

    # ── Public API ─────────────────────────────────────────────────────────────

    async def describe_image(
        self,
        image_bytes: bytes,
        mime_type: str = "image/jpeg",
    ) -> Optional[str]:
        """
        Analyse a source image and return a dense visual description.

        Returns None on failure (the pipeline degrades gracefully without it).
        """
        self._init()

        def _sync() -> str:
            from vertexai.generative_models import GenerativeModel, Part, Image as VxImage  # noqa: PLC0415

            model = GenerativeModel(
                self._model_name,
                system_instruction=[_DESCRIBE_SYSTEM],
            )
            image_part = Part.from_image(VxImage.from_bytes(image_bytes))
            response = model.generate_content(
                [
                    image_part,
                    "Describe this image in full visual detail for exact re-creation. One paragraph.",
                ],
                generation_config={
                    "temperature":      0.2,
                    "max_output_tokens": 512,
                },
                stream=False,
            )
            return (response.text or "").strip()

        try:
            description = await asyncio.to_thread(_sync)
            if description:
                logger.info(
                    "Image described (%d chars): %.140s…",
                    len(description),
                    description,
                )
            else:
                logger.warning("Gemini returned empty description — continuing without it")
            return description or None

        except Exception as exc:
            logger.warning("describe_image failed (non-fatal): %s", exc)
            return None  # pipeline continues without scene context

    async def enhance_prompt(
        self,
        swap_instruction: str,
        scene_description: Optional[str] = None,
    ) -> str:
        """
        Enhance a brand-swap instruction into a full Imagen-optimised prompt.

        Falls back to a basic enrichment if Gemini is unavailable, so Imagen
        always receives *something* useful.
        """
        self._init()

        context = (
            f"\n\nSource scene context (preserve all of this):\n{scene_description}"
            if scene_description
            else ""
        )
        user_message = (
            f'Brand-swap instruction: "{swap_instruction}"{context}\n\n'
            "Enhance this into a detailed Imagen 3 generation prompt:"
        )

        def _sync() -> str:
            model = self._build_model(_ENHANCE_SYSTEM)
            response = model.generate_content(
                user_message,
                generation_config={
                    "temperature":      0.4,
                    "max_output_tokens": 400,
                },
                stream=False,
            )
            return (response.text or "").strip()

        try:
            enhanced = await asyncio.to_thread(_sync)
            if not enhanced:
                logger.warning("Gemini returned empty enhancement — using fallback")
                return self._fallback(swap_instruction)

            logger.info(
                "Prompt enhanced (%d chars): %.140s…",
                len(enhanced),
                enhanced,
            )
            return enhanced

        except Exception as exc:
            pipeline_err = classify_vertex_error(exc)
            if not pipeline_err.retryable:
                # Permanent errors (404 model, auth) re-raise so the pipeline
                # can surface a clear structured error to the caller.
                raise pipeline_err from exc

            # Transient errors: log and degrade gracefully
            logger.error(
                "Gemini enhance failed (%s) — using fallback prompt. Detail: %s",
                pipeline_err.error_type.value,
                exc,
            )
            return self._fallback(swap_instruction)

    # ── Fallback ───────────────────────────────────────────────────────────────

    @staticmethod
    def _fallback(swap_instruction: str) -> str:
        """
        Basic quality/safety suffix appended when Gemini is unreachable.
        Ensures Imagen always gets useful guidance.
        """
        p = swap_instruction.strip().rstrip(".")
        if "photorealistic" not in p.lower():
            p += (
                ". Photorealistic natural skin tone, respectful and dignified representation, "
                "same pose and lighting preserved, zero artifacts, high fidelity, "
                "photoreal UGC iPhone style, cinematic composition."
            )
        return p
