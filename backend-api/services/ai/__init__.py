"""3D ILD classification: DICOM → U-Net → metrics / mesh.
"""
from __future__ import annotations

from services.ai.inference import (
    CLASS_LABELS,
    DicomInputError,
    MESH_NODE_NAMES,
    _resample_mask_to_shape,
    build_lobar_label_volume,
    build_zonal_label_volume,
    compute_class_metrics,
    compute_dice_against_ground_truth,
    compute_ild_volume_ml,
    estimate_lobar_distribution,
    estimate_zonal_distribution,
    generate_mesh_glb,
    process_dicom_zip_dir,
)

__all__ = [
    "CLASS_LABELS",
    "DicomInputError",
    "MESH_NODE_NAMES",
    "_resample_mask_to_shape",
    "build_lobar_label_volume",
    "build_zonal_label_volume",
    "compute_class_metrics",
    "compute_dice_against_ground_truth",
    "compute_ild_volume_ml",
    "estimate_lobar_distribution",
    "estimate_zonal_distribution",
    "generate_mesh_glb",
    "process_dicom_zip_dir",
]
