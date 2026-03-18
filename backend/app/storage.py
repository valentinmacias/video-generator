from google.cloud import storage
from google.oauth2 import service_account
import os
import uuid
import logging
import httpx
from typing import Optional, Tuple
from .config import settings

logger = logging.getLogger(__name__)

_gcs_client: Optional[storage.Client] = None


def get_gcs_client() -> storage.Client:
    global _gcs_client
    if _gcs_client is None:
        if settings.GCS_CREDENTIALS_JSON:
            import json
            info = json.loads(settings.GCS_CREDENTIALS_JSON)
            creds = service_account.Credentials.from_service_account_info(
                info,
                scopes=["https://www.googleapis.com/auth/cloud-platform"],
            )
            _gcs_client = storage.Client(credentials=creds, project=settings.GCS_PROJECT_ID or info.get("project_id"))
        elif settings.GOOGLE_APPLICATION_CREDENTIALS:
            _gcs_client = storage.Client.from_service_account_json(
                settings.GOOGLE_APPLICATION_CREDENTIALS,
                project=settings.GCS_PROJECT_ID,
            )
        else:
            _gcs_client = storage.Client(project=settings.GCS_PROJECT_ID)
    return _gcs_client


def upload_file(
    file_bytes: bytes,
    content_type: str,
    folder: str = "uploads",
    filename: Optional[str] = None,
) -> str:
    """Upload bytes to GCS and return the gs:// URI."""
    client = get_gcs_client()
    bucket = client.bucket(settings.GCS_BUCKET_NAME)

    if not filename:
        ext = _ext_from_content_type(content_type)
        filename = f"{uuid.uuid4()}{ext}"

    blob_name = f"{folder}/{filename}"
    blob = bucket.blob(blob_name)
    blob.upload_from_string(file_bytes, content_type=content_type)

    gcs_uri = f"gs://{settings.GCS_BUCKET_NAME}/{blob_name}"
    logger.info(f"Uploaded to {gcs_uri}")
    return gcs_uri


def upload_video_from_uri(source_uri: str, video_id: str) -> Tuple[str, str]:
    """
    Copy a video to our GCS bucket.
    Handles both gs:// URIs (GCS copy) and https:// URIs (download then upload).
    Returns (gcs_uri, signed_url).
    """
    if source_uri.startswith("https://"):
        return _upload_video_from_https(source_uri, video_id)

    client = get_gcs_client()
    bucket = client.bucket(settings.GCS_BUCKET_NAME)
    blob_name = f"videos/{video_id}.mp4"

    source_bucket_name, source_blob_name = _parse_gcs_uri(source_uri)
    source_bucket = client.bucket(source_bucket_name)
    source_blob = source_bucket.blob(source_blob_name)
    source_bucket.copy_blob(source_blob, bucket, blob_name)

    gcs_uri = f"gs://{settings.GCS_BUCKET_NAME}/{blob_name}"
    signed_url = generate_signed_url(blob_name)
    return gcs_uri, signed_url


def _upload_video_from_https(url: str, video_id: str) -> Tuple[str, str]:
    """Download a video from an https URL (e.g. Google Files API) and upload to GCS."""
    # Only append Google API key for Google-hosted URLs (Files API, etc.)
    download_url = url
    if "googleapis.com" in url or "generativelanguage.google" in url:
        if "?" not in url:
            download_url = f"{url}?key={settings.GOOGLE_API_KEY}"
        else:
            download_url = f"{url}&key={settings.GOOGLE_API_KEY}"

    logger.info(f"Downloading video from {url[:60]}... for video {video_id}")
    with httpx.Client(timeout=120, follow_redirects=True) as client:
        resp = client.get(download_url)
        resp.raise_for_status()
        video_bytes = resp.content

    logger.info(f"Downloaded {len(video_bytes)} bytes, uploading to GCS")
    return save_video_bytes(video_bytes, video_id)


def save_video_bytes(video_bytes: bytes, video_id: str) -> Tuple[str, str]:
    """Save raw video bytes and return (gcs_uri, signed_url)."""
    client = get_gcs_client()
    bucket = client.bucket(settings.GCS_BUCKET_NAME)
    blob_name = f"videos/{video_id}.mp4"
    blob = bucket.blob(blob_name)
    blob.upload_from_string(video_bytes, content_type="video/mp4")
    gcs_uri = f"gs://{settings.GCS_BUCKET_NAME}/{blob_name}"
    signed_url = generate_signed_url(blob_name)
    return gcs_uri, signed_url


def generate_signed_url(blob_name: str, expiration_minutes: int = 60 * 24) -> str:
    """Generate a signed HTTPS URL (valid for 24 hours by default)."""
    import datetime
    client = get_gcs_client()
    bucket = client.bucket(settings.GCS_BUCKET_NAME)
    blob = bucket.blob(blob_name)
    url = blob.generate_signed_url(
        expiration=datetime.timedelta(minutes=expiration_minutes),
        method="GET",
        version="v4",
    )
    return url


def get_public_url(blob_name: str) -> str:
    return f"https://storage.googleapis.com/{settings.GCS_BUCKET_NAME}/{blob_name}"


# ── Helpers ────────────────────────────────────────────────────────────────────

def _parse_gcs_uri(uri: str) -> Tuple[str, str]:
    """Parse gs://bucket/path into (bucket, path)."""
    assert uri.startswith("gs://"), f"Not a GCS URI: {uri}"
    parts = uri[5:].split("/", 1)
    return parts[0], parts[1] if len(parts) > 1 else ""


def _ext_from_content_type(content_type: str) -> str:
    mapping = {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
        "image/gif": ".gif",
        "video/mp4": ".mp4",
    }
    return mapping.get(content_type, ".bin")
