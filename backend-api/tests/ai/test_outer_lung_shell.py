"""Unit tests for hollow lung shell volume (lesions carved out)."""
from __future__ import annotations

import numpy as np

from services.ai.mesh import outer_lung_shell_volume


def test_outer_lung_shell_carves_lesions() -> None:
    lung = np.zeros((8, 8, 8), dtype=np.uint8)
    lung[2:6, 2:6, 2:6] = 1
    lesions = np.zeros_like(lung)
    lesions[3:5, 3:5, 3:5] = 1

    shell = outer_lung_shell_volume(lung, lesions, lesion_dilate_iters=0)
    assert shell[3, 3, 3] == 0
    assert shell[2, 3, 3] == 1
    assert shell[6, 6, 6] == 0


def test_outer_lung_shell_fallback_when_fully_carved() -> None:
    lung = np.ones((4, 4, 4), dtype=np.uint8)
    lesions = np.ones_like(lung)
    shell = outer_lung_shell_volume(lung, lesions, lesion_dilate_iters=0)
    assert np.all(shell > 0)
