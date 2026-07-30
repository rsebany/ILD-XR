"""Resolved paths for CLI scripts (run from repo root or backend-api/)."""
from __future__ import annotations

import os
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parent.parent
BACKEND_API_DIR = SCRIPTS_DIR.parent
PROJECT_ROOT = BACKEND_API_DIR.parent
BACKEND_AI_DIR = PROJECT_ROOT / "backend-ai"

INFER_FOLD = int(os.environ.get("ILD_INFER_FOLD", "0"))

DEFAULT_MED3D_WEIGHTS_PATH = BACKEND_API_DIR / "weights" / "resnet_18.pth"
DEFAULT_ENCODER_WEIGHTS_PATH = BACKEND_API_DIR / "weights" / f"encoder3d_fold{INFER_FOLD}.pth"
DEFAULT_SOFTMAX_WEIGHTS_PATH = BACKEND_API_DIR / "weights" / f"softmax3d_fold{INFER_FOLD}.pth"
DEFAULT_HIERARCHICAL_WEIGHTS_PATH = BACKEND_API_DIR / "weights" / f"hierarchical_fold{INFER_FOLD}.pth"
DEFAULT_WEIGHTS_PATH = DEFAULT_HIERARCHICAL_WEIGHTS_PATH if DEFAULT_HIERARCHICAL_WEIGHTS_PATH.exists() else DEFAULT_ENCODER_WEIGHTS_PATH


def default_api_base() -> str:
    return (
        os.environ.get("ILD_API_BASE_URL")
        or os.environ.get("NEXT_PUBLIC_API_BASE_URL")
        or "http://127.0.0.1:8000"
    )
