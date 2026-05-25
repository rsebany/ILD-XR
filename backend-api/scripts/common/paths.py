"""Resolved paths for CLI scripts (run from repo root or backend-api/)."""
from __future__ import annotations

import os
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parent.parent
BACKEND_API_DIR = SCRIPTS_DIR.parent
PROJECT_ROOT = BACKEND_API_DIR.parent
BACKEND_AI_DIR = PROJECT_ROOT / "backend-ai"
DEFAULT_WEIGHTS_PATH = BACKEND_API_DIR / "weights" / "best_multiclass_model.pth"


def default_api_base() -> str:
    return (
        os.environ.get("ILD_API_BASE_URL")
        or os.environ.get("NEXT_PUBLIC_API_BASE_URL")
        or "http://127.0.0.1:8000"
    )
