"""DICOM → segmentation mask pipeline — ILD v2.2.

End-to-end flow:
    DICOM series → HU volume (Z,Y,X) → preprocess_volume → 2-channel stack
    → tensor sliding-window inference → threshold_predict → uint8 mask (Z,Y,X)

"""
from __future__ import annotations

from pathlib import Path
from typing import Tuple

import numpy as np

from services.ai import bootstrap
from services.ai.config import logger
from services.ai.constants import DicomInputError
from services.ai.geometry import lung_mask_from_hu, resample_mask_to_shape
from services.ai.sliding_window import sliding_window_inference
from services.dicom.series_read import (
    apply_hu_rescale,
    read_sorted_dicom_slices,
    spacing_zyx_mm,
    stack_pixel_volume_zyx_simple,
)


def process_dicom_zip_dir(
    dir_path: Path,
    weights_path: Path,
    *,
    apply_postprocess: bool = False,
    postprocess_iterations: int = 1,
) -> Tuple[np.ndarray, Tuple[float, float, float], np.ndarray, np.ndarray]:
    """Full inference pipeline for an uploaded DICOM CT series.

    Args:
        dir_path: Directory containing ``.dcm`` files.
        weights_path: Path to the fine-tuned ``.pth`` checkpoint.
        apply_postprocess: Apply morphological opening/closing to the raw mask.
        postprocess_iterations: Number of morphological iterations.

    Returns:
        mask: uint8 segmentation mask on the native DICOM grid (Z, Y, X).
        orig_spacing: Voxel spacing (sz, sy, sx) in mm of the native grid.
        volume: Raw HU volume (Z, Y, X) at native resolution.
        lung_mask: Binary lung mask on the native DICOM grid (Z, Y, X).
    """
    # --- 1. Read and sort DICOM slices ---
    try:
        slices = read_sorted_dicom_slices(dir_path, include_dicom_ext=True)
    except Exception as exc:
        raise DicomInputError(f"Failed to read uploaded DICOM series: {exc}") from exc
    if not slices:
        raise DicomInputError("No DICOM slices were found in the uploaded series.")

    try:
        orig_spacing = spacing_zyx_mm(slices, mode="pipeline")
    except Exception as exc:
        raise DicomInputError(
            f"Missing or invalid PixelSpacing in DICOM metadata: {exc}"
        ) from exc

    try:
        volume = stack_pixel_volume_zyx_simple(slices)      # (Z, Y, X) raw pixels
        volume = apply_hu_rescale(volume, slices[0])         # → HU float32
    except Exception as exc:
        raise DicomInputError(
            f"Failed to build HU volume from DICOM slices: {exc}"
        ) from exc

    native_shape = volume.shape  # (Z, Y, X) at original resolution

    # --- 2. Preprocess (ZYX throughout) ---
    try:
        processed_stack, lung_mask_iso = bootstrap.preprocess_volume(
            volume, orig_spacing
        )
        logger.debug(
            "preprocess_volume OK: stack=%s lung_mask=%s",
            processed_stack.shape,
            lung_mask_iso.shape,
        )
    except Exception as exc:
        logger.warning(
            "preprocess_volume failed (%s); using fallback normalisation",
            type(exc).__name__,
        )
        try:
            processed_stack, lung_mask_iso = bootstrap.preprocess_volume(
                volume, orig_spacing
            )
        except Exception:
            # Last-resort: clip + normalise, dummy variance channel, HU-range mask
            hu = np.asarray(volume, dtype=np.float32)
            hu_norm = (np.clip(hu, -1350.0, 150.0) + 1350.0) / 1500.0
            var_ch = np.zeros_like(hu_norm, dtype=np.float32)
            processed_stack = np.stack([hu_norm, var_ch], axis=0)
            lung_mask_iso = lung_mask_from_hu(volume)

    # --- 3. Sliding-window inference ---
    try:
        mask = sliding_window_inference(
            processed_stack,
            weights_path,
            lung_mask=lung_mask_iso,
        )
    except Exception as exc:
        raise DicomInputError(f"Inference failed on normalized volume: {exc}") from exc

    # --- 4. Resample mask to native DICOM grid ---
    if mask.shape != native_shape:
        logger.debug(
            "Resampling mask %s → native grid %s", mask.shape, native_shape
        )
        try:
            mask = resample_mask_to_shape(mask, native_shape, binary=False)
        except Exception:
            logger.exception("mask remap failed; returning zero mask")
            mask = np.zeros(native_shape, dtype=np.uint8)

    # --- 5. Optional morphological postprocess ---
    if apply_postprocess:
        try:
            mask = bootstrap.postprocess_mask(
                mask,
                opening=True,
                closing=True,
                iterations=max(1, int(postprocess_iterations)),
            ).astype(np.uint8, copy=False)
        except Exception:
            logger.exception("multiclass postprocess failed; keeping raw mask")

    _bc = np.bincount(mask.ravel().astype(np.int64, copy=False), minlength=4)
    logger.debug(
        "seg voxel counts shape=%s bg=%d ggo=%d retic=%d consol=%d",
        mask.shape,
        int(_bc[0]),
        int(_bc[1]),
        int(_bc[2]),
        int(_bc[3]),
    )

    # --- 6. Resample lung mask to native grid ---
    try:
        if lung_mask_iso.shape != native_shape:
            lung_mask = resample_mask_to_shape(
                lung_mask_iso, native_shape, binary=True
            )
        else:
            lung_mask = lung_mask_iso.astype(np.uint8, copy=False)
    except Exception:
        logger.exception("lung-mask remap failed; deriving fallback from HU")
        lung_mask = lung_mask_from_hu(volume)

    return mask, orig_spacing, volume, lung_mask


__all__ = ["process_dicom_zip_dir"]
