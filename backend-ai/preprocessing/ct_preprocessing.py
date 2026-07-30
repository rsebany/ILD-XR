from __future__ import annotations

from typing import Tuple

import numpy as np
import SimpleITK as sitk

HU_CLIP_LOWER = -1350.0
HU_CLIP_UPPER = 150.0

_DEFAULT_TARGET_SPACING = (1.0, 1.0, 1.0)  # (sz, sy, sx) mm


def _spacing_zyx_to_xyz(spacing_zyx: Tuple[float, float, float]) -> Tuple[float, float, float]:
    sz, sy, sx = (float(s) for s in spacing_zyx)
    return (sx, sy, sz)


def _isotropic_resample(
    volume_zyx: np.ndarray,
    input_spacing_xyz: Tuple[float, float, float],
    output_spacing_xyz: Tuple[float, float, float],
) -> np.ndarray:
    if volume_zyx.ndim != 3:
        raise ValueError(f"Expected 3-D volume, got shape {volume_zyx.shape}")

    image = sitk.GetImageFromArray(np.asarray(volume_zyx))
    image.SetSpacing(tuple(float(s) for s in input_spacing_xyz))

    orig_size = image.GetSize()
    orig_sp = image.GetSpacing()
    out_sp = tuple(float(s) for s in output_spacing_xyz)
    new_size = [
        max(1, int(round(s * (o / n))))
        for s, o, n in zip(orig_size, orig_sp, out_sp)
    ]

    resampler = sitk.ResampleImageFilter()
    resampler.SetSize(new_size)
    resampler.SetOutputSpacing(out_sp)
    resampler.SetOutputDirection(image.GetDirection())
    resampler.SetOutputOrigin(image.GetOrigin())
    resampler.SetTransform(sitk.Transform())
    resampler.SetInterpolator(sitk.sitkLinear)

    return sitk.GetArrayFromImage(resampler.Execute(image)).astype(np.float32, copy=False)


__all__ = [
    "HU_CLIP_LOWER",
    "HU_CLIP_UPPER",
    "_DEFAULT_TARGET_SPACING",
    "_isotropic_resample",
    "_spacing_zyx_to_xyz",
]
