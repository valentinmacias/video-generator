from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    # Google AI
    GOOGLE_API_KEY: str
    VEO_MODEL: str = "veo-2.0-generate-001"
    GEMINI_MODEL: str = "gemini-2.0-flash-lite"

    # Supabase
    SUPABASE_URL: str
    SUPABASE_KEY: str

    # Google Cloud Storage
    GCS_BUCKET_NAME: str
    GCS_PROJECT_ID: Optional[str] = None
    GOOGLE_APPLICATION_CREDENTIALS: Optional[str] = None

    # App
    CORS_ORIGINS: str = "http://localhost:3000"
    POLL_INTERVAL_SECONDS: int = 20

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
