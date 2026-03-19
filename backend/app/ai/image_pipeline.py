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
"""
from __future__ import annotations

import base64
import json
import logging
import os
from typing import Optional

import vertexai

from .gemini_client import GeminiClient
from .imagen_client  import ImagenClient
from .models         import PipelineError, PipelineErrorType

logger = logging.getLogger(__name__)


def _resolve_project_id() -> str:
    """
    Resolve the GCP project ID using the first source that works:

    1. settings.GCS_PROJECT_ID          (explicit env var — fastest)
    2. settings.GCS_CREDENTIALS_JSON    (inline service-account JSON string)
    3. settings.GOOGLE_APPLICATION_CREDENTIALS  (path to SA JSON file)
    4. GOOGLE_CLOUD_PROJECT / GCLOUD_PROJECT    (GCP runtime env vars)

    Raises PipelineError(AUTH_ERROR) if none succeed.
    """
    from ..config import settings  # noqa: PLC0415

    # 1. Explicit setting
    if settings.GCS_PROJECT_ID:
        return settings.GCS_PROJECT_ID

    # 2. Inline JSON string
    if settings.GCS_CREDENTIALS_JSON:
        try:
            data = json.loads(settings.GCS_CREDENTIALS_JSON)
            if pid := data.get("project_id"):
                logger.info("Resolved GCP project_id from GCS_CREDENTIALS_JSON: %s", pid)
                return pid
        except json.JSONDecodeError:
            pass

    # 3. Path to JSON key file
    creds_path = (
        settings.GOOGLE_APPLICATION_CREDENTIALS
        or os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    )
    if creds_path and os.path.isfile(creds_path):
        try:
            with open(creds_path) as fh:
                data = json.load(fh)
            if pid := data.get("project_id"):
                logger.info("Resolved GCP project_id from credentials file: %s", pid)
                return pid
        except (OSError, json.JSONDecodeError):
            pass

    # 4. Runtime env vars set by GCP infra (Cloud Run, GKE, etc.)
    for env_key in ("GOOGLE_CLOUD_PROJECT", "GCLOUD_PROJECT", "GCP_PROJECT"):
        if pid := os.environ.get(env_key):
            logger.info("Resolved GCP project_id from env %s: %s", env_key, pid)
            return pid

    raise PipelineError(
        PipelineErrorType.AUTH_ERROR,
        "Cannot determine GCP project ID. "
        "Set GCS_PROJECT_ID in your .env, or ensure GOOGLE_APPLICATION_CREDENTIALS "
        "points to a valid service-account JSON file that contains 'project_id'.",
        retryable=False,
    )


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
    """

    def __init__(
        self,
        gemini: GeminiClient,
        imagen: ImagenClient,
        project_id: str,
        region: str = "us-central1",
    ) -> None:
        self._gemini     = gemini
        self._imagen     = imagen
        self._project_id = project_id
        self._region     = region
        self._vx_ready   = False

    # ── Factory ────────────────────────────────────────────────────────────────

    @classmethod
    def default(
        cls,
        *,
        imagen_model: str = "imagen-3.0-generate-002",
        aspect_ratio: str = "1:1",
    ) -> "ImageGenerationPipeline":
        """
        Create a pipeline from settings.
        Use imagen_model="imagen-3.0-fast-generate-001" for the fast variant.
        """
        from ..config import settings  # noqa: PLC0415

        project_id = _resolve_project_id()
        model      = getattr(settings, "VERTEX_IMAGEN_MODEL", imagen_model)

        gemini = GeminiClient()
        imagen = ImagenClient(
            model_name=model,
            aspect_ratio=aspect_ratio,
            safety_filter_level="block_some",
            person_generation="allow_adult",
        )
        return cls(gemini=gemini, imagen=imagen, project_id=project_id)

    # ── Vertex AI bootstrap ────────────────────────────────────────────────────

    def _ensure_vertex(self) -> None:
        """Call vertexai.init() once per process."""
        if self._vx_ready:
            return
        if not self._project_id:
            raise PipelineError(
                PipelineErrorType.AUTH_ERROR,
                "GCS_PROJECT_ID is required for Vertex AI. Set it in your .env.",
                retryable=False,
            )
        vertexai.init(project=self._project_id, location=self._region)
        self._vx_ready = True
        logger.info(
            "Vertex AI bootstrap | project=%s | region=%s",
            self._project_id,
            self._region,
        )

    # ── Main entry point ───────────────────────────────────────────────────────

    async def generate(
        self,
        user_prompt: str,
        source_image_bytes: Optional[bytes] = None,
        image_mime_type: str = "image/jpeg",
    ) -> dict:
        """
        Run the full pipeline and return a result dict.

        Returns
        -------
        {
            "image_bytes":      bytes,
            "image_b64":        str,
            "enhanced_prompt":  str,
            "model":            str,
        }

        Raises PipelineError on unrecoverable failure.
        """
        self._ensure_vertex()

        logger.info(
            "Pipeline start | has_source_image=%s | prompt=%.100s…",
            source_image_bytes is not None,
            user_prompt,
        )

        # ── Step 1: describe source image (optional, best-effort) ──────────────
        scene_description: Optional[str] = None
        if source_image_bytes:
            scene_description = await self._gemini.describe_image(
                source_image_bytes,
                mime_type=image_mime_type,
            )

        # ── Step 2: enhance the swap instruction ───────────────────────────────
        enhanced_prompt = await self._gemini.enhance_prompt(
            swap_instruction=user_prompt,
            scene_description=scene_description,
        )

        # ── Step 3: generate image with Imagen 3 ───────────────────────────────
        image_bytes = await self._imagen.generate_image(enhanced_prompt)

        result = {
            "image_bytes":     image_bytes,
            "image_b64":       base64.b64encode(image_bytes).decode(),
            "enhanced_prompt": enhanced_prompt,
            "model":           self._imagen._model_name,
        }
        logger.info(
            "Pipeline complete | model=%s | output_size=%dKB",
            result["model"],
            len(image_bytes) // 1024,
        )
        return result
