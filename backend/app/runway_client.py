"""
Runway Gen-4 Turbo / Gen-4.5 video generation client.
Uses the runwayml Python SDK (pip install runwayml).
"""
import asyncio
import logging
from typing import List, Optional, Tuple

import httpx

from .config import settings

logger = logging.getLogger(__name__)

_client = None


def get_runway_client():
    global _client
    if _client is None:
        if not settings.RUNWAYML_API_SECRET:
            raise ValueError(
                "RUNWAYML_API_SECRET is not configured. "
                "Add it to your .env file to use Runway models."
            )
        from runwayml import RunwayML
        base = settings.RUNWAY_API_BASE_URL.rstrip("/")
        _client = RunwayML(api_key=settings.RUNWAYML_API_SECRET, base_url=base)
        logger.info(
            f"=== PRODUCTION RUNWAY Gen-4 Turbo - Credits WILL be deducted ==="
            f" (base_url={base})"
        )
    return _client


# ── Parameter → prompt hint maps ──────────────────────────────────────────────

_RATIO_MAP = {
    "16:9":  "1280:720",
    "9:16":  "720:1280",
    "1:1":   "1024:1024",
    "21:9":  "1584:672",
    "4:3":   "1280:960",
}

_CAMERA_HINTS = {
    "static":        "",
    "slow_pan":      "gentle slow pan",
    "dolly_in":      "smooth dolly push-in",
    "dolly_out":     "smooth dolly pull-out",
    "crane":         "cinematic crane shot",
    "orbit":         "orbiting camera movement",
    "handheld":      "subtle handheld camera",
    "epic_tracking": "epic tracking shot",
}

_MOTION_HINTS = {
    "subtle":    "minimal motion, very subtle movement",
    "medium":    "natural organic motion",
    "dynamic":   "dynamic energetic motion",
    "cinematic": "cinematic purposeful motion with depth",
    "epic":      "epic sweeping motion, maximum dynamism",
}

_LIGHTING_HINTS = {
    "golden_hour":   "golden hour warm cinematic lighting",
    "dramatic":      "dramatic high-contrast Rembrandt lighting",
    "soft_natural":  "soft natural diffused lighting",
    "studio":        "professional studio three-point lighting",
    "neon":          "neon cyberpunk atmospheric lighting",
    "moody_low_key": "moody low-key atmospheric lighting",
}

_STYLE_HINTS = {
    "photorealistic": "photorealistic, ultra-detailed, 8K",
    "cinematic":      "cinematic film look, anamorphic lens flare",
    "commercial":     "polished commercial advertising style",
    "artistic":       "artistic creative visual direction",
    "documentary":    "documentary realism, authentic handheld",
    "anime":          "anime stylized, vivid saturated colors",
}


def _build_runway_prompt_suffix(params) -> str:
    """Convert RunwayParams into a Runway-optimized style suffix."""
    parts: List[str] = []

    cam = _CAMERA_HINTS.get(params.camera_movement.value, "")
    if cam:
        parts.append(cam)

    mot = _MOTION_HINTS.get(params.motion_strength.value, "")
    if mot:
        parts.append(mot)

    lit = _LIGHTING_HINTS.get(params.lighting_style.value, "")
    if lit:
        parts.append(lit)

    sty = _STYLE_HINTS.get(params.visual_style.value, "")
    if sty:
        parts.append(sty)

    if params.quality.value == "ultra":
        parts.append("8K ultra-high definition, maximum render quality")
    elif params.quality.value == "high":
        parts.append("high definition, professional production quality")

    suffix = ", ".join(p for p in parts if p)
    if params.negative_prompt:
        suffix += f". Avoid: {params.negative_prompt}"
    return suffix


# ── Video generation ───────────────────────────────────────────────────────────

async def generate_runway_video(
    prompt: str,
    runway_params,
    brand_references: List[str] = [],
    brand_instructions: str = "",
) -> Tuple[str, str]:
    """
    Submit a Runway Gen-4 Turbo or Gen-4.5 video generation task.
    Returns (operation_name, final_prompt).
    operation_name format: "runway:{task_id}"
    """
    client = get_runway_client()

    # Build enriched prompt
    parts: List[str] = []
    if brand_instructions:
        parts.append(brand_instructions.strip())
    parts.append(prompt.strip())
    suffix = _build_runway_prompt_suffix(runway_params)
    if suffix:
        parts.append(suffix)
    full_prompt = ". ".join(parts)[:1000]  # Runway prompt limit

    runway_ratio = _RATIO_MAP.get(runway_params.aspect_ratio.value, "1280:720")
    duration = runway_params.duration
    model = runway_params.runway_model.value

    # Determine conditioning image (explicit first-frame anchor only).
    # Brand reference images are style references — they must NOT become the
    # first frame, otherwise Runway just animates the brand image instead of
    # generating new content from the prompt.
    prompt_image: Optional[str] = None
    if runway_params.conditioning_image_b64:
        prompt_image = f"data:image/jpeg;base64,{runway_params.conditioning_image_b64}"
    elif runway_params.reference_images_b64 and runway_params.reference_images_b64[0]:
        prompt_image = f"data:image/jpeg;base64,{runway_params.reference_images_b64[0]}"

    logger.info(f"=== RUNWAY ENDPOINT: {settings.RUNWAY_API_BASE_URL} ===")
    logger.info(
        f"Runway {model} | ratio={runway_ratio} | dur={duration}s"
        f" | mode={'image-to-video' if prompt_image else 'text-to-video'}"
    )

    def _submit():
        kwargs: dict = dict(
            model=model,
            prompt_text=full_prompt,
            duration=duration,
            ratio=runway_ratio,
        )
        if prompt_image:
            kwargs["prompt_image"] = prompt_image
            return client.image_to_video.create(**kwargs)
        else:
            return client.text_to_video.create(**kwargs)

    task = await asyncio.to_thread(_submit)
    logger.info(f"Runway task created: {task.id}")
    return f"runway:{task.id}", full_prompt


# ── Task polling ──────────────────────────────────────────────────────────────

async def poll_runway_task(operation_name: str) -> dict:
    """
    Poll a Runway task for completion.
    Returns: {done: bool, video_uri: str|None, video_bytes: None, error: str|None}
    """
    task_id = operation_name.removeprefix("runway:")
    client = get_runway_client()

    task = await asyncio.to_thread(client.tasks.retrieve, task_id)
    status = task.status  # PENDING | THROTTLED | RUNNING | SUCCEEDED | FAILED

    if status in ("PENDING", "THROTTLED", "RUNNING"):
        return {"done": False}

    if status == "SUCCEEDED":
        video_url = task.output[0] if task.output else None
        logger.info(f"Runway task {task_id} SUCCEEDED → {video_url}")
        return {"done": True, "video_uri": video_url, "video_bytes": None, "error": None}

    # FAILED or unknown status
    failure_code   = getattr(task, "failure_code",   None) or "UNKNOWN"
    failure_reason = getattr(task, "failure_reason", None) or str(failure_code)
    logger.error(f"Runway task {task_id} FAILED: {failure_reason}")
    return {"done": True, "video_uri": None, "video_bytes": None, "error": str(failure_reason)}


# ── Runway Characters API (enterprise) ────────────────────────────────────────

_RUNWAY_API_BASE = f"{settings.RUNWAY_API_BASE_URL.rstrip('/')}/v1"
_RUNWAY_HEADERS  = lambda: {
    "Authorization": f"Bearer {settings.RUNWAYML_API_SECRET}",
    "Content-Type":  "application/json",
    "X-Runway-Version": "2024-11-06",
}


async def create_runway_character(
    name: str,
    description: str,
    training_data_url: str,
) -> str:
    logger.info(f"=== RUNWAY ENDPOINT: {settings.RUNWAY_API_BASE_URL} ===")
    """
    Create a Runway Character for custom avatar training.
    Returns character_id.

    Requires an enterprise Runway account with Characters API access.
    """
    async with httpx.AsyncClient(timeout=60.0) as http:
        resp = await http.post(
            f"{_RUNWAY_API_BASE}/characters",
            headers=_RUNWAY_HEADERS(),
            json={
                "name": name,
                "description": description,
                "training_data_url": training_data_url,
            },
        )
        resp.raise_for_status()
        data = resp.json()
        character_id = data.get("id") or data.get("character_id")
        if not character_id:
            raise ValueError(f"Runway Characters API returned no ID: {data}")
        logger.info(f"Runway character created: {character_id}")
        return character_id


async def train_custom_model(
    character_id: str,
    training_data_url: str,
    model_name: str,
) -> str:
    """
    Trigger Runway Gen-4.5 custom model fine-tuning.
    Returns training_job_id.
    """
    async with httpx.AsyncClient(timeout=60.0) as http:
        resp = await http.post(
            f"{_RUNWAY_API_BASE}/training_jobs",
            headers=_RUNWAY_HEADERS(),
            json={
                "base_model":          "gen4.5",
                "character_id":        character_id,
                "training_data_url":   training_data_url,
                "name":                model_name,
            },
        )
        resp.raise_for_status()
        data = resp.json()
        job_id = data.get("id") or data.get("training_job_id")
        if not job_id:
            raise ValueError(f"Runway training API returned no job ID: {data}")
        logger.info(f"Runway training job started: {job_id}")
        return job_id


async def get_training_progress(training_job_id: str) -> dict:
    """
    Poll a Runway training job for progress.
    Returns {progress: int, status: str, custom_model_id: str|None}
    status values: TRAINING | COMPLETED | FAILED
    """
    async with httpx.AsyncClient(timeout=30.0) as http:
        resp = await http.get(
            f"{_RUNWAY_API_BASE}/training_jobs/{training_job_id}",
            headers=_RUNWAY_HEADERS(),
        )
        resp.raise_for_status()
        data = resp.json()
        return {
            "progress":        int(data.get("progress", 0)),
            "status":          data.get("status", "TRAINING").upper(),
            "custom_model_id": data.get("model_id") or data.get("custom_model_id"),
        }
