"""
Shared in-process state for DICOM/segmentation handling.

* ``MASK_STORAGE`` — directory for ``{study_id}.npy`` masks.
* ``_analysis_cache`` — in-memory cache for metrics + mask arrays (used by
  ``GET /studies/{id}/metrics`` and ``POST .../ai-analysis``), including legacy
  study IDs that were only ever served from memory.
"""
from __future__ import annotations

from pathlib import Path

_BASE = Path(__file__).resolve().parents[2]
MASK_STORAGE = _BASE / "data" / "masks"
MASK_STORAGE.mkdir(parents=True, exist_ok=True)

_analysis_cache: dict[str, dict] = {}
