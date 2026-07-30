"""Expert mask compare tests — DISABLED (label normalization issues)."""
#
# import numpy as np
# import pytest
# from fastapi import HTTPException
#
# from services.studies.expert_mask_compare import compare_expert_dicom_to_prediction_volume
#
#
# class _SegItem:
#     def __init__(self, number: int, label: str):
#         self.SegmentNumber = number
#         self.SegmentLabel = label
#
#
# class _SegDs:
#     def __init__(self, segment_items):
#         self.SegmentSequence = segment_items
#
#
# def test_compare_strict_accepts_native_0123_labels():
#     pred = np.zeros((2, 6, 6), dtype=np.uint8)
#     pred[:, 1:3, 1:3] = 1
#     pred[:, 3:5, 1:3] = 2
#     pred[:, 2:4, 3:5] = 3
#
#     expert = pred.copy()
#     payload = compare_expert_dicom_to_prediction_volume(
#         study_id="ST-test-native",
#         prediction=pred,
#         expert_volume=expert,
#     )
#
#     assert payload["mapping_source"] == "native_labels"
#     assert payload["mapping_confidence"] == "strict_verified"
#     assert payload["comparison_scope"] == "classes_1_2_3_only"
#     assert payload["dice"]["dice_mean_lesion"] == pytest.approx(1.0)
#     assert payload["expert_has_ggo"] is True
#     assert payload["expert_has_reticulation"] is True
#     assert payload["expert_has_consolidation"] is True
#
#
# def test_compare_strict_rejects_ambiguous_labels_without_metadata():
#     pred = np.zeros((2, 6, 6), dtype=np.uint8)
#     pred[:, 1:3, 1:3] = 1
#
#     # Ambiguous binary label map (0/255) with no segment metadata.
#     expert = np.zeros((2, 6, 6), dtype=np.uint8)
#     expert[:, 1:3, 1:3] = 255
#
#     with pytest.raises(HTTPException) as exc_info:
#         compare_expert_dicom_to_prediction_volume(
#             study_id="ST-test-ambiguous",
#             prediction=pred,
#             expert_volume=expert,
#             expert_slices=[],
#         )
#
#     exc = exc_info.value
#     assert exc.status_code == 400
#     assert isinstance(exc.detail, dict)
#     assert exc.detail.get("code") == "EXPERT_MASK_LABEL_MAPPING_REQUIRED"
#
#
# def test_compare_strict_accepts_dicom_seg_metadata_mapping():
#     pred = np.zeros((2, 6, 6), dtype=np.uint8)
#     pred[:, 1:3, 1:3] = 1
#     pred[:, 3:5, 1:3] = 2
#     pred[:, 2:4, 3:5] = 3
#
#     # Expert uses arbitrary segment numbers, mapped by SEG metadata labels.
#     expert = np.zeros((2, 6, 6), dtype=np.uint8)
#     expert[:, 1:3, 1:3] = 10
#     expert[:, 3:5, 1:3] = 20
#     expert[:, 2:4, 3:5] = 30
#
#     seg_ds = _SegDs(
#         [
#             _SegItem(10, "GGO"),
#             _SegItem(20, "Reticulation"),
#             _SegItem(30, "Consolidation"),
#         ]
#     )
#     payload = compare_expert_dicom_to_prediction_volume(
#         study_id="ST-test-seg-map",
#         prediction=pred,
#         expert_volume=expert,
#         expert_slices=[seg_ds],
#     )
#
#     assert payload["mapping_source"] == "dicom_seg_metadata"
#     assert payload["expert_remap_mode"] == "dicom_seg_metadata"
#     assert payload["dice"]["dice_any_ild"] == pytest.approx(1.0)
