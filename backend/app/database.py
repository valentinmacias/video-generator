from supabase import create_client, Client
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
from .config import settings
from .models import VideoStatus
import logging

logger = logging.getLogger(__name__)

_client: Optional[Client] = None


def get_supabase() -> Client:
    global _client
    if _client is None:
        _client = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
    return _client


# ── Brand operations ───────────────────────────────────────────────────────────

async def create_brand(name: str, style_guide: Optional[str] = None) -> Dict[str, Any]:
    db = get_supabase()
    result = db.table("brands").insert({
        "name": name,
        "style_guide": style_guide,
        "reference_images": [],
    }).execute()
    return result.data[0]


async def get_brand(brand_id: str) -> Optional[Dict[str, Any]]:
    db = get_supabase()
    result = db.table("brands").select("*").eq("id", brand_id).execute()
    return result.data[0] if result.data else None


async def update_brand_images(brand_id: str, image_uris: List[str]) -> Dict[str, Any]:
    db = get_supabase()
    # Fetch existing images and merge
    brand = await get_brand(brand_id)
    existing = brand.get("reference_images", []) if brand else []
    merged = list(set(existing + image_uris))[:3]  # max 3 reference images
    result = db.table("brands").update({
        "reference_images": merged
    }).eq("id", brand_id).execute()
    return result.data[0]


async def list_brands() -> List[Dict[str, Any]]:
    db = get_supabase()
    result = db.table("brands").select("*").order("created_at", desc=True).execute()
    return result.data


# ── Video operations ───────────────────────────────────────────────────────────

async def create_video(
    brand_id: str,
    user_prompt: str,
    enhanced_prompt: Optional[str] = None,
) -> Dict[str, Any]:
    db = get_supabase()
    result = db.table("videos").insert({
        "brand_id": brand_id,
        "user_prompt": user_prompt,
        "enhanced_prompt": enhanced_prompt,
        "status": VideoStatus.PENDING.value,
    }).execute()
    return result.data[0]


async def update_video_operation(video_id: str, operation_id: str) -> None:
    db = get_supabase()
    db.table("videos").update({
        "operation_id": operation_id,
        "status": VideoStatus.PROCESSING.value,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", video_id).execute()


async def update_video_completed(
    video_id: str,
    video_url: str,
    thumbnail_url: Optional[str] = None,
) -> None:
    db = get_supabase()
    db.table("videos").update({
        "status": VideoStatus.COMPLETED.value,
        "video_url": video_url,
        "thumbnail_url": thumbnail_url,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", video_id).execute()
    logger.info(f"Video {video_id} marked as COMPLETED")


async def update_video_failed(video_id: str, error: str) -> None:
    db = get_supabase()
    db.table("videos").update({
        "status": VideoStatus.FAILED.value,
        "error_message": error,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", video_id).execute()
    logger.error(f"Video {video_id} marked as FAILED: {error}")


async def get_video(video_id: str) -> Optional[Dict[str, Any]]:
    db = get_supabase()
    result = db.table("videos").select("*").eq("id", video_id).execute()
    return result.data[0] if result.data else None


async def list_videos(brand_id: Optional[str] = None, limit: int = 20) -> List[Dict[str, Any]]:
    db = get_supabase()
    query = db.table("videos").select("*, brands(name)").order("created_at", desc=True).limit(limit)
    if brand_id:
        query = query.eq("brand_id", brand_id)
    result = query.execute()
    return result.data


async def get_processing_videos() -> List[Dict[str, Any]]:
    """Fetch all videos that are currently being processed (have an operation_id)."""
    db = get_supabase()
    result = (
        db.table("videos")
        .select("*")
        .eq("status", VideoStatus.PROCESSING.value)
        .not_.is_("operation_id", "null")
        .execute()
    )
    return result.data
