"""Unit tests for outputs.py mask normalization guard."""

import numpy as np
import pytest

from routes.studies.outputs import _mask_already_valid_5class, _normalize_volume_to_classes_123


class TestMaskAlreadyValid5Class:
    def test_empty_mask(self):
        mask = np.zeros((2, 2, 2), dtype=np.uint8)
        assert _mask_already_valid_5class(mask) is True

    def test_valid_5class_mask(self):
        mask = np.zeros((2, 2, 2), dtype=np.uint8)
        mask[0, 0, 0] = 1  # emphysema
        mask[0, 0, 1] = 2  # fibrosis
        mask[0, 1, 0] = 3  # ground glass
        mask[0, 1, 1] = 4  # micronodules
        mask[1, 0, 0] = 5  # consolidation
        assert _mask_already_valid_5class(mask) is True

    def test_3class_mask(self):
        mask = np.zeros((2, 2, 2), dtype=np.uint8)
        mask[0, 0, 0] = 1
        mask[0, 0, 1] = 2
        mask[0, 1, 0] = 3
        assert _mask_already_valid_5class(mask) is True

    def test_invalid_label_6(self):
        mask = np.zeros((2, 2, 2), dtype=np.uint8)
        mask[0, 0, 0] = 6
        assert _mask_already_valid_5class(mask) is False

    def test_invalid_label_7(self):
        mask = np.zeros((2, 2, 2), dtype=np.uint8)
        mask[0, 0, 0] = 7
        assert _mask_already_valid_5class(mask) is False


class TestNormalizeVolumeSkippedForValid5Class:
    """Verify that valid 5-class masks are NOT crushed by normalization."""

    def test_5class_mask_passes_through(self):
        mask = np.zeros((3, 3, 3), dtype=np.uint8)
        mask[0, 0, 0] = 1
        mask[1, 1, 1] = 2
        mask[2, 2, 2] = 3
        mask[0, 0, 1] = 4
        mask[0, 0, 2] = 5

        # The guard should detect this as valid, so normalization should NOT be called.
        assert _mask_already_valid_5class(mask) is True
        # Even if we called normalize, verify the guard prevents it.
        # Simulate the guard logic from get_study_mask():
        if not _mask_already_valid_5class(mask):
            result, _ = _normalize_volume_to_classes_123(mask)
        else:
            result = mask

        assert result[0, 0, 0] == 1
        assert result[1, 1, 1] == 2
        assert result[2, 2, 2] == 3
        assert result[0, 0, 1] == 4
        assert result[0, 0, 2] == 5

    def test_legacy_mask_still_normalized(self):
        """Legacy masks with values outside {0..5} should still be normalized."""
        mask = np.zeros((3, 3, 3), dtype=np.uint8)
        mask[0, 0, 0] = 10
        mask[1, 1, 1] = 20
        mask[2, 2, 2] = 30

        assert _mask_already_valid_5class(mask) is False
        result, changed = _normalize_volume_to_classes_123(mask)
        # Should be crushed to {0,1,2,3}
        assert set(np.unique(result)).issubset({0, 1, 2, 3})
        assert changed is True
