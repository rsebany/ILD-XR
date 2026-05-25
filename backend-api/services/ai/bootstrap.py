"""Load ``backend-ai`` modules at runtime with safe fallbacks for API inference."""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from typing import Tuple

import numpy as np

# ---------------------------------------------------------------------------
# Paths & dynamic module loader
# ---------------------------------------------------------------------------

PROJECT_ROOT = Path(__file__).resolve().parents[3]
BACKEND_AI_DIR = PROJECT_ROOT / "backend-ai"


def _load_ai_module(rel_path: str, module_name: str):
    path = BACKEND_AI_DIR / rel_path
    spec = importlib.util.spec_from_file_location(module_name, path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = mod
    spec.loader.exec_module(mod)
    return mod


# ---------------------------------------------------------------------------
# backend-ai imports (model, preprocess, postprocess, train)
# ---------------------------------------------------------------------------

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

# ---------------------------------------------------------------------------
# Fallbacks when backend-ai modules are unavailable
# ---------------------------------------------------------------------------


def _fallback_postprocess_mask(mask: np.ndarray, **_kwargs) -> np.ndarray:
    return np.asarray(mask, dtype=np.uint8)


def _fallback_add_variance_channel(
    vol: np.ndarray, radius: int = 3
) -> np.ndarray:
    return np.zeros_like(vol, dtype=np.float32)


def _fallback_preprocess_volume(
    volume_zyx: np.ndarray,
    spacing_zyx: Tuple[float, float, float],
    target_spacing: Tuple[float, float, float] = (1.0, 1.0, 1.0),
) -> Tuple[np.ndarray, np.ndarray]:
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
    pred = np.argmax(prob_vol_cdhw, axis=0).astype(np.int32)
    pred[lung_mask < 0.5] = 0
    return pred


add_variance_channel = getattr(
    _ai_ct_preprocessing, "add_variance_channel", _fallback_add_variance_channel
)
preprocess_volume = getattr(
    _ai_ct_preprocessing, "preprocess_volume", _fallback_preprocess_volume
)
postprocess_mask = getattr(_ai_postprocess, "postprocess_mask", _fallback_postprocess_mask)

if threshold_predict is None:
    threshold_predict = _fallback_threshold_predict

__all__ = [
    "UNet3DResidual",
    "add_variance_channel",
    "load_trained_model",
    "postprocess_mask",
    "predict_full_volume",
    "preprocess_volume",
    "threshold_predict",
]
