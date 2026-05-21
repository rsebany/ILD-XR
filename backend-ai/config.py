from typing import Dict, Tuple

PATCH_SIZE: Tuple[int, int, int] = (32, 128, 128)
STRIDE: Tuple[int, int, int] = (16, 64, 64)

# 0=background, 1=GGO, 2=Reticulation, 3=Consolidation
CLASS_LABELS: Dict[int, str] = {1: "ggo", 2: "reticulation", 3: "consolidation"}

# v2.2 inference constants
IN_CHANNELS: int = 2
TEMPERATURE: float = 0.45
# Per-class probability thresholds (lower = more sensitive)
CLASS_THRESHOLDS: Dict[int, float] = {
    1: 0.05,  # GGO             (more sensitive → better overlap / Dice)
    2: 0.07,  # Reticular
    3: 0.05,  # Consolidation
}