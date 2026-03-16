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
    VideoStatus, PromptEnhanceRequest, PromptEnhanceResponse,
)
from .database import (
    create_brand, get_brand, list_brands, update_brand_images,
    create_video, update_video_operation, get_video, list_videos,
)
from .gemini_client import enhance_prompt
from .veo_client import generate_branded_video
from .storage import upload_file
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
    version="1.0.0",
    description="Generate brand-consistent videos with Google Veo 3.1",
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
    return {"status": "ok", "version": "1.0.0"}


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
    """Upload up to 3 brand reference images (JPEG/PNG)."""
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
    """Preview the Gemini-enhanced cinematic prompt without generating a video."""
    enhanced = await enhance_prompt(
        user_prompt=payload.user_prompt,
        brand_instructions=payload.brand_instructions,
        reference_images=payload.reference_images,
    )
    return PromptEnhanceResponse(
        enhanced_prompt=enhanced,
        original_prompt=payload.user_prompt,
    )


# ── Video generation ───────────────────────────────────────────────────────────

@app.post("/api/videos/generate", response_model=VideoGenerateResponse, status_code=202)
async def generate_video_endpoint(payload: VideoGenerateRequest):
    """
    Start async video generation.
    1. Load brand assets
    2. Enhance prompt with Gemini
    3. Submit to Veo 3.1 → get operation_id
    4. Persist to DB with PROCESSING status
    Returns immediately with the video_id for polling.
    """
    brand = await get_brand(payload.brand_id)
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")

    # Step 1 — Enhance prompt with Gemini
    brand_instructions = brand.get("style_guide") or ""
    if payload.additional_instructions:
        brand_instructions = f"{brand_instructions}\n{payload.additional_instructions}".strip()

    enhanced = await enhance_prompt(
        user_prompt=payload.user_prompt,
        brand_instructions=brand_instructions,
        reference_images=brand.get("reference_images", []),
    )

    # Step 2 — Create DB record (PENDING)
    video = await create_video(
        brand_id=payload.brand_id,
        user_prompt=payload.user_prompt,
        enhanced_prompt=enhanced,
    )
    video_id = video["id"]

    # Step 3 — Submit to Veo
    try:
        operation_name, _ = await generate_branded_video(
            user_prompt=enhanced,
            brand_references=brand.get("reference_images", []),
            brand_instructions=brand_instructions,
        )
        await update_video_operation(video_id, operation_name)

        return VideoGenerateResponse(
            video_id=video_id,
            operation_id=operation_name,
            status=VideoStatus.PROCESSING,
            message="Video generation started. Poll /api/videos/{id} for status.",
        )

    except Exception as e:
        from .database import update_video_failed
        await update_video_failed(video_id, str(e))
        raise HTTPException(status_code=502, detail=f"Veo API error: {e}")


@app.get("/api/videos/{video_id}", response_model=VideoResponse)
async def get_video_endpoint(video_id: str):
    video = await get_video(video_id)
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    return VideoResponse(**video)


@app.get("/api/videos", response_model=List[VideoResponse])
async def list_videos_endpoint(brand_id: Optional[str] = None, limit: int = 20):
    videos = await list_videos(brand_id=brand_id, limit=limit)
    return [VideoResponse(**v) for v in videos]
