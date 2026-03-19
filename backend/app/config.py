from pydantic import Field
from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    # Google AI
    GOOGLE_API_KEY: str
    VEO_MODEL: str = "veo-2.0-generate-001"
    GEMINI_MODEL: str = "gemini-1.5-flash"

    # Runway ML
    RUNWAYML_API_SECRET: Optional[str] = None
    RUNWAY_API_BASE_URL: str = Field(
        default="https://api.dev.runwayml.com",
        description=(
            "Use https://api.dev.runwayml.com for sandbox/dev keys (most users). "
            "Use https://api.runwayml.com only for production keys that consume credits."
        ),
    )

    # Legacy — no longer used (image editing now via Google Imagen 3)
    NANO_BANANA_API_KEY: Optional[str] = None

    # Gemini Veo API key — defaults to GOOGLE_API_KEY if not set separately
    # Set this to a dedicated Veo key for quota isolation.
    GEMINI_VEO_API_KEY: Optional[str] = None

    # Kling AI (legacy fallback)
    KLING_ACCESS_KEY: Optional[str] = None
    KLING_SECRET_KEY: Optional[str] = None

    # Supabase
    SUPABASE_URL: str
    SUPABASE_KEY: str

    # Google Cloud Storage
    GCS_BUCKET_NAME: str
    GCS_PROJECT_ID: Optional[str] = None
    GOOGLE_APPLICATION_CREDENTIALS: Optional[str] = None  # path to JSON key file
    GCS_CREDENTIALS_JSON: Optional[str] = None            # raw JSON string (preferred for cloud deployments)

    # Vertex AI — Gemini + Imagen 3 image pipeline
    # Region is hard-coded to us-central1 (only region supporting Imagen 3)
    VERTEX_GEMINI_MODEL: str = "gemini-2.5-flash"         # prompt enhancement
    VERTEX_IMAGEN_MODEL: str = "imagen-3.0-generate-002"  # HQ generation
    VERTEX_IMAGEN_FAST_MODEL: str = "imagen-3.0-fast-generate-001"  # fast mode

    # App
    CORS_ORIGINS: str = "http://localhost:3000"
    POLL_INTERVAL_SECONDS: int = 20

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
