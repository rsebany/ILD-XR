"""Single source for backend data paths (DICOM, meshes, sync storage, weights)."""
from __future__ import annotations

from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[2]
DICOM_STORAGE = BASE_DIR / "data" / "dicom"
STATIC_MESH_DIR = BASE_DIR / "static" / "meshes"
WEIGHTS_PATH = BASE_DIR / "weights" / "best_multiclass_model.pth"
SYNC_STORAGE = BASE_DIR / "data" / "segmentation_revisions"
