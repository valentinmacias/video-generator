"""
Kling AI Video Generation Client

Handles:
- JWT auth generation (Access Key + Secret Key → HS256 token)
- Text-to-video and image-to-video generation
- Subject/UGC reference-image conditioning
- Task polling and video download
- Standardised result dict (matches veo_client return shape)
"""
import asyncio
import base64
import hashlib
import hmac
import json
import logging
import time
from typing import Any, Dict, Optional, Tuple

import httpx

from .config import settings

logger = logging.getLogger(__name__)

KLING_BASE_URL = "https://api.klingai.com"

# Kling free tier enforces ~1 req/min; use longer back-off so retries
# have a realistic chance of succeeding within a single request cycle.
_RETRY_DELAYS = [15, 30, 60, 120]  # seconds between retries on 429


async def _post_with_retry(url: str, json_body: Dict, headers: Dict) -> Dict:
    """POST with exponential backoff on 429 rate-limit or transient errors."""
    last_exc: Exception = RuntimeError("No attempts made")
    for attempt, delay in enumerate([0] + _RETRY_DELAYS):
        if delay:
            logger.warning(
                f"Kling rate limit hit — waiting {delay}s before retry "
                f"(attempt {attempt + 1}/{len(_RETRY_DELAYS) + 1})"
            )
            await asyncio.sleep(delay)
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.post(url, json=json_body, headers=headers)
                if resp.status_code == 429:
                    last_exc = RuntimeError(
                        "Kling API rate limit exceeded. "
                        "Your plan may allow only a few requests per minute — "
                        "please wait a moment and try again, or upgrade your Kling plan."
                    )
                    continue
                resp.raise_for_status()
                return resp.json()
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 429:
                last_exc = RuntimeError(
                    "Kling API rate limit exceeded. "
                    "Your plan may allow only a few requests per minute — "
                    "please wait a moment and try again, or upgrade your Kling plan."
                )
                continue
            raise
        except Exception as e:
            # Catch DNS / connection errors and retry
            last_exc = e
            logger.warning(f"Kling request failed ({type(e).__name__}: {e}) — will retry")
            continue
    raise last_exc

# User-facing model name  →  Kling API model identifier
_MODEL_MAP: Dict[str, str] = {
    "kling-3.0":  "kling-v3",
    "kling-2.1":  "kling-v2-master",
    "kling-2.0":  "kling-v2",
    "kling-1.5":  "kling-v1-5",
    "kling-1.0":  "kling-v1",
}

_SAFETY_WORDS = frozenset(["content", "policy", "filter", "safety", "violat", "prohibited"])


# ── JWT helpers ────────────────────────────────────────────────────────────────

def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _generate_jwt() -> str:
    """Build a short-lived HS256 JWT for Kling API authentication."""
    if not settings.KLING_ACCESS_KEY or not settings.KLING_SECRET_KEY:
        raise RuntimeError(
            "KLING_ACCESS_KEY and KLING_SECRET_KEY must be set to use Kling AI."
        )
    now = int(time.time())
    header  = _b64url(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())
    payload = _b64url(json.dumps(
        {"iss": settings.KLING_ACCESS_KEY, "exp": now + 1800, "nbf": now - 5},
        separators=(",", ":"),
    ).encode())
    msg = f"{header}.{payload}".encode()
    sig = _b64url(
        hmac.new(settings.KLING_SECRET_KEY.encode(), msg, hashlib.sha256).digest()
    )
    return f"{header}.{payload}.{sig}"


def _auth_headers() -> Dict[str, str]:
    return {
        "Authorization": f"Bearer {_generate_jwt()}",
        "Content-Type": "application/json",
    }


# ── Helpers ────────────────────────────────────────────────────────────────────

def _api_model(name: str) -> str:
    return _MODEL_MAP.get(name, "kling-v3")


def _duration_str(seconds: int) -> str:
    """Kling only accepts '5' or '10'."""
    return "10" if seconds >= 10 else "5"


def _mode(motion_intensity: float) -> str:
    """Map 0-1 intensity to Kling generation mode."""
    return "pro" if motion_intensity > 0.5 else "std"


# ── Video generation ───────────────────────────────────────────────────────────

async def generate_kling_video(
    prompt: str,
    kling_model: str = "kling-3.0",
    conditioning_image_b64: Optional[str] = None,
    reference_image_b64: Optional[str] = None,
    cfg_scale: float = 0.5,
    motion_intensity: float = 0.5,
    duration: int = 5,
    aspect_ratio: str = "16:9",
    negative_prompt: Optional[str] = None,
) -> Tuple[str, str]:
    """
    Start a Kling video generation task.

    Routing logic:
        - conditioning_image_b64 set → image-to-video endpoint (image frames the opening shot)
        - Otherwise                  → text-to-video endpoint

    reference_image_b64:
        Subject/style reference extracted from source UGC.  Passed via the
        ``subject_reference`` field for maximum cross-video consistency.

    Returns:
        (operation_name, prompt_used)
        operation_name = "kling:{task_type}:{task_id}"
    """
    model_name   = _api_model(kling_model)
    dur_str      = _duration_str(duration)
    gen_mode     = _mode(motion_intensity)

    if conditioning_image_b64:
        endpoint  = f"{KLING_BASE_URL}/v1/videos/image2video"
        task_type = "image2video"
        body: Dict[str, Any] = {
            "model_name": model_name,
            "prompt":     prompt,
            "image":      conditioning_image_b64,
            "duration":   dur_str,
            "cfg_scale":  round(cfg_scale, 2),
        }
    else:
        endpoint  = f"{KLING_BASE_URL}/v1/videos/text2video"
        task_type = "text2video"
        body = {
            "model_name":   model_name,
            "prompt":       prompt,
            "aspect_ratio": aspect_ratio,
            "duration":     dur_str,
            "mode":         gen_mode,
            "cfg_scale":    round(cfg_scale, 2),
        }

    if negative_prompt:
        body["negative_prompt"] = negative_prompt

    # Subject / UGC-style reference (highest-consistency conditioning)
    if reference_image_b64:
        body["subject_reference"] = [
            {"image": reference_image_b64, "type": "subject"}
        ]

    logger.info(
        f"Starting Kling generation | model={model_name} | type={task_type} "
        f"| mode={gen_mode} | duration={dur_str}s | prompt={prompt[:80]}…"
    )

    data = await _post_with_retry(endpoint, body, _auth_headers())

    if data.get("code") != 0:
        raise RuntimeError(
            f"Kling API error {data.get('code')}: {data.get('message', 'unknown error')}"
        )

    task_id        = data["data"]["task_id"]
    operation_name = f"kling:{task_type}:{task_id}"
    logger.info(f"Kling task started: {operation_name}")
    return operation_name, prompt


# ── Operation polling ──────────────────────────────────────────────────────────

async def poll_kling_task(operation_name: str) -> Dict[str, Any]:
    """
    Poll a Kling task and return a standardised result dict.

    operation_name format: ``"kling:{task_type}:{task_id}"``

    Returns dict with keys (same shape as veo_client.poll_operation):
        done:        bool
        video_uri:   None  (always; Kling videos are downloaded immediately)
        video_bytes: bytes | None
        error:       str | None
    """
    _, task_type, task_id = operation_name.split(":", 2)
    url = f"{KLING_BASE_URL}/v1/videos/{task_type}/{task_id}"

    result: Dict[str, Any] = {
        "done":        False,
        "video_uri":   None,
        "video_bytes": None,
        "error":       None,
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(url, headers=_auth_headers())
            resp.raise_for_status()
            data = resp.json()

        if data.get("code") != 0:
            result["done"]  = True
            result["error"] = (
                f"Kling API error {data.get('code')}: {data.get('message', 'unknown')}"
            )
            return result

        task_data = data.get("data", {})
        status    = task_data.get("task_status", "")
        logger.debug(f"Kling task {task_id} status: {status}")

        if status in ("submitted", "processing", "waiting"):
            return result  # still running

        result["done"] = True

        if status == "failed":
            msg = task_data.get("task_status_msg") or "Kling task failed"
            if any(w in msg.lower() for w in _SAFETY_WORDS):
                result["error"] = (
                    "Video blocked by Kling's content policy. "
                    "Try rephrasing your prompt to avoid restricted content."
                )
            else:
                result["error"] = msg
            return result

        if status == "succeed":
            videos = task_data.get("task_result", {}).get("videos", [])
            if not videos:
                result["error"] = "Kling task succeeded but no video output found"
                return result

            video_url = videos[0].get("url")
            if not video_url:
                result["error"] = "Kling task succeeded but video URL is empty"
                return result

            # Download immediately — Kling signed URLs expire quickly
            logger.info(f"Downloading Kling video for task {task_id}…")
            async with httpx.AsyncClient(timeout=180.0, follow_redirects=True) as dl:
                dl_resp = await dl.get(video_url)
                dl_resp.raise_for_status()
                result["video_bytes"] = dl_resp.content
            logger.info(
                f"Kling video downloaded: {len(result['video_bytes'])} bytes"
            )
            return result

        result["error"] = f"Unknown Kling task status: {status}"
        return result

    except Exception as e:
        logger.error(f"Error polling Kling task {operation_name}: {e}")
        return {
            "done":        False,
            "video_uri":   None,
            "video_bytes": None,
            "error":       str(e),
        }
