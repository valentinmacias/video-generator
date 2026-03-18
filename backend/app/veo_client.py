"""
Google Veo Video Generation Client

Handles:
- Initiating video generation (returns an operation name)
- Polling operation status
- Extracting the final video URI
- Building style-hint suffixes from VideoParams
"""
import asyncio
import logging
import base64
from typing import Optional, List, Dict, Any, Tuple
from google import genai
from google.genai import types as genai_types
from .config import settings
from .models import (
    VideoParams, CameraMovement, MotionStrength, LightingStyle, VisualStyle, Quality,
)

logger = logging.getLogger(__name__)

_veo_client: Optional[genai.Client] = None


def get_veo_client() -> genai.Client:
    global _veo_client
    if _veo_client is None:
        _veo_client = genai.Client(api_key=settings.GOOGLE_API_KEY)
    return _veo_client


# ── Style hint builder ─────────────────────────────────────────────────────────

_CAMERA_MOVEMENT_PHRASES: Dict[str, str] = {
    CameraMovement.STATIC:        "static camera, locked-off shot",
    CameraMovement.SLOW_PAN:      "slow panning camera movement",
    CameraMovement.DOLLY_IN:      "smooth dolly-in camera movement toward the subject",
    CameraMovement.DOLLY_OUT:     "slow dolly-out pulling away from the subject",
    CameraMovement.CRANE:         "graceful crane shot sweeping up or down",
    CameraMovement.ORBIT:         "circular orbit camera slowly revolving around the subject",
    CameraMovement.HANDHELD:      "intimate handheld camera with slight natural shake",
    CameraMovement.EPIC_TRACKING: "epic tracking shot following the action",
}

_MOTION_STRENGTH_PHRASES: Dict[str, str] = {
    MotionStrength.SUBTLE:    "subtle, gentle motion",
    MotionStrength.MEDIUM:    "natural, fluid motion",
    MotionStrength.DYNAMIC:   "dynamic, energetic motion",
    MotionStrength.CINEMATIC: "dramatic cinematic motion, purposeful and deliberate movement",
    MotionStrength.EPIC:      "epic, powerful sweeping motion with high kinetic energy",
}

_LIGHTING_PHRASES: Dict[str, str] = {
    LightingStyle.GOLDEN_HOUR:   "warm golden-hour lighting, long shadows, orange-amber tones",
    LightingStyle.DRAMATIC:      "dramatic high-contrast cinematic lighting with deep shadows",
    LightingStyle.SOFT_NATURAL:  "soft, diffused natural daylight",
    LightingStyle.STUDIO:        "clean professional studio lighting, neutral, controlled",
    LightingStyle.NEON:          "vibrant neon-cyberpunk atmosphere, colourful urban glow",
    LightingStyle.MOODY_LOW_KEY: "moody low-key lighting, deep shadows, minimal fill light, mysterious dark atmosphere",
}

_VISUAL_STYLE_PHRASES: Dict[str, str] = {
    VisualStyle.PHOTOREALISTIC: "photorealistic, ultra-detailed, true-to-life",
    VisualStyle.CINEMATIC:      "Hollywood cinematic quality, anamorphic lens look, movie-grade color grading",
    VisualStyle.COMMERCIAL:     "polished commercial ad production quality, brand-safe, aspirational",
    VisualStyle.ARTISTIC:       "artistic film aesthetic, painterly, expressive composition, auteur style",
    VisualStyle.DOCUMENTARY:    "documentary-style, authentic, natural, observational cinematography, reportage feel",
    VisualStyle.ANIME:          "anime-style animation, vibrant colours, fluid movement",
}

_QUALITY_PHRASES: Dict[str, str] = {
    Quality.STANDARD: "",
    Quality.HIGH:     "high quality, sharp detail, professional grade",
    Quality.ULTRA:    "ultra high quality, 4K cinematic, crystal-clear detail, masterpiece",
}


def build_style_suffix(params: VideoParams) -> str:
    """
    Convert VideoParams into a natural-language suffix appended to the cinematic
    prompt before sending to Veo. All style choices become prompt-level hints
    since the Veo API itself only exposes aspect_ratio, duration, and
    number_of_videos as config knobs.
    """
    parts = [
        _CAMERA_MOVEMENT_PHRASES.get(params.camera_movement, ""),
        _MOTION_STRENGTH_PHRASES.get(params.motion_strength, ""),
        _LIGHTING_PHRASES.get(params.lighting_style, ""),
        _VISUAL_STYLE_PHRASES.get(params.visual_style, ""),
        _QUALITY_PHRASES.get(params.quality, ""),
    ]
    if params.negative_prompt:
        parts.append(f"Avoid: {params.negative_prompt}")

    # Note end-card intent in the prompt if provided (Veo has no native end-frame param)
    if params.end_card_b64:
        parts.append("End the video with a smooth, composed closing frame")

    return ", ".join(p for p in parts if p)


# ── Video generation ───────────────────────────────────────────────────────────

async def generate_branded_video(
    user_prompt: str,
    brand_references: Optional[List[str]] = None,
    brand_instructions: Optional[str] = None,
    video_params: Optional[VideoParams] = None,
) -> Tuple[str, str]:
    """
    Initiate video generation with Veo.

    Conditioning image priority (highest wins):
        1. start_card_b64 in video_params
        2. reference_images_b64[0] in video_params
        3. brand_references[0] (GCS URI / HTTPS URL)

    Args:
        user_prompt:        The (already enhanced) cinematic prompt.
        brand_references:   List of up to 3 GCS image URIs for visual reference.
        brand_instructions: Additional style instructions prepended to the prompt.
        video_params:       Tunable generation parameters (defaults if None).

    Returns:
        (operation_name, final_prompt_used)
    """
    client = get_veo_client()
    params = video_params or VideoParams()

    # Build the final prompt: brand context → user prompt → style hints
    segments = []
    if brand_instructions:
        segments.append(f"[Brand Style: {brand_instructions}]")
    segments.append(user_prompt)
    style_suffix = build_style_suffix(params)
    if style_suffix:
        segments.append(style_suffix)
    final_prompt = "\n\n".join(segments)

    # Resolve the model: per-request override takes priority over global setting
    model_id = params.veo_model.value

    logger.info(
        f"Starting Veo generation | model={model_id} "
        f"| duration={params.duration}s | aspect={params.aspect_ratio.value} "
        f"| prompt={final_prompt[:80]}…"
    )

    video_config = genai_types.GenerateVideosConfig(
        aspect_ratio=params.aspect_ratio.value,
        number_of_videos=1,
        duration_seconds=params.duration,
    )

    # ── Conditioning image resolution ─────────────────────────────────────────
    image_param = None

    # 1. Start card (highest priority – defines the opening frame)
    if params.start_card_b64:
        try:
            image_bytes = base64.b64decode(params.start_card_b64)
            image_param = genai_types.Image(image_bytes=image_bytes)
            logger.info("Using start_card_b64 as conditioning image")
        except Exception as e:
            logger.warning(f"Failed to decode start_card_b64, falling back: {e}")

    # 2. First uploaded reference image
    if image_param is None and params.reference_images_b64:
        try:
            image_bytes = base64.b64decode(params.reference_images_b64[0])
            image_param = genai_types.Image(image_bytes=image_bytes)
            logger.info(
                f"Using reference_images_b64[0] as conditioning image "
                f"({len(params.reference_images_b64)} ref image(s) provided)"
            )
        except Exception as e:
            logger.warning(f"Failed to decode reference_images_b64[0], falling back: {e}")

    # 3. Brand reference images
    if image_param is None and brand_references:
        first_ref = brand_references[0]
        if first_ref.startswith("gs://"):
            image_param = genai_types.Image(gcs_uri=first_ref)
        elif first_ref.startswith("http"):
            image_param = genai_types.Image(url=first_ref)

    # ── Submit to Veo ─────────────────────────────────────────────────────────
    try:
        if image_param:
            operation = client.models.generate_videos(
                model=model_id,
                prompt=final_prompt,
                image=image_param,
                config=video_config,
            )
        else:
            operation = client.models.generate_videos(
                model=model_id,
                prompt=final_prompt,
                config=video_config,
            )

        operation_name = operation.name
        logger.info(f"Veo operation started: {operation_name}")
        return operation_name, final_prompt

    except Exception as e:
        logger.error(f"Veo generation failed to start: {e}")
        raise


# ── Operation polling ──────────────────────────────────────────────────────────

async def poll_operation(operation_name: str) -> Dict[str, Any]:
    """
    Poll a Veo operation and return its current state.

    Returns dict with keys:
        done:        bool
        video_uri:   str | None   (GCS URI, available when done=True)
        video_bytes: bytes | None (raw bytes if no GCS URI)
        error:       str | None
    """
    client = get_veo_client()
    try:
        operation_obj = genai_types.GenerateVideosOperation(name=operation_name)
        operation = await asyncio.to_thread(client.operations.get, operation_obj)
        result: Dict[str, Any] = {
            "done":        operation.done,
            "video_uri":   None,
            "video_bytes": None,
            "error":       None,
        }

        if operation.done:
            logger.info(
                f"Operation done. Attrs: { {k: str(getattr(operation, k, None))[:120] for k in ['error', 'result', 'response', 'metadata']} }"
            )
            if hasattr(operation, "error") and operation.error:
                result["error"] = str(operation.error)
            else:
                raw_result = getattr(operation, "result", None) or getattr(operation, "response", None)
                if raw_result:
                    generated = getattr(raw_result, "generated_videos", None)
                    logger.info(f"generated_videos: {generated}")

                rai_filtered = getattr(raw_result, "rai_media_filtered_count", 0) or 0
                rai_reasons  = getattr(raw_result, "rai_media_filtered_reasons", None)
                if rai_filtered and not generated:
                    reason_str = f": {rai_reasons[0]}" if rai_reasons else ""
                    result["error"] = (
                        f"Video blocked by Google's safety filters (RAI){reason_str}. "
                        "Try rephrasing your prompt to avoid specific people, violence, or other restricted content."
                    )
                elif raw_result and generated:
                    video = generated[0]
                    if hasattr(video, "gcs_uri") and video.gcs_uri:
                        result["video_uri"] = video.gcs_uri
                    elif hasattr(video, "video") and video.video:
                        inner = video.video
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
            "done":        False,
            "video_uri":   None,
            "video_bytes": None,
            "error":       str(e),
        }
