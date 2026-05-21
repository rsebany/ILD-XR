from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from typing import Tuple

import numpy as np
from scipy.ndimage import zoom

PROJECT_ROOT = Path(__file__).resolve().parents[3]
BACKEND_AI_DIR = PROJECT_ROOT / "backend-ai"


def _load_ai_module(rel_path: str, module_name: str):
    path = BACKEND_AI_DIR / rel_path
    spec = importlib.util.spec_from_file_location(module_name, path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = mod
    spec.loader.exec_module(mod)
    return mod


_ai_unet3d = _load_ai_module("models/unet3d.py", "_ai_unet3d")
UNet3DResidual = _ai_unet3d.UNet3DResidual
_ai_ct_preprocessing = _load_ai_module(
    "preprocessing/ct_preprocessing.py", "_ai_ct_preprocessing"
)
_ai_postprocess = _load_ai_module("utils/postprocess.py", "_ai_postprocess")
_ai_train_pipeline = _load_ai_module("train_pipeline.py", "_ai_train_pipeline")
predict_full_volume = getattr(_ai_train_pipeline, "predict_full_volume", None)
load_trained_model = getattr(_ai_train_pipeline, "load_trained_model", None)
threshold_predict = getattr(_ai_train_pipeline, "threshold_predict", None)

# Fallback definition

def _fallback_isotropic_resample(
    volume: np.ndarray,
    original_spacing: Tuple[float, float, float],
    target_spacing: Tuple[float, float, float] = (1.0, 1.0, 1.0),
) -> Tuple[np.ndarray, Tuple[float, float, float]]:
    in_spacing = tuple(float(s) for s in original_spacing)
    out_spacing = tuple(float(s) for s in target_spacing)
    factors = tuple(i / o for i, o in zip(in_spacing, out_spacing))
    resampled = zoom(volume.astype(np.float32, copy=False), factors, order=1, prefilter=True)
    return resampled.astype(np.float32, copy=False), out_spacing


def _fallback_preprocess_volume_with_mask(
    volume: np.ndarray,
) -> Tuple[np.ndarray, np.ndarray]:
    hu = np.asarray(volume, dtype=np.float32)
    lower, upper = -1350.0, 150.0
    clipped = np.clip(hu, lower, upper)
    norm = (clipped - lower) / (upper - lower)
    lung_mask = ((hu >= -1000.0) & (hu <= -200.0)).astype(np.uint8)
    return norm.astype(np.float32), lung_mask.astype(np.uint8)


def _fallback_preprocess_volume(volume: np.ndarray) -> np.ndarray:
    norm, _ = _fallback_preprocess_volume_with_mask(volume)
    return norm


def _fallback_postprocess_mask(mask: np.ndarray, **_kwargs) -> np.ndarray:
    return np.asarray(mask, dtype=np.uint8)


def _fallback_preprocess_volume_with_cropping(
    volume: np.ndarray,
    original_spacing: Tuple[float, float, float],
    target_spacing: Tuple[float, float, float] = (1.0, 1.0, 1.0),
) -> Tuple[np.ndarray, np.ndarray]:
    """Fallback: simple preprocessing without actual cropping - not recommended"""
    hu = np.asarray(volume, dtype=np.float32)
    lower, upper = -1350.0, 150.0
    clipped = np.clip(hu, lower, upper)
    norm = (clipped - lower) / (upper - lower)
    lung_mask = ((hu >= -1000.0) & (hu <= -200.0)).astype(np.uint8)
    return norm.astype(np.float32), lung_mask.astype(np.uint8)


def _fallback_add_variance_channel(
    vol: np.ndarray, radius: int = 3
) -> np.ndarray:
    """Fallback variance channel: returns zeros (safe no-op)."""
    return np.zeros_like(vol, dtype=np.float32)


def _fallback_preprocess_volume_v2(
    volume_zyx: np.ndarray,
    spacing_zyx: Tuple[float, float, float],
    target_spacing: Tuple[float, float, float] = (1.0, 1.0, 1.0),
) -> Tuple[np.ndarray, np.ndarray]:
    """Fallback v2 pipeline: normalise + dummy variance channel."""
    hu = np.asarray(volume_zyx, dtype=np.float32)
    lower, upper = -1350.0, 150.0
    hu_norm = (np.clip(hu, lower, upper) - lower) / (upper - lower)
    var_ch = np.zeros_like(hu_norm, dtype=np.float32)
    stack = np.stack([hu_norm, var_ch], axis=0)
    lung_mask = ((hu >= -1000.0) & (hu <= -200.0)).astype(np.uint8)
    return stack.astype(np.float32), lung_mask


def _fallback_threshold_predict(
    prob_vol_cdhw: np.ndarray,
    lung_mask: np.ndarray,
    thresholds: dict,
) -> np.ndarray:
    """Fallback: simple argmax prediction ignoring thresholds."""
    pred = np.argmax(prob_vol_cdhw, axis=0).astype(np.int32)
    pred[lung_mask < 0.5] = 0
    return pred


isotropic_resample = getattr(
    _ai_ct_preprocessing, "isotropic_resample", _fallback_isotropic_resample
)
preprocess_volume = getattr(
    _ai_ct_preprocessing, "preprocess_volume", _fallback_preprocess_volume
)
preprocess_volume_with_mask = getattr(
    _ai_ct_preprocessing,
    "preprocess_volume_with_mask",
    _fallback_preprocess_volume_with_mask,
)
preprocess_volume_with_cropping = getattr(
    _ai_ct_preprocessing,
    "preprocess_volume_with_cropping",
    _fallback_preprocess_volume_with_cropping,
)
add_variance_channel = getattr(
    _ai_ct_preprocessing, "add_variance_channel", _fallback_add_variance_channel
)
preprocess_volume_v2 = getattr(
    _ai_ct_preprocessing, "preprocess_volume_v2", _fallback_preprocess_volume_v2
)
postprocess_mask = getattr(_ai_postprocess, "postprocess_mask", _fallback_postprocess_mask)

if threshold_predict is None:
    threshold_predict = _fallback_threshold_predict
