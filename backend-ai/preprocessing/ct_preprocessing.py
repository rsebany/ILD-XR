from __future__ import annotations

from typing import Callable, Tuple

import numpy as np
import SimpleITK as sitk
from scipy import ndimage
from scipy.ndimage import uniform_filter
from skimage import measure, morphology, segmentation

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

HU_CLIP_LOWER = -1350.0
HU_CLIP_UPPER = 150.0
_HU_RANGE = HU_CLIP_UPPER - HU_CLIP_LOWER

LUNG_HU_THRESHOLD = -400
_MORPH_MAX_SIZE = 99  # skimage >=0.26; equivalent to legacy min_size=100
_ROI_BG_TOLERANCE = 1e-1
_ROI_FG_DELTA = 10.0

_DEFAULT_TARGET_SPACING = (1.0, 1.0, 1.0)  # (sz, sy, sx) mm


# ---------------------------------------------------------------------------
# Spacing helpers
# ---------------------------------------------------------------------------


def _spacing_zyx_to_xyz(spacing_zyx: Tuple[float, float, float]) -> Tuple[float, float, float]:
    """Convert (sz, sy, sx) mm spacing to SimpleITK (sx, sy, sz)."""
    sz, sy, sx = (float(s) for s in spacing_zyx)
    return (sx, sy, sz)


# ---------------------------------------------------------------------------
# Intensity
# ---------------------------------------------------------------------------


def _clip_normalize_hu(volume: np.ndarray) -> np.ndarray:
    """Clip HU to [HU_CLIP_LOWER, HU_CLIP_UPPER] and scale to [0, 1]."""
    clipped = np.clip(volume, HU_CLIP_LOWER, HU_CLIP_UPPER)
    return ((clipped - HU_CLIP_LOWER) / _HU_RANGE).astype(np.float32)


# ---------------------------------------------------------------------------
# Geometry
# ---------------------------------------------------------------------------


def _isotropic_resample(
    volume_zyx: np.ndarray,
    input_spacing_xyz: Tuple[float, float, float],
    output_spacing_xyz: Tuple[float, float, float],
) -> np.ndarray:
    """Resample a (Z, Y, X) volume to new voxel spacing via SimpleITK."""
    if volume_zyx.ndim != 3:
        raise ValueError(f"Expected 3-D volume, got shape {volume_zyx.shape}")

    image = sitk.GetImageFromArray(np.asarray(volume_zyx))
    image.SetSpacing(tuple(float(s) for s in input_spacing_xyz))

    orig_size = image.GetSize()
    orig_sp = image.GetSpacing()
    out_sp = tuple(float(s) for s in output_spacing_xyz)
    new_size = [
        max(1, int(round(s * (o / n))))
        for s, o, n in zip(orig_size, orig_sp, out_sp)
    ]

    resampler = sitk.ResampleImageFilter()
    resampler.SetSize(new_size)
    resampler.SetOutputSpacing(out_sp)
    resampler.SetOutputDirection(image.GetDirection())
    resampler.SetOutputOrigin(image.GetOrigin())
    resampler.SetTransform(sitk.Transform())
    resampler.SetInterpolator(sitk.sitkLinear)

    return sitk.GetArrayFromImage(resampler.Execute(image)).astype(np.float32, copy=False)


# ---------------------------------------------------------------------------
# Lung mask (per-slice)
# ---------------------------------------------------------------------------


def _morphological_lung_mask_slice(slice_yx: np.ndarray) -> np.ndarray:
    """HU-threshold + morphology lung mask for one axial (Y, X) slice."""
    binary = slice_yx < LUNG_HU_THRESHOLD
    try:
        cleared = morphology.remove_small_objects(binary, max_size=_MORPH_MAX_SIZE)
    except TypeError:
        cleared = morphology.remove_small_objects(binary, min_size=_MORPH_MAX_SIZE + 1)

    cleared = segmentation.clear_border(cleared)
    labels = measure.label(cleared)
    regions = measure.regionprops(labels)
    if not regions:
        return np.zeros_like(slice_yx, dtype=np.float32)

    regions.sort(key=lambda r: r.area, reverse=True)
    mask = np.zeros_like(slice_yx, dtype=np.float32)
    for region in regions[:2]:
        mask[labels == region.label] = 1.0
    return ndimage.binary_fill_holes(mask).astype(np.float32)


def _adaptive_lung_mask_slice(slice_yx: np.ndarray) -> np.ndarray:
    """Lung mask for one slice — ROI-aware or morphological for raw chest CT."""
    bg_value = slice_yx[0, 0]
    is_precropped_roi = (
        np.allclose(slice_yx[:5, :5], bg_value, atol=_ROI_BG_TOLERANCE)
        and bg_value > -200
    )

    if is_precropped_roi:
        mask = (np.abs(slice_yx - bg_value) > _ROI_FG_DELTA).astype(np.float32)
    else:
        mask = _morphological_lung_mask_slice(slice_yx)

    if mask.sum() > 0:
        return ndimage.binary_fill_holes(mask).astype(np.float32)
    return np.ones_like(slice_yx, dtype=np.float32)


def _lung_mask_volume_zyx(
    volume_zyx: np.ndarray,
    mask_slice_fn: Callable[[np.ndarray], np.ndarray],
) -> Tuple[np.ndarray, np.ndarray]:
    """Apply ``mask_slice_fn`` per Z slice; return masked volume and float mask."""
    vol = np.asarray(volume_zyx, dtype=np.float32)
    lung_mask = np.zeros_like(vol, dtype=np.float32)
    masked = np.zeros_like(vol, dtype=np.float32)

    for z in range(vol.shape[0]):
        m = mask_slice_fn(vol[z])
        lung_mask[z] = m
        masked[z] = vol[z] * m

    return masked, lung_mask


# ---------------------------------------------------------------------------
# Model input channels
# ---------------------------------------------------------------------------


def add_variance_channel(vol: np.ndarray, radius: int = 3) -> np.ndarray:
    """Normalized 3-D local texture variance (second UNet input channel).

    Uses uniform-filter approximation: std ≈ sqrt(E[X²] - E[X]²).

    Args:
        vol: HU-normalized float32 volume, shape (Z, Y, X).
        radius: Half-window size; kernel edge length is ``2 * radius + 1``.

    Returns:
        Variance map in [0, 1], same shape as ``vol``.
    """
    kernel = radius * 2 + 1
    vol_f64 = vol.astype(np.float64)
    mean = uniform_filter(vol_f64, size=kernel)
    mean_sq = uniform_filter(vol_f64 ** 2, size=kernel)
    var = np.sqrt(np.maximum(mean_sq - mean ** 2, 0)).astype(np.float32)
    return var / (var.max() + 1e-6)


# ---------------------------------------------------------------------------
# Pipeline
# ---------------------------------------------------------------------------


def preprocess_volume(
    volume_zyx: np.ndarray,
    spacing_zyx: Tuple[float, float, float],
    target_spacing: Tuple[float, float, float] = _DEFAULT_TARGET_SPACING,
) -> Tuple[np.ndarray, np.ndarray]:
    """Preprocess a chest CT HU volume for v2.2 sliding-window inference.

    Steps:
        1. Resample to isotropic voxels (Z, Y, X) layout preserved).
        2. Adaptive per-slice lung masking.
        3. Clip HU and normalize to [0, 1].
        4. Build texture-variance second channel.
        5. Stack channels for the 2-input UNet.

    Args:
        volume_zyx: Raw HU volume, shape (Z, Y, X).
        spacing_zyx: Native voxel spacing (sz, sy, sx) in mm.
        target_spacing: Desired isotropic spacing (sz, sy, sx) in mm.

    Returns:
        processed_stack: float32 (2, Z, Y, X) — [HU-normalized, variance].
        lung_mask: uint8 (Z, Y, X) binary lung mask on the resampled grid.
    """
    if volume_zyx.ndim != 3:
        raise ValueError(
            f"preprocess_volume expects (Z, Y, X), got shape {volume_zyx.shape}"
        )

    vol = np.asarray(volume_zyx, dtype=np.float32)
    in_xyz = _spacing_zyx_to_xyz(spacing_zyx)
    out_xyz = _spacing_zyx_to_xyz(target_spacing)

    vol_iso = _isotropic_resample(vol, in_xyz, out_xyz)
    masked_vol, lm_vol = _lung_mask_volume_zyx(vol_iso, _adaptive_lung_mask_slice)

    hu_norm = _clip_normalize_hu(masked_vol)
    var_norm = add_variance_channel(hu_norm)

    processed_stack = np.stack([hu_norm, var_norm], axis=0)
    lung_mask = (lm_vol > 0.5).astype(np.uint8)
    return processed_stack, lung_mask


__all__ = [
    "add_variance_channel",
    "preprocess_volume",
]
