"""
Person segmentation for masked image editing.

Uses rembg (U2Net human-seg) to produce a binary person mask.
Model loads once globally as a singleton — thread-safe via threading.Lock.

Structured log events emitted:
  SEGMENTATION_SUCCESS  — mask produced successfully
  SEGMENTATION_FALLBACK — segmentation failed; caller should use full-image mask

CPU-compatible, no GPU required.  Target: <700 ms on modern CPU.
"""
from __future__ import annotations

import io
import logging
import threading
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)

# ── Singleton ──────────────────────────────────────────────────────────────────

_lock: threading.Lock = threading.Lock()
_segmenter_instance: Optional["PersonSegmenter"] = None


def get_segmenter() -> "PersonSegmenter":
    """Return the process-wide PersonSegmenter singleton (creates on first call)."""
    global _segmenter_instance
    if _segmenter_instance is None:
        with _lock:
            if _segmenter_instance is None:
                _segmenter_instance = PersonSegmenter()
    return _segmenter_instance


# ── PersonSegmenter ────────────────────────────────────────────────────────────

class PersonSegmenter:
    """
    Lazy-loaded person segmenter backed by rembg u2net_human_seg.

    Thread-safe: model session initialisation uses an internal lock so
    concurrent first-call requests don't double-load the model weights.
    """

    # rembg model name — specifically trained on human body segmentation
    _MODEL_NAME = "u2net_human_seg"

    def __init__(self) -> None:
        self._session = None          # None = not yet loaded; "FAILED" = load failed
        self._init_lock = threading.Lock()
        logger.info(
            "PersonSegmenter created — model '%s' loads on first use",
            self._MODEL_NAME,
        )

    # ── Session init ───────────────────────────────────────────────────────────

    def _ensure_session(self) -> None:
        if self._session is not None:
            return
        with self._init_lock:
            if self._session is not None:
                return
            try:
                from rembg import new_session  # noqa: PLC0415
                self._session = new_session(self._MODEL_NAME)
                logger.info(
                    "PersonSegmenter: '%s' session ready", self._MODEL_NAME
                )
            except Exception as exc:
                logger.error(
                    "PersonSegmenter: failed to initialise rembg session: %s", exc
                )
                self._session = "FAILED"

    # ── Public API ─────────────────────────────────────────────────────────────

    def get_person_mask(self, image: np.ndarray) -> Optional[np.ndarray]:
        """
        Segment the person in *image* and return a uint8 HxW mask.

        Parameters
        ----------
        image : np.ndarray
            RGB image as a HxW×3 uint8 numpy array.

        Returns
        -------
        np.ndarray | None
            HxW uint8 mask where 255 = person pixels to edit,
                                   0 = background to preserve.
            Returns None if segmentation fails (FAILSAFE — never crashes).
        """
        try:
            self._ensure_session()
            if self._session == "FAILED":
                logger.warning("SEGMENTATION_FALLBACK: rembg session unavailable")
                return None

            from rembg import remove          # noqa: PLC0415
            from PIL import Image as PILImage  # noqa: PLC0415

            # ── 1. numpy → PNG bytes for rembg ────────────────────────────────
            pil_img = PILImage.fromarray(image.astype(np.uint8))
            buf = io.BytesIO()
            pil_img.save(buf, format="PNG")
            input_bytes = buf.getvalue()

            # ── 2. rembg → RGBA (alpha = foreground confidence) ───────────────
            output_bytes = remove(input_bytes, session=self._session)
            rgba = PILImage.open(io.BytesIO(output_bytes)).convert("RGBA")
            alpha = np.array(rgba)[:, :, 3].astype(np.uint8)  # HxW uint8

            # ── 3. If multiple blobs exist, keep only the largest central one ──
            alpha = _keep_largest_central_blob(alpha)

            # ── 4. Morphological close — fill interior holes ───────────────────
            import cv2  # noqa: PLC0415
            kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15))
            alpha = cv2.morphologyEx(alpha, cv2.MORPH_CLOSE, kernel)

            # ── 5. Feather edges with 3 px gaussian blur ──────────────────────
            alpha = cv2.GaussianBlur(alpha, (7, 7), sigmaX=3.0, sigmaY=3.0)

            coverage = float((alpha > 127).sum()) / alpha.size * 100.0
            logger.info(
                "SEGMENTATION_SUCCESS: coverage=%.1f%% | shape=%s",
                coverage,
                alpha.shape,
            )
            return alpha

        except Exception as exc:
            logger.warning(
                "SEGMENTATION_FALLBACK: unexpected error — %s", exc, exc_info=True
            )
            return None


# ── Internal helpers ───────────────────────────────────────────────────────────

def _keep_largest_central_blob(mask: np.ndarray) -> np.ndarray:
    """
    Given a uint8 mask from rembg, return a mask containing only the largest
    blob that is closest to the image centre.  This avoids picking up small
    artifacts when multiple foreground regions are detected.

    Falls back to the original mask unchanged if OpenCV is not available or if
    no valid contours are found.
    """
    try:
        import cv2  # noqa: PLC0415

        binary = (mask > 127).astype(np.uint8) * 255
        num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(
            binary, connectivity=8
        )
        if num_labels <= 1:
            # Nothing or only background — return as-is
            return mask

        h, w = mask.shape
        cx, cy = w / 2.0, h / 2.0

        best_label = -1
        best_score = -1.0

        # Skip label 0 (background)
        for label in range(1, num_labels):
            area = int(stats[label, cv2.CC_STAT_AREA])
            lx, ly = float(centroids[label][0]), float(centroids[label][1])
            dist = ((lx - cx) ** 2 + (ly - cy) ** 2) ** 0.5
            max_dist = ((cx) ** 2 + (cy) ** 2) ** 0.5 or 1.0
            # Weighted score: larger area closer to centre wins
            score = area * (1.0 - dist / max_dist * 0.5)
            if score > best_score:
                best_score = score
                best_label = label

        if best_label < 0:
            return mask

        selected = (labels == best_label).astype(np.uint8) * 255
        # Blend back the soft alpha values from rembg within the selected region
        result = np.where(selected > 0, mask, np.uint8(0))
        return result.astype(np.uint8)

    except Exception:
        return mask
