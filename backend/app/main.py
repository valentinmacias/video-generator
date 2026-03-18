"""
Video Brand Generator — FastAPI Backend
"""
from fastapi import FastAPI, HTTPException, UploadFile, File, Form, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from typing import List, Optional
import logging

from .config import settings
from .models import (
    BrandCreate, BrandResponse,
    VideoGenerateRequest, VideoGenerateResponse, VideoResponse,
    GenerateRequest, GenerationMode,
    VideoStatus, PromptEnhanceRequest, PromptEnhanceResponse,
    AvatarResponse, TrainCreatorResponse,
)
from .database import (
    create_brand, get_brand, list_brands, update_brand_images,
    create_video, update_video_operation, update_video_completed,
    update_video_failed, get_video, list_videos,
    create_avatar, update_avatar_training, get_avatar, list_avatars,
)
from .gemini_client import enhance_prompt
from .veo_client import generate_branded_video
from .kling_client import generate_kling_video
from .runway_client import generate_runway_video, create_runway_character, train_custom_model
from .imagen_client import generate_images
from .storage import upload_file, generate_signed_url
from .worker import start_worker, stop_worker

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s — %(message)s")
logger = logging.getLogger(__name__)


# ── Lifespan ───────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    start_worker()
    yield
    stop_worker()


app = FastAPI(
    title="Video Brand Generator API",
    version="2.0.0",
    description="Generate brand-consistent videos and images with Google Veo and Imagen",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Health ─────────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "version": "2.0.0"}


# ── Brand endpoints ────────────────────────────────────────────────────────────

@app.post("/api/brands", response_model=BrandResponse, status_code=201)
async def create_brand_endpoint(payload: BrandCreate):
    brand = await create_brand(name=payload.name, style_guide=payload.style_guide)
    return BrandResponse(**brand)


@app.get("/api/brands", response_model=List[BrandResponse])
async def list_brands_endpoint():
    brands = await list_brands()
    return [BrandResponse(**b) for b in brands]


@app.get("/api/brands/{brand_id}", response_model=BrandResponse)
async def get_brand_endpoint(brand_id: str):
    brand = await get_brand(brand_id)
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")
    return BrandResponse(**brand)


@app.post("/api/brands/{brand_id}/images")
async def upload_brand_images(
    brand_id: str,
    files: List[UploadFile] = File(...),
):
    """Upload up to 3 brand reference images (JPEG/PNG/WebP)."""
    brand = await get_brand(brand_id)
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")

    allowed_types = {"image/jpeg", "image/png", "image/webp"}
    uris: List[str] = []

    for file in files[:3]:
        if file.content_type not in allowed_types:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported file type: {file.content_type}. Use JPEG, PNG or WebP.",
            )
        data = await file.read()
        uri = upload_file(
            file_bytes=data,
            content_type=file.content_type,
            folder=f"brands/{brand_id}/references",
        )
        uris.append(uri)

    updated = await update_brand_images(brand_id, uris)
    return {"brand_id": brand_id, "reference_images": updated["reference_images"]}


# ── Prompt enhancement ─────────────────────────────────────────────────────────

@app.post("/api/prompt/enhance", response_model=PromptEnhanceResponse)
async def enhance_prompt_endpoint(payload: PromptEnhanceRequest):
    """Preview the Gemini-enhanced cinematic prompt without generating anything."""
    enhanced = await enhance_prompt(
        user_prompt=payload.user_prompt,
        brand_instructions=payload.brand_instructions,
        reference_images=payload.reference_images,
    )
    return PromptEnhanceResponse(
        enhanced_prompt=enhanced,
        original_prompt=payload.user_prompt,
    )


# ── Unified generation endpoint ────────────────────────────────────────────────

@app.post("/api/generate", response_model=VideoGenerateResponse, status_code=202)
async def generate_endpoint(payload: GenerateRequest):
    """
    Unified endpoint for both video and image generation.

    Video mode (async):
      - Enhances prompt with Gemini (unless raw mode)
      - Submits to Veo → returns operation_id for polling
      - Background worker completes the video and updates the DB

    Image mode (synchronous):
      - Enhances prompt with Gemini (unless raw mode)
      - Generates images with Imagen 3 immediately
      - Uploads each image to GCS and creates a DB record per image
      - Returns with status=COMPLETED — no polling needed
    """
    brand = await get_brand(payload.brand_id)
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")

    # Merge brand style guide + caller's additional instructions
    brand_instructions = brand.get("style_guide") or ""
    if payload.additional_instructions:
        brand_instructions = f"{brand_instructions}\n{payload.additional_instructions}".strip()

    # Optionally enhance the prompt with Gemini
    if payload.enhance_prompt:
        final_prompt = await enhance_prompt(
            user_prompt=payload.user_prompt,
            brand_instructions=brand_instructions,
            reference_images=brand.get("reference_images", []),
        )
    else:
        final_prompt = payload.user_prompt

    # ── Video generation (async) ───────────────────────────────────────────────
    if payload.mode == GenerationMode.VIDEO:
        # Hard stop: Runway requested but not configured
        if payload.model_provider == "runway" and not settings.RUNWAYML_API_SECRET:
            raise HTTPException(
                status_code=503,
                detail="Runway is selected but RUNWAYML_API_SECRET is not configured.",
            )

        video = await create_video(
            brand_id=payload.brand_id,
            user_prompt=payload.user_prompt,
            enhanced_prompt=final_prompt,
        )
        video_id = video["id"]

        # ── STRICT provider routing — NO fallback between providers ───────────
        try:
            if payload.model_provider == "runway":
                rp = payload.effective_runway_params()
                logger.info(
                    f"=== STRICT ROUTING: Using Runway Gen-4 Turbo ==="
                    f" [video={video_id}]"
                )
                operation_name, _ = await generate_runway_video(
                    prompt=final_prompt,
                    runway_params=rp,
                    brand_references=brand.get("reference_images", []),
                    brand_instructions=brand_instructions,
                )
                provider_label = f"Runway {rp.runway_model.value}"

            elif payload.model_provider == "kling":
                kp = payload.effective_kling_params()
                logger.info(
                    f"=== STRICT ROUTING: Using Kling ==="
                    f" [video={video_id}]"
                )
                operation_name, _ = await generate_kling_video(
                    prompt=final_prompt,
                    kling_model=kp.kling_model,
                    conditioning_image_b64=kp.conditioning_image_b64,
                    reference_image_b64=kp.reference_image_b64,
                    cfg_scale=kp.cfg_scale,
                    motion_intensity=kp.motion_intensity,
                    duration=kp.duration,
                    aspect_ratio=kp.aspect_ratio.value,
                    negative_prompt=kp.negative_prompt,
                )
                provider_label = "Kling"

            elif payload.model_provider == "veo":
                vp = payload.effective_video_params()
                logger.info(
                    f"=== STRICT ROUTING: Using Google Veo ==="
                    f" [video={video_id}]"
                )
                operation_name, _ = await generate_branded_video(
                    user_prompt=final_prompt,
                    brand_references=brand.get("reference_images", []),
                    brand_instructions=brand_instructions,
                    video_params=vp,
                )
                provider_label = "Veo"

            else:
                # Unknown provider — refuse rather than silently route anywhere
                await update_video_failed(video_id, f"Unknown model_provider: {payload.model_provider!r}")
                raise HTTPException(
                    status_code=400,
                    detail=f"Unknown model_provider {payload.model_provider!r}. Use 'runway', 'veo', or 'kling'.",
                )

            await update_video_operation(video_id, operation_name)
            logger.info(
                f"[video={video_id}] Submitted to {provider_label}"
                f" | operation={operation_name}"
            )

            return VideoGenerateResponse(
                video_id=video_id,
                video_ids=[video_id],
                operation_id=operation_name,
                status=VideoStatus.PROCESSING,
                message=f"Video generation started via {provider_label}.",
                mode=GenerationMode.VIDEO,
                provider=provider_label,
            )

        except HTTPException:
            raise  # re-raise 400/503 from above without wrapping
        except Exception as e:
            await update_video_failed(video_id, str(e))
            logger.error(
                f"[video={video_id}] {payload.model_provider} API error: {e}",
                exc_info=True,
            )
            raise HTTPException(
                status_code=502,
                detail=f"{payload.model_provider.capitalize()} API error: {e}",
            )

    # ── Image generation (sync, Imagen 3) ─────────────────────────────────────
    elif payload.mode == GenerationMode.IMAGE:
        ip = payload.effective_image_params()

        try:
            image_bytes_list = await generate_images(
                prompt=final_prompt,
                params=ip,
                brand_instructions=brand_instructions,
            )
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Imagen API error: {e}")

        if not image_bytes_list:
            raise HTTPException(status_code=502, detail="Imagen returned no images")

        video_ids: List[str] = []
        for i, img_bytes in enumerate(image_bytes_list):
            # Create a DB record for each image (reuses the videos table)
            record = await create_video(
                brand_id=payload.brand_id,
                user_prompt=payload.user_prompt,
                enhanced_prompt=final_prompt,
            )
            record_id = record["id"]

            # Upload image to GCS and generate a signed HTTPS URL for the frontend
            try:
                blob_name = f"generated/images/{record_id}/image.jpg"
                upload_file(
                    file_bytes=img_bytes,
                    content_type="image/jpeg",
                    folder=f"generated/images/{record_id}",
                    filename="image.jpg",
                )
                image_url = generate_signed_url(blob_name)
                await update_video_completed(record_id, video_url=image_url)
            except Exception as e:
                logger.error(f"Failed to upload image {i} for record {record_id}: {e}")
                await update_video_failed(record_id, f"Upload failed: {e}")

            video_ids.append(record_id)

        primary_id = video_ids[0] if video_ids else ""
        return VideoGenerateResponse(
            video_id=primary_id,
            video_ids=video_ids,
            operation_id=None,
            status=VideoStatus.COMPLETED,
            message=f"{len(video_ids)} image(s) generated successfully.",
            mode=GenerationMode.IMAGE,
        )

    else:
        raise HTTPException(status_code=400, detail=f"Unknown generation mode: {payload.mode}")


# ── Avatar / AI Creator endpoints ─────────────────────────────────────────────

@app.post("/api/train-ai-creator", response_model=TrainCreatorResponse, status_code=202)
async def train_ai_creator_endpoint(
    name:                str          = Form(...),
    description:         str          = Form(""),
    voice_clone_enabled: bool         = Form(False),
    product_locked:      bool         = Form(False),
    files: List[UploadFile]           = File(default=[]),
):
    """
    Train a custom Runway Gen-4.5 AI creator from UGC clips.

    Accepts:
    - name, description (form fields)
    - voice_clone_enabled, product_locked (toggles)
    - files: training media (UGC clips, product images, audio)

    Returns immediately with avatar_id. Poll /api/avatars/{avatar_id} for training progress.
    """
    if not settings.RUNWAYML_API_SECRET:
        raise HTTPException(
            status_code=503,
            detail="Runway API not configured. Add RUNWAYML_API_SECRET to your environment.",
        )

    # Create the avatar record immediately so user can poll progress
    avatar = await create_avatar(
        name=name,
        description=description,
        voice_clone_enabled=voice_clone_enabled,
        product_locked=product_locked,
    )
    avatar_id = avatar["id"]

    # Upload training data to GCS
    training_data_url: Optional[str] = None
    if files:
        combined_bytes = b""
        for f in files[:50]:  # Limit to 50 files per request
            data = await f.read()
            combined_bytes += data
        if combined_bytes:
            gcs_uri = upload_file(
                file_bytes=combined_bytes,
                content_type="application/octet-stream",
                folder=f"training/{avatar_id}",
                filename="training_data.bin",
            )
            # Convert gs:// URI to a signed HTTPS URL for Runway
            blob_name = gcs_uri.replace(f"gs://{settings.GCS_BUCKET_NAME}/", "")
            training_data_url = generate_signed_url(blob_name, expiration_minutes=1440)

    training_job_id = f"pending:{avatar_id}"

    try:
        # Create Runway Character
        character_id = await create_runway_character(
            name=name,
            description=description,
            training_data_url=training_data_url or "",
        )

        # Trigger Gen-4.5 custom model training
        training_job_id = await train_custom_model(
            character_id=character_id,
            training_data_url=training_data_url or "",
            model_name=f"{name} Custom Model",
        )

        await update_avatar_training(avatar_id, training_job_id, character_id)
        logger.info(f"Runway training started for avatar {avatar_id}: job={training_job_id}")

    except Exception as e:
        logger.error(f"Runway training initiation failed for {avatar_id}: {e}")
        # Store pending job so user can see progress even if Runway call failed
        await update_avatar_training(avatar_id, training_job_id)

    return TrainCreatorResponse(
        avatar_id=avatar_id,
        training_job_id=training_job_id,
        message=f"Training started for '{name}'. Monitor progress at /api/avatars/{avatar_id}",
    )


@app.get("/api/avatars", response_model=List[AvatarResponse])
async def list_avatars_endpoint():
    avatars = await list_avatars()
    return [AvatarResponse(**a) for a in avatars]


@app.get("/api/avatars/{avatar_id}", response_model=AvatarResponse)
async def get_avatar_endpoint(avatar_id: str):
    avatar = await get_avatar(avatar_id)
    if not avatar:
        raise HTTPException(status_code=404, detail="Avatar not found")
    return AvatarResponse(**avatar)


# ── Legacy video endpoint (backward compatibility) ─────────────────────────────

@app.post("/api/videos/generate", response_model=VideoGenerateResponse, status_code=202)
async def generate_video_endpoint(payload: VideoGenerateRequest):
    """
    Legacy video generation endpoint. Wraps the new /api/generate endpoint.
    Kept for backward compatibility.
    """
    return await generate_endpoint(
        GenerateRequest(
            brand_id=payload.brand_id,
            mode=GenerationMode.VIDEO,
            model_provider="runway",  # explicit — never rely on default
            user_prompt=payload.user_prompt,
            enhance_prompt=True,
            additional_instructions=payload.additional_instructions,
        )
    )


# ── Asset/video retrieval ──────────────────────────────────────────────────────

@app.get("/api/videos/{video_id}", response_model=VideoResponse)
async def get_video_endpoint(video_id: str):
    video = await get_video(video_id)
    if not video:
        raise HTTPException(status_code=404, detail="Asset not found")
    return VideoResponse(**video)


@app.get("/api/videos", response_model=List[VideoResponse])
async def list_videos_endpoint(brand_id: Optional[str] = None, limit: int = 20):
    videos = await list_videos(brand_id=brand_id, limit=limit)
    return [VideoResponse(**v) for v in videos]
