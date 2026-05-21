from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
from fastapi import HTTPException

from schemas import SegmentationRevisionInfo
from services.core.paths import DICOM_STORAGE
from services.dicom.series_read import hu_volume_zyx_and_spacing_sync, read_sorted_dicom_slices
from services.sync.segmentation import LABEL_CONTRACT, load_manifest


def to_mask_url(study_id: str, revision_id: int) -> str:
    return f"/studies/{study_id}/segmentation-revisions/{revision_id}/mask"


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def study_dicom_dir(study_id: str) -> Path:
    p = DICOM_STORAGE / study_id
    if not p.exists():
        raise HTTPException(status_code=404, detail="Study DICOM directory not found.")
    return p


def load_dicom_volume_and_spacing(study_id: str) -> tuple[np.ndarray, tuple[float, float, float]]:
    root = study_dicom_dir(study_id)
    slices = read_sorted_dicom_slices(root)
    if not slices:
        raise HTTPException(status_code=404, detail="No DICOM files found for this study.")
    return hu_volume_zyx_and_spacing_sync(slices)


def as_revision_info(study_id: str, item: dict[str, Any]) -> SegmentationRevisionInfo:
    return SegmentationRevisionInfo(
        revision_id=int(item["revision_id"]),
        source=str(item["source"]),
        revision_note=item.get("revision_note"),
        created_at=datetime.fromisoformat(item["created_at"]),
        geometry=item["geometry"],
        labels=item.get("labels") or LABEL_CONTRACT,
        mask_url=to_mask_url(study_id, int(item["revision_id"])),
        mesh_url=item.get("mesh_url"),
    )
