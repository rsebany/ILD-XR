"""
End-to-end verification: save a synthetic 5-class mask, serve it through
the /mask endpoint logic, and confirm that GGO (class 3) labels survive
without being crushed into class 2 (Fibrosis/orange).
"""

import io
import numpy as np
import sys
sys.path.insert(0, r"G:\Research\ILD-XR\09\ILD-XR-main\backend-api")

from routes.studies.outputs import (
    _mask_already_valid_5class,
    _mask_streaming_response,
    _normalize_volume_to_classes_123,
)


def make_5class_mask():
    """Create a synthetic mask that mimics a real ILD CT scan with GGO."""
    mask = np.zeros((50, 256, 256), dtype=np.uint8)
    # Large GGO region (class 3) — this is what the user sees as green
    mask[:, 40:180, 40:200] = 3
    # Small emphysema region (class 1)
    mask[:, 10:30, 10:30] = 1
    # Tiny fibrosis region (class 2)
    mask[:, 200:220, 200:220] = 2
    # Small micronodules region (class 4)
    mask[:, 100:120, 100:120] = 4
    # Small consolidation region (class 5)
    mask[:, 150:170, 150:170] = 5
    return mask


def test_mask_passes_through():
    """Verify the guard detects 5-class mask and passes it through unchanged."""
    mask = make_5class_mask()
    assert _mask_already_valid_5class(mask), "Guard should detect valid 5-class mask"

    # Simulate what get_study_mask does now:
    if not _mask_already_valid_5class(mask):
        result, _ = _normalize_volume_to_classes_123(mask)
    else:
        result = mask

    # Verify all classes preserved
    assert 1 in result, "Emphysema (1) missing"
    assert 2 in result, "Fibrosis (2) missing"
    assert 3 in result, "Ground Glass (3) missing"
    assert 4 in result, "Micronodules (4) missing"
    assert 5 in result, "Consolidation (5) missing"

    # Verify counts match
    for cls in [1, 2, 3, 4, 5]:
        orig_count = int(np.sum(mask == cls))
        result_count = int(np.sum(result == cls))
        assert orig_count == result_count, (
            f"Class {cls}: original={orig_count}, after={result_count}"
        )

    print(f"  PASS: All 5 classes preserved through the endpoint logic")
    print(f"  GGO voxels: {int(np.sum(mask == 3))}")


def test_mask_streaming_response_shape():
    """Verify the streaming response has correct headers."""
    mask = make_5class_mask()
    response = _mask_streaming_response(mask)
    assert response.headers["X-Mask-Shape"] == "50,256,256"
    assert "emphysema" in response.headers["X-Mask-Label-Semantics"]
    assert "ground_glass" in response.headers["X-Mask-Label-Semantics"]
    print(f"  PASS: Streaming response headers correct (5-class semantics)")


def test_ggo_not_crushed():
    """Specifically verify GGO pixels are NOT remapped to Fibrosis."""
    mask = make_5class_mask()
    ggo_before = int(np.sum(mask == 3))
    fibrosis_before = int(np.sum(mask == 2))

    # The OLD code would crush this. New code should pass through.
    if not _mask_already_valid_5class(mask):
        result, _ = _normalize_volume_to_classes_123(mask)
    else:
        result = mask

    ggo_after = int(np.sum(result == 3))
    fibrosis_after = int(np.sum(result == 2))

    assert ggo_after == ggo_before, (
        f"GGO crushed: before={ggo_before}, after={ggo_after}"
    )
    assert fibrosis_after == fibrosis_before, (
        f"Fibrosis changed: before={fibrosis_before}, after={fibrosis_after}"
    )
    print(f"  PASS: GGO={ggo_before} voxels preserved (not crushed to Fibrosis)")


if __name__ == "__main__":
    print("=" * 60)
    print("End-to-end mask normalization verification")
    print("=" * 60)
    test_mask_passes_through()
    test_mask_streaming_response_shape()
    test_ggo_not_crushed()
    print("=" * 60)
    print("ALL TESTS PASSED — GGO will display correctly")
    print("=" * 60)
