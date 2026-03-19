"""
Shared error types and configuration models for the Vertex AI image pipeline.
"""
from __future__ import annotations

from enum import Enum
from typing import Any


# ── Error taxonomy ─────────────────────────────────────────────────────────────

class PipelineErrorType(str, Enum):
    MODEL_ERROR   = "MODEL_ERROR"    # wrong model name / unsupported operation
    QUOTA_ERROR   = "QUOTA_ERROR"    # 429 / rate-limit / billing quota
    AUTH_ERROR    = "AUTH_ERROR"     # credentials missing or expired
    REGION_ERROR  = "REGION_ERROR"   # model not available in us-central1
    SAFETY_ERROR  = "SAFETY_ERROR"   # safety filter blocked output
    UNKNOWN_ERROR = "UNKNOWN_ERROR"


class PipelineError(Exception):
    """
    Structured exception raised by every layer of the pipeline.

    Attributes
    ----------
    error_type : PipelineErrorType
    message    : str          Human-readable description.
    retryable  : bool         True if the caller should back-off and retry.
    """

    def __init__(
        self,
        error_type: PipelineErrorType,
        message: str,
        retryable: bool = False,
    ) -> None:
        self.error_type = error_type
        self.message    = message
        self.retryable  = retryable
        super().__init__(message)

    def to_dict(self) -> dict[str, Any]:
        return {
            "type":      self.error_type.value,
            "retryable": self.retryable,
            "message":   self.message,
        }

    def __repr__(self) -> str:
        return (
            f"PipelineError(type={self.error_type.value!r}, "
            f"retryable={self.retryable}, message={self.message!r})"
        )


# ── Error classifier ───────────────────────────────────────────────────────────

def classify_vertex_error(exc: Exception) -> PipelineError:
    """
    Map a raw Vertex AI / gRPC / google-auth exception to a typed PipelineError.
    Never raises — always returns a PipelineError.

    Order matters: type-checks run first so google-auth exceptions are never
    mis-labelled as REGION_ERROR by the string-matching fallback.
    """
    # ── Type-based classification (highest priority) ───────────────────────────
    try:
        import google.auth.exceptions  # noqa: PLC0415
        if isinstance(exc, google.auth.exceptions.DefaultCredentialsError):
            return PipelineError(
                PipelineErrorType.AUTH_ERROR,
                "AUTH_ERROR: Google Cloud credentials not configured. "
                "Set GCS_CREDENTIALS_JSON or GOOGLE_APPLICATION_CREDENTIALS. "
                f"Detail: {exc}",
                retryable=False,
            )
        if isinstance(exc, google.auth.exceptions.TransportError):
            return PipelineError(
                PipelineErrorType.AUTH_ERROR,
                f"Network error during Google auth: {exc}",
                retryable=True,
            )
    except ImportError:
        pass

    # ── String-based classification (fallback) ─────────────────────────────────
    msg = str(exc).lower()

    # Auth / permission — check BEFORE 404 to avoid mis-labelling
    if any(k in msg for k in (
        "unauthenticated", "permission denied", "access denied",
        "credentials", "defaultcredentialserror", "could not automatically determine",
    )):
        return PipelineError(
            PipelineErrorType.AUTH_ERROR,
            f"Authentication failed — check service-account credentials. Detail: {exc}",
            retryable=False,
        )

    if any(k in msg for k in ("403",)):
        return PipelineError(
            PipelineErrorType.AUTH_ERROR,
            f"Permission denied (HTTP 403) — verify IAM roles on the service account. Detail: {exc}",
            retryable=False,
        )

    # Model not found — only after auth checks pass
    if any(k in msg for k in ("404", "not found", "does not exist")):
        return PipelineError(
            PipelineErrorType.MODEL_ERROR,
            f"Model not found — verify model name and that it is available in us-central1. Detail: {exc}",
            retryable=False,
        )

    if any(k in msg for k in ("invalid_argument", "invalid argument", "400")):
        return PipelineError(
            PipelineErrorType.MODEL_ERROR,
            f"Invalid argument — check model / modality config. Detail: {exc}",
            retryable=False,
        )

    if any(k in msg for k in ("429", "quota", "resource_exhausted", "rate limit")):
        return PipelineError(
            PipelineErrorType.QUOTA_ERROR,
            f"Quota exceeded — back-off and retry. Detail: {exc}",
            retryable=True,
        )

    if any(k in msg for k in ("safety", "blocked", "policy")):
        return PipelineError(
            PipelineErrorType.SAFETY_ERROR,
            f"Safety filter blocked the request — rephrase the prompt. Detail: {exc}",
            retryable=False,
        )

    return PipelineError(
        PipelineErrorType.UNKNOWN_ERROR,
        f"Unexpected error: {exc}",
        retryable=True,
    )
