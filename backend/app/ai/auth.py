"""
Google Cloud authentication for Vertex AI.
──────────────────────────────────────────
Single source of truth for credential loading and vertexai.init().

Two supported modes — auto-detected, no hardcoded paths:

  A) JSON key file (local dev / explicit)
     Set GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa.json
     OR set GCS_CREDENTIALS_JSON=<raw JSON string>

  B) Application Default Credentials (production)
     • Cloud Run / GKE  → attached service account (zero config)
     • GCE              → metadata server
     • Developer        → `gcloud auth application-default login`

Never hardcode /app/gcs-credentials.json or any other path.
"""
from __future__ import annotations

import json
import logging
import os
import tempfile
from typing import Optional, Tuple

import google.auth
import google.auth.exceptions
import google.auth.transport.requests
from google.auth.credentials import Credentials

from .models import PipelineError, PipelineErrorType

logger = logging.getLogger(__name__)

# Scopes required for Vertex AI
_VERTEX_SCOPES = ["https://www.googleapis.com/auth/cloud-platform"]

# Module-level state — init runs once per process
_initialized        = False
_resolved_project   = ""
_resolved_region    = "us-central1"


# ── Credential loading ─────────────────────────────────────────────────────────

def _load_credentials() -> Tuple[Credentials, str]:
    """
    Load Google credentials and resolve the GCP project ID.

    Resolution order
    ────────────────
    Credentials:
      1. GCS_CREDENTIALS_JSON  — inline SA JSON (Render / Fly.io secrets)
      2. GOOGLE_APPLICATION_CREDENTIALS — path to SA JSON file
      3. google.auth.default()  — ADC (Cloud Run / GKE / gcloud)

    Project ID:
      1. GCS_PROJECT_ID env var
      2. project_id field inside the SA JSON
      3. project returned by google.auth.default()
      4. GOOGLE_CLOUD_PROJECT / GCLOUD_PROJECT runtime vars

    Returns (credentials, project_id).
    Raises PipelineError(AUTH_ERROR) on any failure.
    """
    from ..config import settings  # noqa: PLC0415

    # ── Step 1: decide credential source ──────────────────────────────────────

    # Mode A-1: inline JSON string (cloud secrets / Render env vars)
    if settings.GCS_CREDENTIALS_JSON:
        try:
            sa_info = json.loads(settings.GCS_CREDENTIALS_JSON)
        except json.JSONDecodeError as exc:
            raise PipelineError(
                PipelineErrorType.AUTH_ERROR,
                f"GCS_CREDENTIALS_JSON is not valid JSON: {exc}",
                retryable=False,
            ) from exc

        try:
            from google.oauth2 import service_account  # noqa: PLC0415
            creds = service_account.Credentials.from_service_account_info(
                sa_info, scopes=_VERTEX_SCOPES
            )
            project_id = _pick_project(settings, sa_info.get("project_id"))
            logger.info("Auth mode: GCS_CREDENTIALS_JSON (service account)")
            return creds, project_id
        except Exception as exc:
            raise PipelineError(
                PipelineErrorType.AUTH_ERROR,
                f"Failed to build credentials from GCS_CREDENTIALS_JSON: {exc}",
                retryable=False,
            ) from exc

    # Mode A-2: path to JSON key file
    creds_path = (
        settings.GOOGLE_APPLICATION_CREDENTIALS
        or os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    )
    if creds_path:
        if not os.path.isfile(creds_path):
            raise PipelineError(
                PipelineErrorType.AUTH_ERROR,
                f"GOOGLE_APPLICATION_CREDENTIALS file not found: {creds_path!r}. "
                "Mount the file into the container or set GCS_CREDENTIALS_JSON instead.",
                retryable=False,
            )
        try:
            from google.oauth2 import service_account  # noqa: PLC0415
            with open(creds_path) as fh:
                sa_info = json.load(fh)
            creds = service_account.Credentials.from_service_account_file(
                creds_path, scopes=_VERTEX_SCOPES
            )
            project_id = _pick_project(settings, sa_info.get("project_id"))
            logger.info("Auth mode: GOOGLE_APPLICATION_CREDENTIALS=%s", creds_path)
            return creds, project_id
        except PipelineError:
            raise
        except Exception as exc:
            raise PipelineError(
                PipelineErrorType.AUTH_ERROR,
                f"Failed to load credentials from {creds_path!r}: {exc}",
                retryable=False,
            ) from exc

    # Mode B: Application Default Credentials (Cloud Run, GKE, gcloud)
    try:
        creds, adc_project = google.auth.default(scopes=_VERTEX_SCOPES)
        project_id = _pick_project(settings, adc_project)
        logger.info("Auth mode: Application Default Credentials (ADC)")
        return creds, project_id
    except google.auth.exceptions.DefaultCredentialsError as exc:
        raise PipelineError(
            PipelineErrorType.AUTH_ERROR,
            "Google Cloud credentials not configured. "
            "Options:\n"
            "  1. Set GCS_CREDENTIALS_JSON=<service-account JSON string>\n"
            "  2. Set GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa.json "
            "     (mount into container with -v ./key.json:/creds/sa.json)\n"
            "  3. Attach a service account to the Cloud Run / GKE workload (recommended for production)\n"
            f"Original error: {exc}",
            retryable=False,
        ) from exc


def _pick_project(settings, candidate: Optional[str]) -> str:
    """Return the first non-empty project ID from settings / credentials / env."""
    for pid in (
        settings.GCS_PROJECT_ID,
        candidate,
        os.environ.get("GOOGLE_CLOUD_PROJECT"),
        os.environ.get("GCLOUD_PROJECT"),
        os.environ.get("GCP_PROJECT"),
    ):
        if pid:
            return pid
    raise PipelineError(
        PipelineErrorType.AUTH_ERROR,
        "Cannot determine GCP project ID. "
        "Set GCS_PROJECT_ID in your .env, or ensure your service-account JSON "
        "contains a 'project_id' field.",
        retryable=False,
    )


# ── Token validation ───────────────────────────────────────────────────────────

def _validate_credentials(creds: Credentials) -> None:
    """
    Perform a token refresh to verify credentials are functional.
    This catches expired keys, revoked service accounts, and network
    issues before the first real API call.
    """
    try:
        request = google.auth.transport.requests.Request()
        creds.refresh(request)
        logger.info("Credentials validated — access token obtained successfully")
    except google.auth.exceptions.TransportError as exc:
        raise PipelineError(
            PipelineErrorType.AUTH_ERROR,
            f"Network error during credential validation: {exc}",
            retryable=True,
        ) from exc
    except Exception as exc:
        raise PipelineError(
            PipelineErrorType.AUTH_ERROR,
            f"Credential validation failed (token refresh error): {exc}",
            retryable=False,
        ) from exc


# ── Public API ─────────────────────────────────────────────────────────────────

def initialize_vertex_ai() -> str:
    """
    Load credentials, validate them, and call vertexai.init().

    Called once at app startup (lifespan hook). All subsequent pipeline
    calls skip re-initialisation via the module-level _initialized flag.

    Returns the resolved project ID.
    Raises PipelineError(AUTH_ERROR) on any failure — never REGION_ERROR.
    """
    global _initialized, _resolved_project

    if _initialized:
        return _resolved_project

    import vertexai  # noqa: PLC0415

    logger.info("Initialising Vertex AI…")

    # 1. Load credentials
    creds, project_id = _load_credentials()

    # 2. Validate credentials work (token refresh)
    _validate_credentials(creds)

    # 3. Validate project ID
    if not project_id:
        raise PipelineError(
            PipelineErrorType.AUTH_ERROR,
            "AUTH_ERROR: Google Cloud credentials not configured — project ID missing.",
            retryable=False,
        )

    # 4. Initialise Vertex AI SDK
    vertexai.init(
        project=project_id,
        location=_resolved_region,
        credentials=creds,
    )

    _initialized      = True
    _resolved_project = project_id

    logger.info(
        "Vertex AI ready | project=%s | region=%s",
        project_id,
        _resolved_region,
    )
    return project_id


def get_project_id() -> str:
    """Return the already-resolved project ID. Raises if not yet initialised."""
    if not _initialized:
        raise PipelineError(
            PipelineErrorType.AUTH_ERROR,
            "Vertex AI has not been initialised. Call initialize_vertex_ai() at startup.",
            retryable=False,
        )
    return _resolved_project
