"""DICOM -> segmentation mask pipeline -- ILD-XR v3.0 (paper-aligned).

End-to-end flow:
    DICOM series -> HU volume (Z,Y,X)
    -> lungmask R231 preprocessing (isotropic resample + HU normalize)
    -> Med3D ResNet-18 encoder + Softmax head (dense sliding-window)
    -> reconstruct full volume -> uint8 mask (Z,Y,X)
"""
from __future__ import annotations

from pathlib import Path
from typing import Tuple

import numpy as np

from typing import Optional

from services.ai import bootstrap
from services.ai.config import logger
from services.ai.constants import DicomInputError
from services.ai.geometry import lung_mask_from_hu, resample_mask_to_shape
from services.ai.sliding_window import softmax_cascade_inference
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
    encoder_weights: Path | None = None,
    softmax_weights: Path | None = None,
    med3d_weights: Path | None = None,
    apply_postprocess: bool = False,
    postprocess_iterations: int = 1,
    hierarchical_ckpt: Optional[Path] = None,
    cascade_stats: Optional[dict] = None,
) -> Tuple[np.ndarray, Tuple[float, float, float], np.ndarray, np.ndarray]:
    """Full inference pipeline for an uploaded DICOM CT series.

    Supports two modes:
      1. Legacy: encoder_weights + softmax_weights (separate files)
      2. Hierarchical: hierarchical_ckpt (single file with all 3 heads)

    When hierarchical_ckpt is provided, encoder_weights and softmax_weights
    are ignored. Voxel maps remain Softmax argmax; optional ``cascade_stats``
    receives patient-level dual-threshold binary decision fields.
    """
    if hierarchical_ckpt is not None:
        weights_path = hierarchical_ckpt
    encoder_weights = encoder_weights or weights_path

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
        volume = stack_pixel_volume_zyx_simple(slices)
        volume = apply_hu_rescale(volume, slices[0])
    except Exception as exc:
        raise DicomInputError(
            f"Failed to build HU volume from DICOM slices: {exc}"
        ) from exc

    native_shape = volume.shape

    try:
        ct_norm, lung_mask_iso = bootstrap.preprocess_for_softmax(volume, orig_spacing)
        logger.debug(
            "preprocess_for_softmax OK: ct_norm=%s lung_mask=%s",
            ct_norm.shape,
            lung_mask_iso.shape,
        )
    except Exception as exc:
        logger.warning(
            "preprocess_for_softmax failed (%s); using HU fallback",
            type(exc).__name__,
        )
        hu = np.asarray(volume, dtype=np.float32)
        hu_norm = (np.clip(hu, -1350.0, 150.0) + 1350.0) / 1500.0
        ct_norm = hu_norm
        lung_mask_iso = lung_mask_from_hu(volume)

    if hierarchical_ckpt is not None:
        if not hierarchical_ckpt.exists():
            raise DicomInputError(f"Hierarchical checkpoint missing: {hierarchical_ckpt}")
        logger.info("Using hierarchical pipeline (lungmask + HierarchicalEncoder3D)")
        mask = softmax_cascade_inference(
            ct_norm,
            lung_mask_iso,
            hierarchical_ckpt,
            None,  # no separate softmax weights
            cascade_stats=cascade_stats,
        )
    else:
        if encoder_weights is None or not encoder_weights.exists():
            raise DicomInputError(f"Encoder weights missing: {encoder_weights}")
        if softmax_weights is None or not softmax_weights.exists():
            raise DicomInputError(f"Softmax weights missing: {softmax_weights}")
        if med3d_weights is not None and not med3d_weights.exists():
            raise DicomInputError(f"Med3D weights missing: {med3d_weights}")
        logger.info("Using paper-aligned pipeline (lungmask + Med3D Softmax)")
        mask = softmax_cascade_inference(
            ct_norm,
            lung_mask_iso,
            encoder_weights,
            softmax_weights,
            cascade_stats=cascade_stats,
        )

    if mask.shape != native_shape:
        logger.debug("Resampling mask %s → native grid %s", mask.shape, native_shape)
        try:
            mask = resample_mask_to_shape(mask, native_shape, binary=False)
        except Exception:
            logger.exception("mask remap failed; returning zero mask")
            mask = np.zeros(native_shape, dtype=np.uint8)

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

    _bc = np.bincount(mask.ravel().astype(np.int64, copy=False), minlength=6)
    logger.debug(
        "seg voxel counts shape=%s bg=%d emph=%d fib=%d gg=%d micro=%d consol=%d",
        mask.shape,
        int(_bc[0]),
        int(_bc[1]) if len(_bc) > 1 else 0,
        int(_bc[2]) if len(_bc) > 2 else 0,
        int(_bc[3]) if len(_bc) > 3 else 0,
        int(_bc[4]) if len(_bc) > 4 else 0,
        int(_bc[5]) if len(_bc) > 5 else 0,
    )

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
