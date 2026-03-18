from pydantic import BaseModel, Field
from typing import Optional, List, Literal, Union
from enum import Enum
from datetime import datetime


# ── Status ─────────────────────────────────────────────────────────────────────

class VideoStatus(str, Enum):
    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


# ── Generation mode ────────────────────────────────────────────────────────────

class GenerationMode(str, Enum):
    VIDEO = "video"
    IMAGE = "image"


# ── Shared parameter enums ─────────────────────────────────────────────────────

class AspectRatio(str, Enum):
    WIDE       = "16:9"
    PORTRAIT   = "9:16"
    SQUARE     = "1:1"
    ULTRAWIDE  = "21:9"
    CLASSIC    = "4:3"


class Quality(str, Enum):
    STANDARD = "standard"
    HIGH     = "high"
    ULTRA    = "ultra"


# ── Video-specific enums ───────────────────────────────────────────────────────

class CameraMovement(str, Enum):
    STATIC        = "static"
    SLOW_PAN      = "slow_pan"
    DOLLY_IN      = "dolly_in"
    DOLLY_OUT     = "dolly_out"
    CRANE         = "crane"
    ORBIT         = "orbit"
    HANDHELD      = "handheld"
    EPIC_TRACKING = "epic_tracking"


class MotionStrength(str, Enum):
    SUBTLE  = "subtle"
    MEDIUM  = "medium"
    DYNAMIC = "dynamic"
    EPIC    = "epic"


class LightingStyle(str, Enum):
    GOLDEN_HOUR  = "golden_hour"
    DRAMATIC     = "dramatic"
    SOFT_NATURAL = "soft_natural"
    STUDIO       = "studio"
    NEON         = "neon"


class VisualStyle(str, Enum):
    PHOTOREALISTIC = "photorealistic"
    CINEMATIC      = "cinematic"
    ARTISTIC       = "artistic"
    COMMERCIAL     = "commercial"
    ANIME          = "anime"


# ── Image-specific enums ───────────────────────────────────────────────────────

class ImageStyle(str, Enum):
    PHOTOREALISTIC = "photorealistic"
    CINEMATIC      = "cinematic"
    ARTISTIC       = "artistic"
    COMMERCIAL     = "commercial"
    ANIME          = "anime"
    ILLUSTRATION   = "illustration"
    THREE_D_RENDER = "3d_render"


# ── Generation parameter models ────────────────────────────────────────────────

class VideoParams(BaseModel):
    """All tunable parameters for Veo video generation."""
    duration:        int            = Field(8, ge=5, le=10, description="Duration in seconds (5 | 8 | 10)")
    aspect_ratio:    AspectRatio    = AspectRatio.WIDE
    camera_movement: CameraMovement = CameraMovement.STATIC
    motion_strength: MotionStrength = MotionStrength.MEDIUM
    lighting_style:  LightingStyle  = LightingStyle.SOFT_NATURAL
    visual_style:    VisualStyle    = VisualStyle.CINEMATIC
    quality:         Quality        = Quality.HIGH
    seed:            Optional[int]  = None
    negative_prompt: Optional[str]  = Field(None, max_length=500)


class ImageParams(BaseModel):
    """All tunable parameters for Imagen image generation."""
    aspect_ratio:     AspectRatio  = AspectRatio.WIDE
    style:            ImageStyle   = ImageStyle.PHOTOREALISTIC
    quality:          Quality      = Quality.HIGH
    number_of_images: int          = Field(1, ge=1, le=4)
    seed:             Optional[int] = None
    negative_prompt:  Optional[str] = Field(None, max_length=500)


# ── Unified generation request ─────────────────────────────────────────────────

class GenerateRequest(BaseModel):
    """
    Unified request for both video and image generation.
    Set `mode` to select the generation type, then populate either
    `video_params` or `image_params` (the other is ignored).
    """
    brand_id:                str
    mode:                    GenerationMode = GenerationMode.VIDEO
    user_prompt:             str            = Field(..., min_length=10, max_length=1000)
    enhance_prompt:          bool           = True   # False = raw mode, skip Gemini
    additional_instructions: Optional[str]  = Field(None, max_length=500)
    video_params:            Optional[VideoParams] = None
    image_params:            Optional[ImageParams] = None

    def effective_video_params(self) -> VideoParams:
        return self.video_params or VideoParams()

    def effective_image_params(self) -> ImageParams:
        return self.image_params or ImageParams()


# ── Brand schemas ──────────────────────────────────────────────────────────────

class BrandCreate(BaseModel):
    name:        str
    style_guide: Optional[str] = None


class BrandResponse(BaseModel):
    id:               str
    name:             str
    style_guide:      Optional[str]
    reference_images: List[str] = []
    created_at:       datetime


# ── Video / Asset response schemas ─────────────────────────────────────────────

class VideoResponse(BaseModel):
    id:              str
    brand_id:        Optional[str]
    user_prompt:     str
    enhanced_prompt: Optional[str]
    status:          VideoStatus
    video_url:       Optional[str]
    thumbnail_url:   Optional[str]
    error_message:   Optional[str]
    created_at:      datetime
    updated_at:      datetime


class VideoGenerateResponse(BaseModel):
    """
    Returned immediately after submitting a generation request.
    For images (synchronous), status will be COMPLETED straight away.
    For videos (async), status is PROCESSING — poll /api/videos/{id}.
    """
    video_id:    str             # primary asset ID (first if multiple images)
    video_ids:   List[str] = []  # all generated asset IDs (≥1 for images)
    operation_id: Optional[str]
    status:      VideoStatus
    message:     str
    mode:        GenerationMode = GenerationMode.VIDEO


# ── Legacy request (kept for backward compatibility) ───────────────────────────

class VideoGenerateRequest(BaseModel):
    brand_id:                str
    user_prompt:             str = Field(..., min_length=10, max_length=1000)
    additional_instructions: Optional[str] = None


# ── Prompt enhancement ─────────────────────────────────────────────────────────

class PromptEnhanceRequest(BaseModel):
    user_prompt:       str
    brand_instructions: str
    reference_images:  List[str] = []


class PromptEnhanceResponse(BaseModel):
    enhanced_prompt: str
    original_prompt: str
