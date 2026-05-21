from __future__ import annotations

from typing import Tuple

import numpy as np
from scipy.ndimage import (
    binary_closing,
    binary_opening,
    label as cc_label,
    zoom,
)


def zyx_to_hwd(volume: np.ndarray) -> np.ndarray:
    """Convert backend volume orientation (Z, Y, X) -> notebook style (H, W, D)."""
    return np.transpose(volume, (1, 2, 0))


def hwd_to_zyx(volume: np.ndarray) -> np.ndarray:
    """Convert notebook volume orientation (H, W, D) -> backend style (Z, Y, X)."""
    return np.transpose(volume, (2, 0, 1))


def resample_mask_to_shape(
    mask: np.ndarray,
    target_shape: Tuple[int, int, int],
    *,
    binary: bool,
) -> np.ndarray:
    if mask.ndim == 4 and mask.shape[-1] == 1:
        mask = mask[..., 0]
    mask = np.asarray(mask)
    if mask.ndim != 3:
        raise ValueError(f"Expected 3D mask, got shape={mask.shape}")

    tgt = tuple(int(v) for v in tuple(target_shape)[:3])
    if len(tgt) != 3:
        raise ValueError(f"Expected 3D target shape, got {target_shape}")

    if mask.shape == tgt:
        return mask.astype(np.uint8, copy=False)
    if np.prod(mask.shape) == 0 or np.prod(tgt) == 0:
        return np.zeros(tgt, dtype=np.uint8)

    factors = tuple(float(t) / float(s) for t, s in zip(tgt, mask.shape))
    try:
        out = zoom(mask.astype(np.float32), factors, order=0, prefilter=False)
    except Exception:
        z_idx = np.clip(
            np.rint(np.linspace(0, mask.shape[0] - 1, tgt[0])).astype(np.int64),
            0,
            mask.shape[0] - 1,
        )
        y_idx = np.clip(
            np.rint(np.linspace(0, mask.shape[1] - 1, tgt[1])).astype(np.int64),
            0,
            mask.shape[1] - 1,
        )
        x_idx = np.clip(
            np.rint(np.linspace(0, mask.shape[2] - 1, tgt[2])).astype(np.int64),
            0,
            mask.shape[2] - 1,
        )
        out = mask[np.ix_(z_idx, y_idx, x_idx)].astype(np.float32, copy=False)

    if out.shape != tgt:
        out = np.asarray(out)[: tgt[0], : tgt[1], : tgt[2]]
        if out.shape != tgt:
            padded = np.zeros(tgt, dtype=np.float32)
            overlap = tuple(min(out.shape[i], tgt[i]) for i in range(3))
            padded[: overlap[0], : overlap[1], : overlap[2]] = out[
                : overlap[0], : overlap[1], : overlap[2]
            ]
            out = padded

    if binary:
        return (out > 0.5).astype(np.uint8)
    return np.rint(out).clip(0, 255).astype(np.uint8)


def lung_mask_from_hu(
    volume_hu: np.ndarray,
    low: float = -1000.0,
    high: float = -200.0,
) -> np.ndarray:
    hu = np.asarray(volume_hu, dtype=np.float32)
    m = (hu >= low) & (hu <= high)
    if not np.any(m):
        return np.zeros(hu.shape, dtype=np.uint8)
    b = m.astype(bool)
    struct = np.ones((3, 3, 3), dtype=bool)
    b = binary_opening(b, structure=struct, iterations=1)
    b = binary_closing(b, structure=struct, iterations=1)
    if not np.any(b):
        return b.astype(np.uint8)
    labeled, n = cc_label(b)
    if n <= 0:
        return b.astype(np.uint8)
    sizes = [int(np.sum(labeled == i)) for i in range(1, n + 1)]
    keep = 1 + int(np.argmax(sizes))
    return (labeled == keep).astype(np.uint8)
