"""Stage-1 lung masking via lungmask R231 (fixed preprocessing, not a trained component)."""
from __future__ import annotations

import logging
import os
from typing import Optional, Tuple

import numpy as np

from preprocessing.ct_preprocessing import (
    HU_CLIP_LOWER,
    HU_CLIP_UPPER,
    _DEFAULT_TARGET_SPACING,
    _isotropic_resample,
    _spacing_zyx_to_xyz,
)

logger = logging.getLogger(__name__)

_LUNGMASK_MODEL = "R231"
# Smaller batches reduce Windows WDDM TDR ("CUDA launch timed out") on consumer GPUs.
_DEFAULT_BATCH_SIZE = 4
_inferer = None
_inferer_force_cpu: Optional[bool] = None
_inferer_batch_size: Optional[int] = None


def _env_bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        return default
    try:
        return max(1, int(raw.strip()))
    except ValueError:
        return default


def normalize_hu_volume(volume_zyx: np.ndarray) -> np.ndarray:
    vol = np.asarray(volume_zyx, dtype=np.float32)
    clipped = np.clip(vol, HU_CLIP_LOWER, HU_CLIP_UPPER)
    return ((clipped - HU_CLIP_LOWER) / (HU_CLIP_UPPER - HU_CLIP_LOWER)).astype(np.float32)


def _is_cuda_runtime_failure(exc: BaseException) -> bool:
    msg = str(exc).lower()
    cuda_keywords = (
        "cuda error",
        "cublas",
        "cudnn",
        "cuda out of memory",
        "no cuda gpu",
        "cuda device",
        "cuda unavailable",
        "cuda kernel",
        "device-side assert",
        "cuda runtime",
        "launch timed out",
        "cufft",
        "cusolver",
        "cusparse",
    )
    return any(kw in msg for kw in cuda_keywords)


def _reset_cuda_after_failure() -> None:
    try:
        import torch

        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            torch.cuda.synchronize()
    except Exception:
        pass


def _get_lungmask_inferer(*, force_cpu: bool, batch_size: int):
    global _inferer, _inferer_force_cpu, _inferer_batch_size
    if (
        _inferer is None
        or _inferer_force_cpu != force_cpu
        or _inferer_batch_size != batch_size
    ):
        from lungmask import LMInferer

        _inferer = LMInferer(
            modelname=_LUNGMASK_MODEL,
            force_cpu=force_cpu,
            batch_size=batch_size,
        )
        _inferer_force_cpu = force_cpu
        _inferer_batch_size = batch_size
        logger.info(
            "lungmask R231 inferer ready (force_cpu=%s batch_size=%d)",
            force_cpu,
            batch_size,
        )
    return _inferer


def _drop_lungmask_inferer() -> None:
    global _inferer, _inferer_force_cpu, _inferer_batch_size
    _inferer = None
    _inferer_force_cpu = None
    _inferer_batch_size = None


def lungmask_binary_zyx(
    volume_hu_zyx: np.ndarray,
    *,
    force_cpu: Optional[bool] = None,
    batch_size: Optional[int] = None,
) -> np.ndarray:
    """Run lungmask R231 on a HU volume with shape (Z, Y, X).

    On CUDA runtime failures (incl. Windows TDR timeouts), rebuilds the inferer
    on CPU and retries so callers do not fall back to HU-threshold masks.
    """
    prefer_cpu = _env_bool("AI_FORCE_CPU", default=False) if force_cpu is None else force_cpu
    bs = _env_int("LUNGMASK_BATCH_SIZE", _DEFAULT_BATCH_SIZE) if batch_size is None else max(1, int(batch_size))
    volume = np.asarray(volume_hu_zyx, dtype=np.int16)

    try:
        inferer = _get_lungmask_inferer(force_cpu=prefer_cpu, batch_size=bs)
        seg = inferer.apply(volume)
        return (seg > 0).astype(np.uint8)
    except Exception as exc:
        if prefer_cpu or not _is_cuda_runtime_failure(exc):
            raise
        logger.warning(
            "lungmask CUDA failed (%s); retrying on CPU (batch_size=%d)",
            exc,
            bs,
        )
        _drop_lungmask_inferer()
        _reset_cuda_after_failure()
        inferer = _get_lungmask_inferer(force_cpu=True, batch_size=bs)
        seg = inferer.apply(volume)
        return (seg > 0).astype(np.uint8)


def hu_threshold_lung_mask(volume_hu_zyx: np.ndarray) -> np.ndarray:
    hu = np.asarray(volume_hu_zyx, dtype=np.float32)
    return ((hu >= -1000.0) & (hu <= -200.0)).astype(np.uint8)


def preprocess_for_softmax(
    volume_zyx: np.ndarray,
    spacing_zyx: Tuple[float, float, float],
    target_spacing: Tuple[float, float, float] = _DEFAULT_TARGET_SPACING,
    *,
    use_lungmask: bool = True,
) -> Tuple[np.ndarray, np.ndarray]:
    """Resample HU volume, normalize, and produce a lung mask for Stage-2 inference."""
    if volume_zyx.ndim != 3:
        raise ValueError(f"Expected (Z, Y, X) volume, got shape {volume_zyx.shape}")

    vol = np.asarray(volume_zyx, dtype=np.float32)
    vol_iso = _isotropic_resample(vol, _spacing_zyx_to_xyz(spacing_zyx), _spacing_zyx_to_xyz(target_spacing))
    ct_norm = normalize_hu_volume(vol_iso)

    lung_mask = None
    if use_lungmask:
        try:
            lung_mask = lungmask_binary_zyx(vol_iso)
            logger.info("lungmask R231 preprocessing OK (lung_frac=%.3f)", float(lung_mask.mean()))
        except Exception as exc:
            logger.warning("lungmask failed (%s); falling back to HU-threshold mask", exc)

    if lung_mask is None:
        lung_mask = hu_threshold_lung_mask(vol_iso)
        logger.warning("Using HU-threshold lung mask fallback (not publication-grade)")

    return ct_norm, lung_mask.astype(np.uint8)


__all__ = [
    "normalize_hu_volume",
    "lungmask_binary_zyx",
    "hu_threshold_lung_mask",
    "preprocess_for_softmax",
]
