"""Configuration for ILD-XR hierarchical pipeline"""
from typing import Dict, Tuple

# ── Patch geometry ──
PATCH_SIZE: Tuple[int, int, int] = (16, 64, 64)
INFER_DENSE_STRIDE: Tuple[int, int, int] = (4, 8, 8)
# Dense cascade OP (match backend-api / notebooks): do not lower for production triage.
INFER_MAX_PATCHES: int = 8000

# ── Class labels (0=Normal lung / background) ──
# 1=Emphysema, 2=Fibrosis, 3=Ground Glass, 4=Micronodules, 5=Consolidation
CLASS_LABELS: Dict[int, str] = {
    1: "emphysema",
    2: "fibrosis",
    3: "ground_glass",
    4: "micronodules",
    5: "consolidation",
}

# ── Hierarchical task definitions ──
# Original MedGIFT classes
ORIGINAL_CLASS_NAMES = ["Normal", "Emphysema", "Fibrosis", "Ground Glass", "Micronodules", "Consolidation"]
SEG_NUM_CLASSES: int = 6

# Binary: Normal (0) vs ILD (1-5)
N_BINARY_CLASSES: int = 2
BINARY_CLASSES: Tuple[str, str] = ("Normal", "ILD")

# Hierarchical: Normal / Fibrotic / Non-fibrotic
# Fibrotic = Fibrosis (2) + Consolidation (5)
# Non-fibrotic = Emphysema (1) + Ground Glass (3) + Micronodules (4)
HIERARCHY_MAP: Dict[int, int] = {0: 0, 1: 2, 2: 1, 3: 2, 4: 2, 5: 1}  # orig -> hier
N_HIER_CLASSES: int = 3
HIERARCHY_CLASSES: Tuple[str, str, str] = ("Normal", "Fibrotic", "NonFibrotic")

# 5-class pathology (ILD-positive only)
N_PATH_CLASSES: int = 5
PATHOLOGY_CLASSES: Tuple[str, ...] = ("Emphysema", "Fibrosis", "Ground Glass", "Micronodules", "Consolidation")

# ── Patch mining gates ──
MIN_PATHOLOGY_VOXELS: int = 80
MIN_TARGET_CLASS_FRAC: float = 0.15
MIN_PATCH_LUNG_FRAC: float = 0.20
MIN_NORMAL_LUNG_FRAC: float = 0.50
MIN_PATCHES_PER_CLASS: int = 60
PATHOLOGY_PATCH_QUOTA: float = 0.85

# ── Head dropout ──
HEAD_DROPOUT: float = 0.4

# ── Cascade inference ──
# Min fraction of lung voxels labelled pathological to call patient ILD=1
CASCADE_PATH_THRESH: float = 0.005  # 0.5%
# Min mean Softmax ILD probability (fallback when volume fraction is low)
CASCADE_PROB_THRESH: float = 0.45
# Post-cascade median filter kernel size
VOL_SMOOTH_SIZE: int = 3

# ── Training (for reference — unused in inference) ──
MEDGIFT_TO_CLS_FALLBACK: Dict[int, int] = {1: 0, 2: 1, 3: 3, 4: 2, 5: 4, 6: 5, 8: 5, 11: 4, 14: 2}
