from pydantic import BaseModel, Field
from typing import Optional, List
from enum import Enum
from datetime import datetime
import uuid


class VideoStatus(str, Enum):
    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


# ── Request / Response schemas ─────────────────────────────────────────────────

class BrandCreate(BaseModel):
    name: str
    style_guide: Optional[str] = None


class BrandResponse(BaseModel):
    id: str
    name: str
    style_guide: Optional[str]
    reference_images: List[str] = []
    created_at: datetime


class VideoGenerateRequest(BaseModel):
    brand_id: str
    user_prompt: str = Field(..., min_length=10, max_length=1000)
    additional_instructions: Optional[str] = None


class VideoResponse(BaseModel):
    id: str
    brand_id: Optional[str]
    user_prompt: str
    enhanced_prompt: Optional[str]
    status: VideoStatus
    video_url: Optional[str]
    thumbnail_url: Optional[str]
    error_message: Optional[str]
    created_at: datetime
    updated_at: datetime


class VideoGenerateResponse(BaseModel):
    video_id: str
    operation_id: Optional[str]
    status: VideoStatus
    message: str


class PromptEnhanceRequest(BaseModel):
    user_prompt: str
    brand_instructions: str
    reference_images: List[str] = []


class PromptEnhanceResponse(BaseModel):
    enhanced_prompt: str
    original_prompt: str
