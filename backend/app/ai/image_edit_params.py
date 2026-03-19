"""
Parameters for Imagen inpainting / image-edit requests.

All values are validated in __post_init__ so callers receive a ValueError
with a clear message before any API call is made.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional


@dataclass
class ImageEditParams:
    """
    Controls for the Imagen edit_image (inpainting) call.

    Attributes
    ----------
    image_strength : float
        How aggressively the edit region is changed.
        Maps to mask_dilation / edit intensity guidance.
        Range: 0.1–0.35.  Default: 0.22.
    guidance_scale : float
        Classifier-free guidance scale passed to Imagen edit.
        Higher = prompt adherence; lower = more creative variation.
        Range: 3–7.  Default: 4.5.
    preserve_background : bool
        If True, background pixels outside the mask are copied from the
        original image after editing.  Default: True.
    mask_feather_px : int
        Gaussian blur sigma (pixels) applied to mask edges before editing.
        Default: 3.
    seed : Optional[int]
        Deterministic seed for Imagen.  None = random.
    steps : int
        Diffusion steps.  Ignored by Imagen API (kept for future use).
    """

    image_strength: float = 0.22
    guidance_scale: float = 4.5
    preserve_background: bool = True
    mask_feather_px: int = 3
    seed: Optional[int] = None
    steps: int = 28

    def __post_init__(self) -> None:
        if not (0.1 <= self.image_strength <= 0.35):
            raise ValueError(
                f"image_strength must be between 0.1 and 0.35, got {self.image_strength!r}. "
                "Values above 0.35 risk over-editing; below 0.1 produce no visible change."
            )
        if not (3.0 <= self.guidance_scale <= 7.0):
            raise ValueError(
                f"guidance_scale must be between 3 and 7, got {self.guidance_scale!r}. "
                "Values outside this range produce unstable outputs."
            )
