"""
Image editing client — Google Imagen 3 via Vertex AI (Symphony Video Creator flow)
────────────────────────────────────────────────────────────────────────────────────
edit_image is only available on the Vertex AI client; the standard API-key client
does not support it.  We reuse the same service-account credentials that are
already used for GCS.
"""
import base64
import json
import logging
from typing import Optional

from google import genai
from google.genai import types
from google.oauth2 import service_account

from .config import settings

logger = logging.getLogger(__name__)

# Imagen 3 editing model (same name on Vertex AI)
_IMAGEN_EDIT_MODEL = "imagen-3.0-capability-001"
_VERTEX_LOCATION   = "us-central1"


def _vertex_client() -> genai.Client:
    """Return a Vertex-AI genai client using the configured GCS service account."""
    project_id = settings.GCS_PROJECT_ID

    if settings.GCS_CREDENTIALS_JSON:
        info  = json.loads(settings.GCS_CREDENTIALS_JSON)
        creds = service_account.Credentials.from_service_account_info(
            info,
            scopes=["https://www.googleapis.com/auth/cloud-platform"],
        )
        project_id = project_id or info.get("project_id")
    elif settings.GOOGLE_APPLICATION_CREDENTIALS:
        creds = service_account.Credentials.from_service_account_file(
            settings.GOOGLE_APPLICATION_CREDENTIALS,
            scopes=["https://www.googleapis.com/auth/cloud-platform"],
        )
    else:
        # Fall back to Application Default Credentials (works on Cloud Run / GCE)
        import google.auth
        creds, adc_project = google.auth.default(
            scopes=["https://www.googleapis.com/auth/cloud-platform"]
        )
        project_id = project_id or adc_project

    return genai.Client(
        vertexai=True,
        project=project_id,
        location=_VERTEX_LOCATION,
        credentials=creds,
    )


async def nano_edit_image(
    image_bytes: bytes,
    prompt: str,
    image_content_type: str = "image/jpeg",
    *,
    strength: float = 0.78,  # kept for API compatibility — unused by Imagen
    mode: str = "edit",      # "edit" | "swap" — both use EDIT_MODE_DEFAULT
) -> dict:
    """
    Edit / swap an image using Google Imagen 3 (Vertex AI).

    Args:
        image_bytes        : Raw bytes of the source image.
        prompt             : Editing instruction.
        image_content_type : MIME type of the source image.
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

    client = _vertex_client()

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
    result_b64 = base64.b64encode(img.image_bytes).decode("utf-8")

    logger.info("Imagen 3 edit complete | output_size=%dKB", len(img.image_bytes) // 1024)

    return {
        "edited_image_url": None,
        "edited_image_b64": result_b64,
        "request_id":       "imagen3-vertex",
        "original_prompt":  prompt,
    }


async def download_nano_result(url: str) -> bytes:
    """Download a result image from a URL (used when edited_image_url is set)."""
    import httpx
    async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as c:
        resp = await c.get(url)
        resp.raise_for_status()
        return resp.content
