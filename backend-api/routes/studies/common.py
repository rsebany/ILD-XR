from __future__ import annotations

import json
import shutil
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np
from fastapi import HTTPException
from scipy.ndimage import gaussian_filter

from models.db import get_session
from models.models import StudyORM
from services.core.paths import (
    BASE_DIR,
    DICOM_STORAGE,
    STATIC_MESH_DIR,
    WEIGHTS_PATH,
)
from services.dicom.series_read import (
    read_sorted_dicom_slices,
    spacing_zyx_mm,
    stack_pixel_volume_zyx_viewer,
)


def _ct_hu_plane_to_lung_window_rgb(
    ct_slice_3d: np.ndarray,
    window_center: int,
    window_width: int,
    denoise: bool,
) -> np.ndarray:
    """
    Grayscale 8-bit RGB for one 2D HU frame: DICOM rescaled intensity + window, optional blur.
    Does not use AI masks or training-style normalization.
    """
    lower = float(window_center) - float(window_width) / 2.0
    upper = float(window_center) + float(window_width) / 2.0
    ct_slice = np.clip(ct_slice_3d, lower, upper)
    ct_slice = (ct_slice - lower) / (upper - lower) if upper != lower else np.zeros_like(ct_slice)
    if denoise:
        ct_slice = gaussian_filter(ct_slice, sigma=0.8)
    gray = np.clip(ct_slice * 255.0, 0, 255).astype(np.uint8)
    return np.stack([gray, gray, gray], axis=-1)


def _ensure_study_dicom_dir(study_id: str) -> Path:
    """Return path to stored DICOM series, backfilling from volume_path when needed."""
    study_dicom_dir = DICOM_STORAGE / study_id
    if not study_dicom_dir.exists():
        with get_session() as session:
            study = (
                session.query(StudyORM)
                .filter(StudyORM.external_id == study_id)
                .first()
            )
            volume_path = Path(study.volume_path) if study and study.volume_path else None
            if volume_path and volume_path.exists():
                try:
                    study_dicom_dir.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copytree(volume_path, study_dicom_dir, dirs_exist_ok=True)
                except Exception as exc:  # noqa: BLE001
                    raise HTTPException(
                        status_code=500,
                        detail=f"Failed to reconstruct DICOM data from volume_path: {exc}",
                    ) from exc
    return study_dicom_dir


def _load_dicom_volume_and_slices(study_dicom_dir: Path) -> tuple[np.ndarray, List[Any]]:
    """
    Load and stack DICOM files into a [D, H, W] volume (same ordering as slice overlay).
    Returns sorted pydicom datasets for HU metadata (RescaleSlope / RescaleIntercept).
    """
    slices = read_sorted_dicom_slices(study_dicom_dir)
    if not slices:
        raise ValueError("Study directory contains no DICOM files")
    for s in slices:
        if len(s.pixel_array.shape) == 3:
            print(
                f"[DICOM Debug] Multi-frame detected: {s.pixel_array.shape[0]} frames, using only first frame"
            )
            break
    volume = stack_pixel_volume_zyx_viewer(slices)
    return volume, slices


def _dicom_series_spacing_mm(slices: List[Any]) -> tuple[float, float, float]:
    """
    Spacing in mm (z along index 0, y row, x col) matching (D, H, W) volume order.
    """
    return spacing_zyx_mm(slices, mode="viewer")


def _legacy_patient_json(
    *,
    patient_id: Optional[str],
    patient_name: Optional[str],
    date_of_birth: Optional[str],
    clinical_notes: Optional[str],
) -> str:
    resolved_name = (patient_name or "").strip()
    resolved_id = (patient_id or "").strip()
    if not resolved_name:
        resolved_name = resolved_id or "Unknown Patient"

    payload: Dict[str, Any] = {
        "name": resolved_name,
        "dob": date_of_birth,
        "sex": "U",
        "notes": clinical_notes,
    }
    if resolved_id and resolved_id != "patient-unknown":
        payload["id"] = resolved_id
    return json.dumps(payload)
