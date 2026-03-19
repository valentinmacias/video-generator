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


# ── Avatar / AI Creator operations ────────────────────────────────────────────

async def create_avatar(
    name: str,
    description: str = "",
    voice_clone_enabled: bool = False,
    product_locked: bool = False,
) -> Dict[str, Any]:
    db = get_supabase()
    result = db.table("avatars").insert({
        "name":                name,
        "description":         description,
        "status":              "TRAINING",
        "training_progress":   0,
        "model_provider":      "runway",
        "voice_clone_enabled": voice_clone_enabled,
        "product_locked":      product_locked,
        "tags":                [],
        "is_custom":           True,
    }).execute()
    return result.data[0]


async def update_avatar_training(
    avatar_id: str,
    training_job_id: str,
    character_id: Optional[str] = None,
) -> None:
    db = get_supabase()
    payload: Dict[str, Any] = {
        "training_job_id": training_job_id,
        "status":          "TRAINING",
        "updated_at":      datetime.now(timezone.utc).isoformat(),
    }
    if character_id:
        payload["character_id"] = character_id
    db.table("avatars").update(payload).eq("id", avatar_id).execute()


async def update_avatar_progress(avatar_id: str, progress: int) -> None:
    db = get_supabase()
    db.table("avatars").update({
        "training_progress": progress,
        "updated_at":        datetime.now(timezone.utc).isoformat(),
    }).eq("id", avatar_id).execute()


async def update_avatar_ready(
    avatar_id: str,
    custom_model_id: str,
    image_url: Optional[str] = None,
) -> None:
    db = get_supabase()
    db.table("avatars").update({
        "status":            "READY",
        "training_progress": 100,
        "custom_model_id":   custom_model_id,
        "image_url":         image_url,
        "updated_at":        datetime.now(timezone.utc).isoformat(),
    }).eq("id", avatar_id).execute()
    logger.info(f"Avatar {avatar_id} training COMPLETE: model={custom_model_id}")


async def update_avatar_failed(avatar_id: str, error: str) -> None:
    db = get_supabase()
    db.table("avatars").update({
        "status":    "FAILED",
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", avatar_id).execute()
    logger.error(f"Avatar {avatar_id} training FAILED: {error}")


async def get_avatar(avatar_id: str) -> Optional[Dict[str, Any]]:
    db = get_supabase()
    result = db.table("avatars").select("*").eq("id", avatar_id).execute()
    return result.data[0] if result.data else None


async def list_avatars() -> List[Dict[str, Any]]:
    db = get_supabase()
    result = db.table("avatars").select("*").order("created_at", desc=True).execute()
    return result.data


async def get_training_avatars() -> List[Dict[str, Any]]:
    """Fetch all avatars that are currently in training."""
    db = get_supabase()
    result = (
        db.table("avatars")
        .select("*")
        .eq("status", "TRAINING")
        .not_.is_("training_job_id", "null")
        .execute()
    )
    return result.data


# ── Symphony Video Creator operations ─────────────────────────────────────────

async def create_symphony_video(
    user_prompt: str,
    model_used: str,
    nano_reference_url: Optional[str] = None,
    brand_id: Optional[str] = None,
    enhanced_prompt: Optional[str] = None,
) -> Dict[str, Any]:
    """Create a video record with symphony-specific fields."""
    db = get_supabase()
    result = db.table("videos").insert({
        "brand_id":            brand_id,
        "user_prompt":         user_prompt,
        "enhanced_prompt":     enhanced_prompt or user_prompt,
        "status":              VideoStatus.PENDING.value,
        "model_used":          model_used,
        "nano_reference_url":  nano_reference_url,
    }).execute()
    return result.data[0]


async def update_symphony_job_id(video_id: str, symphony_job_id: str) -> None:
    """Store the external provider job ID on the video record."""
    db = get_supabase()
    db.table("videos").update({
        "symphony_job_id": symphony_job_id,
        "status":          VideoStatus.PROCESSING.value,
        "updated_at":      datetime.now(timezone.utc).isoformat(),
    }).eq("id", video_id).execute()


async def get_symphony_video(video_id: str) -> Optional[Dict[str, Any]]:
    """Fetch a symphony video record with all extended fields."""
    db = get_supabase()
    result = db.table("videos").select(
        "id, status, video_url, nano_reference_url, model_used, "
        "symphony_job_id, error_message, user_prompt, created_at, updated_at"
    ).eq("id", video_id).execute()
    return result.data[0] if result.data else None


async def update_avatar_nano_reference(avatar_id: str, nano_image_url: str) -> None:
    """Store the Nano Banana reference image on an avatar record."""
    db = get_supabase()
    db.table("avatars").update({
        "nano_reference_image": nano_image_url,
        "updated_at":           datetime.now(timezone.utc).isoformat(),
    }).eq("id", avatar_id).execute()
    logger.info(f"Avatar {avatar_id}: nano_reference_image updated")
