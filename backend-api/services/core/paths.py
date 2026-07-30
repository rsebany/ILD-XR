"""Single source for backend data paths (DICOM, meshes, sync storage, weights)."""
from __future__ import annotations

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[2]
DICOM_STORAGE = BASE_DIR / "data" / "dicom"
STATIC_MESH_DIR = BASE_DIR / "static" / "meshes"
SYNC_STORAGE = BASE_DIR / "data" / "segmentation_revisions"

INFER_FOLD = int(os.environ.get("ILD_INFER_FOLD", "0"))

MED3D_WEIGHTS = Path(os.environ.get("ILD_MED3D_WEIGHTS", str(BASE_DIR / "weights" / "resnet_18.pth")))
HIERARCHICAL_WEIGHTS = Path(
    os.environ.get(
        "ILD_HIERARCHICAL_WEIGHTS",
        str(BASE_DIR / "weights" / f"hierarchical_fold{INFER_FOLD}.pth"),
    )
)
ENCODER_WEIGHTS = Path(
    os.environ.get("ILD_ENCODER_WEIGHTS", str(BASE_DIR / "weights" / f"encoder3d_fold{INFER_FOLD}.pth"))
)
SOFTMAX_WEIGHTS = Path(
    os.environ.get("ILD_SOFTMAX_WEIGHTS", str(BASE_DIR / "weights" / f"softmax3d_fold{INFER_FOLD}.pth"))
)

# Prefer hierarchical Phase-2 checkpoint when present; else legacy encoder path.
WEIGHTS_PATH = HIERARCHICAL_WEIGHTS if HIERARCHICAL_WEIGHTS.is_file() else ENCODER_WEIGHTS
USE_HIERARCHICAL = HIERARCHICAL_WEIGHTS.is_file()

__all__ = [
    "BASE_DIR",
    "DICOM_STORAGE",
    "STATIC_MESH_DIR",
    "SYNC_STORAGE",
    "INFER_FOLD",
    "MED3D_WEIGHTS",
    "HIERARCHICAL_WEIGHTS",
    "ENCODER_WEIGHTS",
    "SOFTMAX_WEIGHTS",
    "WEIGHTS_PATH",
    "USE_HIERARCHICAL",
]
