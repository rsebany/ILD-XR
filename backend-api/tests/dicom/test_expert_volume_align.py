import numpy as np

from services.dicom.expert_volume_align import auto_correct_inplane_flip


def test_auto_correct_inplane_flip_lr():
    expert = np.zeros((4, 8, 8), dtype=np.uint8)
    expert[:, 2:6, 6:8] = 1  # right side

    ref = np.zeros((4, 8, 8), dtype=np.uint8)
    ref[:, 2:6, 0:2] = 3  # left side (mirror)

    fixed, mode, gain = auto_correct_inplane_flip(expert, ref)
    assert mode == "flip_lr"
    assert gain > 0
    assert int(np.count_nonzero((fixed > 0) & (ref > 0))) > 0


def test_auto_correct_inplane_flip_no_change_when_already_aligned():
    expert = np.zeros((2, 4, 4), dtype=np.uint8)
    expert[0, 1:3, 1:3] = 2
    ref = np.zeros((2, 4, 4), dtype=np.uint8)
    ref[0, 1:3, 1:3] = 2

    fixed, mode, gain = auto_correct_inplane_flip(expert, ref)
    assert mode == "none"
    assert gain == 0
    np.testing.assert_array_equal(fixed, expert)
