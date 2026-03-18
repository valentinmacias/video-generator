"""
Google Veo 3.1 Video Generation Client

Handles:
- Initiating video generation (returns an operation name)
- Polling operation status
- Extracting the final video URI
"""
import asyncio
import logging
import base64
from typing import Optional, List, Dict, Any, Tuple
from google import genai
from google.genai import types as genai_types
from .config import settings

logger = logging.getLogger(__name__)

_veo_client: Optional[genai.Client] = None


def get_veo_client() -> genai.Client:
    global _veo_client
    if _veo_client is None:
        _veo_client = genai.Client(api_key=settings.GOOGLE_API_KEY)
    return _veo_client


async def generate_branded_video(
    user_prompt: str,
    brand_references: Optional[List[str]] = None,
    brand_instructions: Optional[str] = None,
    aspect_ratio: str = "16:9",
    duration_seconds: int = 8,
) -> Tuple[str, str]:
    """
    Initiate video generation with Veo 3.1.

    Args:
        user_prompt: The (already enhanced) cinematic prompt.
        brand_references: List of up to 3 GCS image URIs for visual reference.
        brand_instructions: Additional style instructions prepended to the prompt.
        aspect_ratio: "16:9" (default) or "9:16".
        duration_seconds: Target duration (Veo honours this as a hint).

    Returns:
        (operation_name, enhanced_prompt_used)
    """
    client = get_veo_client()

    # Optionally prepend brand instructions to the prompt
    final_prompt = user_prompt
    if brand_instructions:
        final_prompt = f"[Brand Style: {brand_instructions}]\n\n{user_prompt}"

    logger.info(f"Starting Veo generation | model={settings.VEO_MODEL} | prompt={final_prompt[:80]}…")

    # Build the video generation config
    video_config = genai_types.GenerateVideosConfig(
        aspect_ratio=aspect_ratio,
        number_of_videos=1,
        duration_seconds=duration_seconds,
    )

    # Use the first reference image for image-conditioned generation if provided
    image_param = None
    if brand_references:
        first_ref = brand_references[0]
        if first_ref.startswith("gs://"):
            image_param = genai_types.Image(gcs_uri=first_ref)
        elif first_ref.startswith("http"):
            image_param = genai_types.Image(url=first_ref)

    try:
        if image_param:
            operation = client.models.generate_videos(
                model=settings.VEO_MODEL,
                prompt=final_prompt,
                image=image_param,
                config=video_config,
            )
        else:
            operation = client.models.generate_videos(
                model=settings.VEO_MODEL,
                prompt=final_prompt,
                config=video_config,
            )

        operation_name = operation.name
        logger.info(f"Veo operation started: {operation_name}")
        return operation_name, final_prompt

    except Exception as e:
        logger.error(f"Veo generation failed to start: {e}")
        raise


async def poll_operation(operation_name: str) -> Dict[str, Any]:
    """
    Poll a Veo operation and return its current state.

    Returns dict with keys:
        done: bool
        video_uri: str | None   (GCS URI, available when done=True)
        video_bytes: bytes | None (raw bytes if no GCS URI)
        error: str | None
    """
    client = get_veo_client()
    try:
        operation_obj = genai_types.GenerateVideosOperation(name=operation_name)
        operation = await asyncio.to_thread(client.operations.get, operation_obj)
        result: Dict[str, Any] = {
            "done": operation.done,
            "video_uri": None,
            "video_bytes": None,
            "error": None,
        }

        if operation.done:
            logger.info(f"Operation done. Attrs: { {k: str(getattr(operation, k, None))[:120] for k in ['error', 'result', 'response', 'metadata']} }")
            if hasattr(operation, "error") and operation.error:
                result["error"] = str(operation.error)
            else:
                # SDK exposes the Python result object in .result, raw dict in .response
                # Always prefer .result since it has typed attributes like generated_videos
                raw_result = getattr(operation, "result", None) or getattr(operation, "response", None)
                if raw_result:
                    generated = getattr(raw_result, "generated_videos", None)
                    logger.info(f"generated_videos: {generated}")

                # Check for RAI filtering even when generated_videos is None
                rai_filtered = getattr(raw_result, "rai_media_filtered_count", 0) or 0
                rai_reasons = getattr(raw_result, "rai_media_filtered_reasons", None)
                if rai_filtered and not generated:
                    reason_str = ""
                    if rai_reasons:
                        reason_str = f": {rai_reasons[0]}" if rai_reasons else ""
                    result["error"] = (
                        f"Video blocked by Google's safety filters (RAI){reason_str}. "
                        "Try rephrasing your prompt to avoid specific people, violence, or other restricted content."
                    )
                elif raw_result and generated:
                    video = generated[0]
                    # Try direct gcs_uri first
                    if hasattr(video, "gcs_uri") and video.gcs_uri:
                        result["video_uri"] = video.gcs_uri
                    elif hasattr(video, "video") and video.video:
                        inner = video.video
                        # video.video is a Video object with a uri, or raw bytes/base64
                        if hasattr(inner, "uri") and inner.uri:
                            result["video_uri"] = inner.uri
                        elif isinstance(inner, str):
                            result["video_bytes"] = base64.b64decode(inner)
                        elif isinstance(inner, bytes):
                            result["video_bytes"] = inner
                        else:
                            result["error"] = "No video output found in completed operation"
                    else:
                        result["error"] = "No video output found in completed operation"
                else:
                    result["error"] = "Operation completed but no video data found"

        return result

    except Exception as e:
        logger.error(f"Error polling operation {operation_name}: {e}")
        return {
            "done": False,
            "video_uri": None,
            "video_bytes": None,
            "error": str(e),
        }
