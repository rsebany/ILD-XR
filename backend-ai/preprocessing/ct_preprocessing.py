from __future__ import annotations

from typing import Dict, Tuple

import numpy as np
import SimpleITK as sitk
from scipy import ndimage
from scipy.ndimage import uniform_filter
from skimage import measure, morphology, segmentation


def isotropic_resample(
    volume: np.ndarray,
    original_spacing: Tuple[float, float, float],
    target_spacing: Tuple[float, float, float] = (1.0, 1.0, 1.0),
    *,
    is_mask: bool = False,
) -> Tuple[np.ndarray, Tuple[float, float, float]]:
    # volume is in the shape of H, W, D, so we need to transpose it to D, H, W
    if volume.ndim != 3:
        raise ValueError(f"isotropic_resample expects 3D volume, got {volume.shape}")

    in_spacing = tuple(float(s) for s in original_spacing)
    out_spacing = tuple(float(s) for s in target_spacing)
    image = sitk.GetImageFromArray(np.asarray(volume).transpose(2, 0, 1))
    image.SetSpacing(in_spacing)

    original_size = image.GetSize()
    original_spacing = image.GetSpacing()
    new_size = [
        int(round(s * (os / ns)))
        for s, os, ns in zip(original_size, original_spacing, out_spacing)
    ]
    new_size = [max(1, int(v)) for v in new_size]

    resampler = sitk.ResampleImageFilter()
    resampler.SetSize(new_size)
    resampler.SetOutputSpacing(out_spacing)
    resampler.SetOutputDirection(image.GetDirection())
    resampler.SetOutputOrigin(image.GetOrigin())
    resampler.SetTransform(sitk.Transform())
    resampler.SetInterpolator(
        sitk.sitkNearestNeighbor if is_mask else sitk.sitkLinear
    )
    resampled_img = resampler.Execute(image)
    resampled = sitk.GetArrayFromImage(resampled_img).transpose(1, 2, 0)

    if is_mask:
        resampled = np.clip(np.rint(resampled), 0, 255).astype(np.uint8)
    else:
        resampled = resampled.astype(np.float32, copy=False)
    return resampled, out_spacing


def extract_lung_mask(slice_2d: np.ndarray) -> np.ndarray:
    # Approximate lung mask for one axial slice
    try:
        # threshold (air ≈ lungs)
        binary = slice_2d < -400
        # remove small noise (skimage >=0.26: max_size replaces deprecated min_size;
        # max_size=99 removes components with area <= 99, same as min_size=100)
        cleaned = morphology.remove_small_objects(binary, max_size=99)
        # remove objects touching border
        cleaned = segmentation.clear_border(cleaned)
        # keep largest components (lungs)
        labels = measure.label(cleaned)

        regions = measure.regionprops(labels)
        if not regions:
            return np.ones_like(slice_2d, dtype=np.float32)

        regions.sort(key=lambda x: x.area, reverse=True)

        mask = np.zeros_like(slice_2d, dtype=np.float32)
        for region in regions[:2]:  # left + right lung
            mask[labels == region.label] = 1.0

        # fill holes inside lungs
        mask = ndimage.binary_fill_holes(mask)

        return mask.astype(np.float32)
    except Exception:
        # fallback: no masking
        return np.ones_like(slice_2d, dtype=np.float32)


def preprocess_volume_with_mask(volume: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
    # clip to [-1350, 150]
    # scale to [0, 1]
    if volume.ndim != 3:
        raise ValueError(f"preprocess_volume_with_mask expects 3D volume, got {volume.shape}")

    vol = np.asarray(volume, dtype=np.float32)
    lung_mask = np.zeros_like(vol, dtype=np.float32)
    masked_vol = np.zeros_like(vol, dtype=np.float32)

    for i in range(vol.shape[2]):
        m = extract_lung_mask(vol[:, :, i])
        lung_mask[:, :, i] = m
        masked_vol[:, :, i] = vol[:, :, i] * m

    lower, upper = -1350.0, 150.0
    masked_vol = np.clip(masked_vol, lower, upper)
    norm = (masked_vol - lower) / (upper - lower)
    return norm.astype(np.float32), (lung_mask > 0.5).astype(np.uint8)


def preprocess_volume(volume: np.ndarray) -> np.ndarray:
    # normalize the volume
    norm, _ = preprocess_volume_with_mask(volume)
    return norm


def preprocess_volume_with_cropping(
    volume: np.ndarray,
    original_spacing: Tuple[float, float, float],
    target_spacing: Tuple[float, float, float] = (1.0, 1.0, 1.0),
) -> Tuple[np.ndarray, np.ndarray]:
    """
    Preprocess volume matching the notebook workflow EXACTLY:
    1. Generate lung mask from ORIGINAL volume
    2. Apply mask
    3. CROP to lung region (critical for performance and consistency)
    4. Resample to isotropic
    5. Clip intensity range
    6. Normalize to [0, 1]
    
    Returns:
        (normalized_volume, lung_mask) both resampled and cropped
    """
    if volume.ndim != 3:
        raise ValueError(f"preprocess_volume_with_cropping expects 3D volume, got {volume.shape}")

    vol = np.asarray(volume, dtype=np.float32)
    
    # Step 1: Generate lung mask from original volume
    lung_mask = np.zeros_like(vol, dtype=np.float32)
    for i in range(vol.shape[2]):
        m = extract_lung_mask(vol[:, :, i])
        lung_mask[:, :, i] = m
    
    # Step 2: Apply mask
    masked_vol = vol * lung_mask
    
    # Step 3: CROP to lung region (this is the critical missing step in the backend!)
    nonzero = np.argwhere(lung_mask)
    if nonzero.size > 0:
        min_h, min_w, min_d = nonzero.min(axis=0)
        max_h, max_w, max_d = nonzero.max(axis=0) + 1
        masked_vol = masked_vol[min_h:max_h, min_w:max_w, min_d:max_d]
        lung_mask = lung_mask[min_h:max_h, min_w:max_w, min_d:max_d]
    
    # Step 4: Resample to isotropic (now on cropped, focused region)
    resampled_vol, _ = isotropic_resample(
        masked_vol, original_spacing, target_spacing=target_spacing, is_mask=False
    )
    resampled_mask, _ = isotropic_resample(
        lung_mask, original_spacing, target_spacing=target_spacing, is_mask=True
    )
    
    # Step 5: Clip to intensity range [-1350, 150]
    lower, upper = -1350.0, 150.0
    clipped_vol = np.clip(resampled_vol, lower, upper)
    
    # Step 6: Min-Max normalize to [0, 1]
    norm = (clipped_vol - lower) / (upper - lower)
    
    return norm.astype(np.float32), (resampled_mask > 0.5).astype(np.uint8)


def add_variance_channel(vol: np.ndarray, radius: int = 3) -> np.ndarray:
    """Compute normalized 3D local texture variance for the second input channel.

    Uses a uniform_filter approximation: Var = E[X²] - E[X]².

    Args:
        vol: Normalized float32 volume of shape (D, H, W).
        radius: Half-window size; kernel = radius*2+1.

    Returns:
        Normalized variance map of shape (D, H, W), float32 in [0, 1].
    """
    kernel = radius * 2 + 1
    vol_f64 = vol.astype(np.float64)
    mean = uniform_filter(vol_f64, size=kernel)
    mean_sq = uniform_filter(vol_f64 ** 2, size=kernel)
    var = np.sqrt(np.maximum(mean_sq - mean ** 2, 0)).astype(np.float32)
    return var / (var.max() + 1e-6)


def _adaptive_lung_mask_slice(slice_2d: np.ndarray) -> np.ndarray:
    """Per-slice adaptive masking used by preprocess_volume_v2.

    Detects whether the slice is a pre-cropped ROI array (uniform background
    that is not strongly negative HU) and applies a simple threshold in that
    case; falls back to morphological HU thresholding for raw chest CT slices.
    """
    bg_value = slice_2d[0, 0]
    if np.allclose(slice_2d[:5, :5], bg_value, atol=1e-1) and bg_value > -200:
        # Pre-cropped / segmented array — background is near 0
        lm = (np.abs(slice_2d - bg_value) > 10).astype(np.float32)
    else:
        # Raw chest CT — standard HU threshold + morphological cleanup
        binary = slice_2d < -400
        try:
            cleared = morphology.remove_small_objects(binary, max_size=99)
        except TypeError:
            cleared = morphology.remove_small_objects(binary, min_size=100)
        cleared = segmentation.clear_border(cleared)
        labels = measure.label(cleared)
        regions = measure.regionprops(labels)
        lm = np.zeros_like(slice_2d, dtype=np.float32)
        if regions:
            regions.sort(key=lambda r: r.area, reverse=True)
            for rg in regions[:2]:
                lm[labels == rg.label] = 1.0

    if lm.sum() > 0:
        lm = ndimage.binary_fill_holes(lm).astype(np.float32)
    else:
        lm = np.ones_like(slice_2d, dtype=np.float32)
    return lm


def preprocess_volume_v2(
    volume_zyx: np.ndarray,
    spacing_zyx: Tuple[float, float, float],
    target_spacing: Tuple[float, float, float] = (1.0, 1.0, 1.0),
) -> Tuple[np.ndarray, np.ndarray]:
    """v2.2 production preprocessing pipeline.

    Steps:
        1. Resample to isotropic voxels (ZYX order preserved throughout).
        2. Adaptive per-slice lung masking.
        3. Clip [-1350, 150] HU and normalize to [0, 1].
        4. Compute 3D texture-variance second channel.
        5. Stack into a 2-channel array.

    Args:
        volume_zyx: Raw HU volume of shape (D, H, W) / (Z, Y, X).
        spacing_zyx: Voxel spacing (sz, sy, sx) in mm.
        target_spacing: Desired isotropic spacing (default 1 mm³).

    Returns:
        processed_stack: float32 array of shape (2, D, H, W) — channels are
            [HU-normalized, texture-variance].
        lung_mask: uint8 binary array of shape (D, H, W).
    """
    if volume_zyx.ndim != 3:
        raise ValueError(
            f"preprocess_volume_v2 expects 3-D (Z,Y,X) volume, got {volume_zyx.shape}"
        )

    vol = np.asarray(volume_zyx, dtype=np.float32)
    sz, sy, sx = (float(s) for s in spacing_zyx)

    # Step 1 — resample to isotropic (stays in ZYX)
    # sitk.GetImageFromArray expects (Z,Y,X); SetSpacing takes (x,y,z)
    img = sitk.GetImageFromArray(vol)
    img.SetSpacing((sx, sy, sz))

    orig_size = img.GetSize()          # (X, W, D) in sitk convention
    orig_sp = img.GetSpacing()
    tgt_sp = tuple(float(t) for t in target_spacing)
    new_size = [
        max(1, int(round(s * (o / n))))
        for s, o, n in zip(orig_size, orig_sp, (tgt_sp[2], tgt_sp[1], tgt_sp[0]))
    ]

    r = sitk.ResampleImageFilter()
    r.SetSize(new_size)
    r.SetOutputSpacing((tgt_sp[2], tgt_sp[1], tgt_sp[0]))
    r.SetOutputDirection(img.GetDirection())
    r.SetOutputOrigin(img.GetOrigin())
    r.SetTransform(sitk.Transform())
    r.SetInterpolator(sitk.sitkLinear)
    vol_iso = sitk.GetArrayFromImage(r.Execute(img)).astype(np.float32)  # (D,H,W)

    # Step 2 — adaptive per-slice lung masking
    D, H, W = vol_iso.shape
    lm_vol = np.zeros((D, H, W), dtype=np.float32)
    out_vol = np.zeros((D, H, W), dtype=np.float32)
    for i in range(D):
        lm = _adaptive_lung_mask_slice(vol_iso[i])
        lm_vol[i] = lm
        out_vol[i] = vol_iso[i] * lm

    # Step 3 — clip and normalize
    out_vol = np.clip(out_vol, -1350.0, 150.0)
    hu_norm = ((out_vol + 1350.0) / 1500.0).astype(np.float32)

    # Step 4 — texture variance channel
    var_norm = add_variance_channel(hu_norm)

    # Step 5 — stack
    processed_stack = np.stack([hu_norm, var_norm], axis=0)  # (2, D, H, W)
    lung_mask = (lm_vol > 0.5).astype(np.uint8)

    return processed_stack, lung_mask


__all__ = [
    "isotropic_resample",
    "extract_lung_mask",
    "preprocess_volume_with_mask",
    "preprocess_volume",
    "preprocess_volume_with_cropping",
    "add_variance_channel",
    "preprocess_volume_v2",
]
