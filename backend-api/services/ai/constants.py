"""Shared label map and pipeline exceptions for AI services."""
from __future__ import annotations

from typing import Dict

# 0=background, 1=GGO, 2=Reticulation, 3=Consolidation
# Must match `backend-ai/config.py` CLASS_LABELS for training vs inference.
CLASS_LABELS: Dict[int, str] = {1: "ggo", 2: "reticulation", 3: "consolidation"}


class DicomInputError(ValueError):
    """Raised when uploaded imaging data is invalid for processing."""


__all__ = ["CLASS_LABELS", "DicomInputError"]
