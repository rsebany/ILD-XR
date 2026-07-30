"""Shared label map, cascade params, and pipeline exceptions for AI services."""
from __future__ import annotations

from typing import Dict, Tuple

# 0=background (Normal lung), 1=Emphysema, 2=Fibrosis, 3=Ground Glass, 4=Micronodules, 5=Consolidation
# Must match `backend-ai/config.py` CLASS_LABELS for training vs inference.
CLASS_LABELS: Dict[int, str] = {
    1: "emphysema",
    2: "fibrosis",
    3: "ground_glass",
    4: "micronodules",
    5: "consolidation",
}

# ── Cascade inference defaults (match notebook 05) ──
_CLS_PATCH_SIZE: Tuple[int, int, int] = (16, 64, 64)
_INFER_DENSE_STRIDE: Tuple[int, int, int] = (4, 8, 8)
_INFER_MAX_PATCHES: int = 8000
_NUM_CLASSES: int = 6
_VOL_SMOOTH_SIZE: int = 3
_MIN_PATCH_LUNG_FRAC_CLS: float = 0.20

# ── Patient-level cascade thresholds ──
# Min fraction of lung voxels labelled pathological to call patient ILD=1
CASCADE_PATH_THRESH: float = 0.005  # 0.5%
# Min mean Softmax ILD probability (fallback when volume fraction is low)
CASCADE_PROB_THRESH: float = 0.45


class DicomInputError(ValueError):
    """Raised when uploaded imaging data is invalid for processing."""


__all__ = [
    "CLASS_LABELS",
    "DicomInputError",
    "_CLS_PATCH_SIZE",
    "_INFER_DENSE_STRIDE",
    "_INFER_MAX_PATCHES",
    "_NUM_CLASSES",
    "_VOL_SMOOTH_SIZE",
    "_MIN_PATCH_LUNG_FRAC_CLS",
    "CASCADE_PATH_THRESH",
    "CASCADE_PROB_THRESH",
]
