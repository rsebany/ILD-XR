"""Load ``backend-ai`` modules at runtime with safe fallbacks for API inference."""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from typing import Tuple

import numpy as np

PROJECT_ROOT = Path(__file__).resolve().parents[3]
BACKEND_AI_DIR = PROJECT_ROOT / "backend-ai"

if str(BACKEND_AI_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_AI_DIR))


def _load_ai_module(rel_path: str, module_name: str):
    path = BACKEND_AI_DIR / rel_path
    spec = importlib.util.spec_from_file_location(module_name, path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = mod
    spec.loader.exec_module(mod)
    return mod


_ai_ct_preprocessing = _load_ai_module(
    "preprocessing/ct_preprocessing.py", "_ai_ct_preprocessing"
)
_ai_postprocess = _load_ai_module("utils/postprocess.py", "_ai_postprocess")
_ai_med3d = _load_ai_module("models/med3d_encoder.py", "_ai_med3d")
_ai_lungmask = _load_ai_module("preprocessing/lungmask_stage1.py", "_ai_lungmask")

Med3DPathologyEncoder3D = _ai_med3d.Med3DPathologyEncoder3D
HierarchicalEncoder3D = _ai_med3d.HierarchicalEncoder3D
build_softmax_head = _ai_med3d.build_softmax_head
build_hierarchical_model = _ai_med3d.build_hierarchical_model
load_encoder_from_checkpoint = _ai_med3d.load_encoder_from_checkpoint
load_softmax_head_from_checkpoint = _ai_med3d.load_softmax_head_from_checkpoint
load_hierarchical_checkpoint = _ai_med3d.load_hierarchical_checkpoint
preprocess_for_softmax = getattr(_ai_lungmask, "preprocess_for_softmax", None)


def _fallback_postprocess_mask(mask: np.ndarray, **_kwargs) -> np.ndarray:
    return np.asarray(mask, dtype=np.uint8)


def _fallback_preprocess_for_softmax(
    volume_zyx: np.ndarray,
    spacing_zyx: Tuple[float, float, float],
    target_spacing: Tuple[float, float, float] = (1.0, 1.0, 1.0),
) -> Tuple[np.ndarray, np.ndarray]:
    hu = np.asarray(volume_zyx, dtype=np.float32)
    hu_norm = (np.clip(hu, -1350.0, 150.0) + 1350.0) / 1500.0
    lung_mask = ((hu >= -1000.0) & (hu <= -200.0)).astype(np.uint8)
    return hu_norm.astype(np.float32), lung_mask


if preprocess_for_softmax is None:
    preprocess_for_softmax = _fallback_preprocess_for_softmax

postprocess_mask = getattr(_ai_postprocess, "postprocess_mask", _fallback_postprocess_mask)

__all__ = [
    "Med3DPathologyEncoder3D",
    "HierarchicalEncoder3D",
    "build_softmax_head",
    "build_hierarchical_model",
    "load_encoder_from_checkpoint",
    "load_softmax_head_from_checkpoint",
    "load_hierarchical_checkpoint",
    "preprocess_for_softmax",
    "postprocess_mask",
]
