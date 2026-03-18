from pydantic import BaseModel, ConfigDict, Field
from typing import Optional, List, Literal
from enum import Enum
from datetime import datetime


# ── Status ─────────────────────────────────────────────────────────────────────

class VideoStatus(str, Enum):
    PENDING    = "PENDING"
    PROCESSING = "PROCESSING"
    COMPLETED  = "COMPLETED"
    FAILED     = "FAILED"


# ── Generation mode ────────────────────────────────────────────────────────────

class GenerationMode(str, Enum):
    VIDEO = "video"
    IMAGE = "image"


# ── Shared parameter enums ─────────────────────────────────────────────────────

class AspectRatio(str, Enum):
    WIDE      = "16:9"
    PORTRAIT  = "9:16"
    SQUARE    = "1:1"
    ULTRAWIDE = "21:9"
    CLASSIC   = "4:3"


class Quality(str, Enum):
    STANDARD = "standard"
    HIGH     = "high"
    ULTRA    = "ultra"


# ── Veo model selector ─────────────────────────────────────────────────────────

class VeoModel(str, Enum):
    VEO_2   = "veo-2.0-generate-001"
    VEO_3   = "veo-3.0-generate-preview"
    VEO_3_1 = "veo-3.1-generate-preview"


# ── Runway model selector ──────────────────────────────────────────────────────

class RunwayModel(str, Enum):
    GEN4_TURBO = "gen4_turbo"   # Runway Gen-4 Turbo (primary)
    GEN4_5     = "gen4_5"       # Runway Gen-4.5 (custom training)


# ── Avatar status ──────────────────────────────────────────────────────────────

class AvatarStatus(str, Enum):
    TRAINING = "TRAINING"
    READY    = "READY"
    FAILED   = "FAILED"


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
    SUBTLE    = "subtle"
    MEDIUM    = "medium"
    DYNAMIC   = "dynamic"
    CINEMATIC = "cinematic"   # dramatic purposeful motion
    EPIC      = "epic"


class LightingStyle(str, Enum):
    GOLDEN_HOUR   = "golden_hour"
    DRAMATIC      = "dramatic"       # Dramatic Cinema
    SOFT_NATURAL  = "soft_natural"
    STUDIO        = "studio"         # Studio Lighting
    NEON          = "neon"           # Neon Cyberpunk
    MOODY_LOW_KEY = "moody_low_key"  # new


class VisualStyle(str, Enum):
    PHOTOREALISTIC = "photorealistic"
    CINEMATIC      = "cinematic"     # Hollywood Cinematic
    COMMERCIAL     = "commercial"    # Commercial Ad
    ARTISTIC       = "artistic"      # Artistic Film
    DOCUMENTARY    = "documentary"   # new
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
    veo_model:        VeoModel       = VeoModel.VEO_2
    duration:         int            = Field(8, ge=5, le=10, description="Duration in seconds (5 | 8 | 10)")
    aspect_ratio:     AspectRatio    = AspectRatio.WIDE
    camera_movement:  CameraMovement = CameraMovement.STATIC
    motion_strength:  MotionStrength = MotionStrength.MEDIUM
    lighting_style:   LightingStyle  = LightingStyle.SOFT_NATURAL
    visual_style:     VisualStyle    = VisualStyle.CINEMATIC
    quality:          Quality        = Quality.HIGH
    seed:             Optional[int]  = None
    negative_prompt:  Optional[str]  = Field(None, max_length=500)
    # Reference media (base64-encoded, inline)
    reference_images_b64: Optional[List[str]] = Field(
        None,
        description="Up to 4 base64-encoded reference images for style/visual conditioning",
    )
    start_card_b64: Optional[str] = Field(
        None,
        description="Base64-encoded image to use as the video start frame",
    )
    end_card_b64: Optional[str] = Field(
        None,
        description="Base64-encoded image representing the desired end frame",
    )


class ImageParams(BaseModel):
    """All tunable parameters for Imagen image generation."""
    aspect_ratio:     AspectRatio  = AspectRatio.WIDE
    style:            ImageStyle   = ImageStyle.PHOTOREALISTIC
    quality:          Quality      = Quality.HIGH
    number_of_images: int          = Field(1, ge=1, le=4)
    seed:             Optional[int] = None
    negative_prompt:  Optional[str] = Field(None, max_length=500)


# ── Runway parameter model ────────────────────────────────────────────────────

class RunwayParams(BaseModel):
    """Tunable parameters for Runway Gen-4 Turbo / Gen-4.5 video generation."""
    runway_model:           RunwayModel    = RunwayModel.GEN4_TURBO
    duration:               Literal[5, 10] = 5
    aspect_ratio:           AspectRatio    = AspectRatio.WIDE
    motion_strength:        MotionStrength = MotionStrength.MEDIUM
    camera_movement:        CameraMovement = CameraMovement.STATIC
    lighting_style:         LightingStyle  = LightingStyle.SOFT_NATURAL
    visual_style:           VisualStyle    = VisualStyle.CINEMATIC
    quality:                Quality        = Quality.HIGH
    seed:                   Optional[int]  = None
    negative_prompt:        Optional[str]  = Field(None, max_length=500)
    conditioning_image_b64: Optional[str]  = Field(None, description="First-frame image (base64)")
    reference_images_b64:   Optional[List[str]] = Field(None, description="Reference images (base64)")


# ── Kling parameter model ──────────────────────────────────────────────────────

class KlingParams(BaseModel):
    """Tunable parameters for Kling AI video generation."""
    kling_model:             str           = "kling-3.0"
    duration:                Literal[5, 10] = 5
    aspect_ratio:            AspectRatio   = AspectRatio.WIDE
    cfg_scale:               float         = Field(0.5, ge=0.0, le=1.0,
                                                   description="Subject/prompt adherence (0=creative, 1=strict)")
    motion_intensity:        float         = Field(0.5, ge=0.0, le=1.0,
                                                   description="Motion intensity (>0.5 enables pro mode)")
    negative_prompt:         Optional[str] = Field(None, max_length=500)
    # Base64-encoded images for conditioning / subject consistency
    conditioning_image_b64:  Optional[str] = Field(None,
        description="First-frame conditioning image (triggers image-to-video)")
    reference_image_b64:     Optional[str] = Field(None,
        description="Reference image/frame for UGC subject consistency")


# ── Unified generation request ─────────────────────────────────────────────────

class GenerateRequest(BaseModel):
    """
    Unified request for both video and image generation.
    Set `mode` to select the generation type, then populate either
    `video_params` or `image_params` (the other is ignored).
    Set `model_provider` to route between Runway, Veo and Kling for video generation.
    """
    model_config = ConfigDict(protected_namespaces=())

    brand_id:                Optional[str] = None
    mode:                    GenerationMode = GenerationMode.VIDEO
    model_provider:          Literal["runway", "veo", "kling"] = "runway"  # Runway is the default
    user_prompt:             str            = Field(..., min_length=10, max_length=1000)
    enhance_prompt:          bool           = True   # False = raw mode, skip Gemini
    additional_instructions: Optional[str]  = Field(None, max_length=500)
    runway_params:           Optional[RunwayParams] = None
    video_params:            Optional[VideoParams]  = None
    kling_params:            Optional[KlingParams]  = None
    image_params:            Optional[ImageParams]  = None

    def effective_runway_params(self) -> RunwayParams:
        return self.runway_params or RunwayParams()

    def effective_video_params(self) -> VideoParams:
        return self.video_params or VideoParams()

    def effective_kling_params(self) -> KlingParams:
        return self.kling_params or KlingParams()

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
    video_id:     str             # primary asset ID (first if multiple images)
    video_ids:    List[str] = []  # all generated asset IDs (≥1 for images)
    operation_id: Optional[str]
    status:       VideoStatus
    message:      str
    mode:         GenerationMode = GenerationMode.VIDEO
    provider:     Optional[str]  = None  # e.g. "Runway gen4_turbo" | "Veo" | "Kling"


# ── Legacy request (kept for backward compatibility) ───────────────────────────

class VideoGenerateRequest(BaseModel):
    brand_id:                str
    user_prompt:             str = Field(..., min_length=10, max_length=1000)
    additional_instructions: Optional[str] = None


# ── Prompt enhancement ─────────────────────────────────────────────────────────

class PromptEnhanceRequest(BaseModel):
    user_prompt:        str
    brand_instructions: str
    reference_images:   List[str] = []


class PromptEnhanceResponse(BaseModel):
    enhanced_prompt: str
    original_prompt: str


# ── Avatar / AI Creator schemas ────────────────────────────────────────────────

class AvatarResponse(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    id:                  str
    name:                str
    description:         Optional[str]  = None
    image_url:           Optional[str]  = None
    status:              AvatarStatus   = AvatarStatus.TRAINING
    training_progress:   int            = 0
    model_provider:      str            = "runway"
    character_id:        Optional[str]  = None
    custom_model_id:     Optional[str]  = None
    training_job_id:     Optional[str]  = None
    voice_clone_enabled: bool           = False
    product_locked:      bool           = False
    tags:                List[str]      = []
    gender:              Optional[str]  = None
    age:                 Optional[str]  = None
    gesture:             Optional[str]  = None
    background:          Optional[str]  = None
    is_custom:           bool           = False
    created_at:          datetime


class TrainCreatorResponse(BaseModel):
    avatar_id:       str
    training_job_id: str
    message:         str
