"""
Nano Banana AI Image Editing Client
────────────────────────────────────
Used in the Symphony Video Creator flow for face / ethnicity / clothes swap.

Nano Banana API (2026):
  Base URL : https://api.nanobanana.ai/v1
  Auth     : Bearer token in Authorization header
  Endpoint : POST /edit   — edit an image via text prompt
             POST /swap   — face / identity swap
  Docs     : https://docs.nanobanana.ai

All edits go through /edit with mode="inpaint" or mode="swap" depending on
the type of change requested.  The response contains either an output_url
(hosted result) or output_base64 (inline bytes).
"""
import asyncio
import logging
from typing import Optional

import httpx

from .config import settings

logger = logging.getLogger(__name__)

NANO_BANANA_API_BASE = "https://api.nanobanana.ai/v1"

# Maximum image size Nano Banana accepts per request
_MAX_IMAGE_BYTES = 10 * 1024 * 1024  # 10 MB


def _nano_headers() -> dict:
    if not settings.NANO_BANANA_API_KEY:
        raise ValueError(
            "NANO_BANANA_API_KEY is not configured. "
            "Add it to your .env file to use Nano Banana editing."
        )
    return {
        "Authorization": f"Bearer {settings.NANO_BANANA_API_KEY}",
        "Accept": "application/json",
        "X-NB-Version": "2026-01",
    }


async def nano_edit_image(
    image_bytes: bytes,
    prompt: str,
    image_content_type: str = "image/jpeg",
    *,
    strength: float = 0.78,
    mode: str = "edit",
) -> dict:
    """
    Edit / swap an image using the Nano Banana API.

    Args:
        image_bytes        : Raw bytes of the source image.
        prompt             : Editing instruction, e.g.
                             "Change appearance to Latina woman in her mid-20s,
                              wearing an oversized red hoodie and hoop earrings".
        image_content_type : MIME type of the source image (image/jpeg or image/png).
        strength           : Edit strength 0.0-1.0.  0.78 = heavy appearance edit
                             while preserving pose/composition.
        mode               : "edit" (inpaint/style) | "swap" (full identity swap).

    Returns dict with keys:
        edited_image_url   : str | None  — HTTPS URL to the hosted result
        edited_image_b64   : str | None  — Base-64 encoded result bytes
        request_id         : str         — Nano Banana request ID for auditing
        original_prompt    : str         — echo of the prompt sent
    """
    if len(image_bytes) > _MAX_IMAGE_BYTES:
        raise ValueError(
            f"Image is {len(image_bytes) // 1024}KB — Nano Banana limit is 10MB. "
            "Please resize the image before submitting."
        )

    ext = ".jpg" if "jpeg" in image_content_type else ".png"
    headers = _nano_headers()

    # Nano Banana accepts multipart/form-data
    files = {
        "image": (f"source{ext}", image_bytes, image_content_type),
    }
    data = {
        "prompt":         prompt,
        "mode":           mode,          # "edit" | "swap"
        "strength":       str(strength),
        "safety_filter":  "true",        # always on — policy-safe output only
        "output_format":  "url",         # prefer hosted URL over base64
    }

    logger.info(
        f"Nano Banana {mode} request | "
        f"size={len(image_bytes)//1024}KB | strength={strength} | "
        f"prompt={prompt[:80]}…"
    )

    async with httpx.AsyncClient(timeout=120.0) as client:
        try:
            resp = await client.post(
                f"{NANO_BANANA_API_BASE}/edit",
                headers=headers,
                files=files,
                data=data,
            )
        except httpx.TimeoutException:
            raise RuntimeError(
                "Nano Banana API timed out (>120s). "
                "Try a smaller image or retry in a moment."
            )

    # ── Error handling ────────────────────────────────────────────────────────
    if resp.status_code == 401:
        raise RuntimeError(
            "Nano Banana authentication failed — check your NANO_BANANA_API_KEY."
        )
    if resp.status_code == 429:
        retry_after = resp.headers.get("Retry-After", "60")
        raise RuntimeError(
            f"Nano Banana rate limit hit. Retry after {retry_after}s."
        )
    if resp.status_code == 413:
        raise RuntimeError(
            "Image rejected by Nano Banana (too large). Resize to under 10MB."
        )
    if resp.status_code == 422:
        detail = resp.json().get("detail", resp.text[:200])
        raise RuntimeError(f"Nano Banana validation error: {detail}")
    if not resp.is_success:
        raise RuntimeError(
            f"Nano Banana API error {resp.status_code}: {resp.text[:300]}"
        )

    result = resp.json()

    # ── Normalise response — handle URL or base64 outputs ─────────────────────
    edited_url = (
        result.get("output_url")
        or result.get("image_url")
        or result.get("url")
        or result.get("result_url")
    )
    edited_b64 = (
        result.get("output_base64")
        or result.get("image_base64")
        or result.get("base64")
    )
    request_id = (
        result.get("id")
        or result.get("request_id")
        or result.get("job_id")
        or "unknown"
    )

    if not edited_url and not edited_b64:
        raise RuntimeError(
            f"Nano Banana returned no image output. Raw response: {result}"
        )

    logger.info(
        f"Nano Banana edit complete | request_id={request_id} | "
        f"has_url={bool(edited_url)} | has_b64={bool(edited_b64)}"
    )

    return {
        "edited_image_url": edited_url,
        "edited_image_b64": edited_b64,
        "request_id":       request_id,
        "original_prompt":  prompt,
    }


async def download_nano_result(url: str) -> bytes:
    """
    Download the edited image from a Nano Banana result URL.
    Includes the API key header in case the URL requires authentication.
    """
    headers: dict = {}
    try:
        headers = _nano_headers()
    except ValueError:
        pass  # no key configured — try unauthenticated download

    async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
        resp = await client.get(url, headers=headers)
        resp.raise_for_status()
        return resp.content
