"""2D slice PNGs: CT windowing, ILD overlay, expert-compare dual panel."""

from __future__ import annotations

from io import BytesIO
from typing import Any, List, Literal

import numpy as np
from fastapi import APIRouter, HTTPException, Response, status
from PIL import Image, ImageDraw
from scipy.ndimage import zoom

from services.studies.analysis_state import MASK_STORAGE

from .common import (
    _ct_hu_plane_to_lung_window_rgb,
    _ensure_study_dicom_dir,
    _load_dicom_volume_and_slices,
)

# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------

router = APIRouter(prefix="/studies", tags=["studies"])

Orientation = Literal["axial", "coronal", "sagittal"]

_OVERLAY_COLORS: dict[int, np.ndarray] = {
    1: np.array([102.0, 204.0, 102.0], dtype=np.float32),
    2: np.array([43.0, 119.0, 255.0], dtype=np.float32),
    3: np.array([255.0, 230.0, 64.0], dtype=np.float32),
}


# ---------------------------------------------------------------------------
# Overlay & mask alignment
# ---------------------------------------------------------------------------


def _apply_ild_class_overlay_to_rgb(
    rgb: np.ndarray,
    mask_slice: np.ndarray,
    overlay_opacity: float,
) -> None:
    if not np.any(mask_slice > 0):
        return
    alpha = float(min(1.0, max(0.0, overlay_opacity)))
    for class_id, color in _OVERLAY_COLORS.items():
        class_mask = mask_slice == class_id
        if not np.any(class_mask):
            continue
        rgb_masked = rgb[class_mask].astype(np.float32)
        rgb[class_mask] = np.clip(
            (1.0 - alpha) * rgb_masked + alpha * color,
            0,
            255,
        ).astype(np.uint8)


def _axial_mask_slice_resized_to_ct(
    mask: np.ndarray,
    z_index: int,
    d: int,
    h: int,
    w: int,
) -> np.ndarray:
    md, mh, mw = mask.shape
    mask_z = z_index if md == d else int(round((z_index / max(d - 1, 1)) * max(md - 1, 0)))
    mask_slice = mask[mask_z, :, :].astype(np.float32, copy=False)
    if (mh, mw) != (h, w):
        mask_slice = zoom(mask_slice, (h / mh, w / mw), order=0)
    return np.rint(mask_slice).astype(np.uint8, copy=False)


def _png_response(rgb: np.ndarray) -> Response:
    buf = BytesIO()
    Image.fromarray(rgb, mode="RGB").save(buf, format="PNG")
    buf.seek(0)
    return Response(content=buf.read(), media_type="image/png")


# ---------------------------------------------------------------------------
# DICOM load
# ---------------------------------------------------------------------------


def _load_study_hu(study_id: str) -> tuple[np.ndarray, List[Any], int, int, int]:
    study_dicom_dir = _ensure_study_dicom_dir(study_id)
    if not study_dicom_dir.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="DICOM data not found on disk")
    try:
        volume, dicom_slices = _load_dicom_volume_and_slices(study_dicom_dir)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    slope = float(getattr(dicom_slices[0], "RescaleSlope", 1.0))
    intercept = float(getattr(dicom_slices[0], "RescaleIntercept", 0.0))
    vol_hu = volume * slope + intercept
    d, h, w = vol_hu.shape
    return vol_hu, dicom_slices, d, h, w


def _validate_slice_index(
    orientation: Orientation,
    z_index: int,
    d: int,
    h: int,
    w: int,
) -> int:
    if orientation == "axial":
        max_idx = d - 1
    elif orientation == "coronal":
        max_idx = h - 1
    else:
        max_idx = w - 1
    if z_index < 0 or z_index >= (max_idx + 1):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"z_index must be in [0, {max_idx}] for {orientation}",
        )
    return max_idx


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get(
    "/{study_id}/slices/{z_index}",
    summary="2D slice PNG (axial / coronal / sagittal, optional ILD overlay)",
    name="studies_slice_png",
)
async def get_study_slice_overlay(
    study_id: str,
    z_index: int,
    window_center: int = -600,
    window_width: int = 1500,
    orientation: str = "axial",
    include_overlay: bool = True,
    denoise: bool = False,
    overlay_opacity: float = 0.6,
):
    vol_hu, _slices, d, h, w = _load_study_hu(study_id)
    logp = f"[SliceOverlay {study_id} {orientation} z={z_index}]"

    orientation_norm = orientation.lower()
    if orientation_norm not in ("axial", "coronal", "sagittal"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid orientation: {orientation}. Must be axial, coronal, or sagittal",
        )
    orient: Orientation = orientation_norm  # type: ignore[assignment]
    max_idx = _validate_slice_index(orient, z_index, d, h, w)

    if not include_overlay:
        if orient == "axial":
            ct_slice_3d = vol_hu[z_index, :, :]
        elif orient == "coronal":
            ct_slice_3d = vol_hu[:, z_index, :]
        else:
            ct_slice_3d = vol_hu[:, :, z_index]
        rgb = _ct_hu_plane_to_lung_window_rgb(ct_slice_3d, window_center, window_width, denoise)
        print(
            f"{logp} original_ct vol={vol_hu.shape} slab={ct_slice_3d.shape} "
            f"z={z_index}/{max_idx} denoise={denoise}"
        )
        return _png_response(rgb)

    mask_path = MASK_STORAGE / f"{study_id}.npy"
    if not mask_path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Mask not available on disk")
    mask = np.load(mask_path).astype(np.uint8)
    if mask.ndim != 3:
        raise HTTPException(status_code=500, detail="Stored mask has invalid shape")

    md, mh, mw = mask.shape

    if orient == "axial":
        ct_slice_3d = vol_hu[z_index, :, :]
        mask_z = z_index if md == d else int(round((z_index / max(d - 1, 1)) * max(md - 1, 0)))
        mask_slice = mask[mask_z, :, :]
        slice_h, slice_w = h, w
        mask_slice_h, mask_slice_w = mh, mw
    elif orient == "coronal":
        ct_slice_3d = vol_hu[:, z_index, :]
        mask_y = z_index if mh == h else int(round((z_index / max(h - 1, 1)) * max(mh - 1, 0)))
        mask_slice = mask[:, mask_y, :]
        slice_h, slice_w = d, w
        mask_slice_h, mask_slice_w = md, mw
    else:
        ct_slice_3d = vol_hu[:, :, z_index]
        mask_x = z_index if mw == w else int(round((z_index / max(w - 1, 1)) * max(mw - 1, 0)))
        mask_slice = mask[:, :, mask_x]
        slice_h, slice_w = d, h
        mask_slice_h, mask_slice_w = md, mh

    resize_note = "ok"
    if (mask_slice_h, mask_slice_w) != (slice_h, slice_w):
        zoom_h = slice_h / mask_slice_h
        zoom_w = slice_w / mask_slice_w
        mask_slice = zoom(mask_slice, (zoom_h, zoom_w), order=0)
        resize_note = f"resized {mask_slice_h}x{mask_slice_w}->{mask_slice.shape[0]}x{mask_slice.shape[1]}"
    mask_slice = np.rint(mask_slice).astype(np.uint8, copy=False)

    n_pos = int(np.sum(mask_slice > 0))
    frac = n_pos / float(mask_slice.size) if mask_slice.size else 0.0
    print(
        f"{logp} vol={vol_hu.shape} mask3d={mask.shape} "
        f"slab={ct_slice_3d.shape} z_idx={z_index}/{max_idx} "
        f"mask_fg={n_pos} ({frac * 100:.4f}%) {resize_note}"
    )

    if mask_slice.shape != (slice_h, slice_w):
        raise HTTPException(status_code=500, detail="Mask/DICOM size mismatch after alignment")

    rgb = _ct_hu_plane_to_lung_window_rgb(ct_slice_3d, window_center, window_width, denoise)
    _apply_ild_class_overlay_to_rgb(rgb, mask_slice, overlay_opacity)
    return _png_response(rgb)


@router.get(
    "/{study_id}/expert-compare/slices/{z_index}",
    summary="Axial dual-panel PNG: CT+AI mask | CT+expert mask",
    name="studies_expert_compare_slice_png",
)
async def get_study_expert_compare_slice_dual(
    study_id: str,
    z_index: int,
    window_center: int = -600,
    window_width: int = 1500,
    denoise: bool = False,
    overlay_opacity: float = 0.6,
):
    vol_hu, _slices, d, h, w = _load_study_hu(study_id)
    max_idx = d - 1
    if z_index < 0 or z_index >= d:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"z_index must be in [0, {max_idx}] for expert-compare (axial)",
        )

    # Compare caches written by expert_mask_compare; fall back to live AI mask only.
    pred_path = MASK_STORAGE / f"{study_id}.prediction_compare.npy"
    expert_path = MASK_STORAGE / f"{study_id}.expert_compare.npy"
    if not pred_path.exists():
        pred_path = MASK_STORAGE / f"{study_id}.npy"
    if not pred_path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="AI mask not available on disk")
    if not expert_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(
                "No expert comparison volume. Run Expert mask vs AI compare on Upload DICOM "
                "for this study first."
            ),
        )

    pred = np.load(pred_path).astype(np.uint8)
    expert = np.load(expert_path).astype(np.uint8)
    if pred.shape != expert.shape:
        raise HTTPException(
            status_code=500,
            detail=f"AI mask shape {pred.shape} != expert compare shape {expert.shape}",
        )

    ct_slice_3d = vol_hu[z_index, :, :]
    rgb_base = _ct_hu_plane_to_lung_window_rgb(
        ct_slice_3d, window_center, window_width, denoise
    )

    pred_slice = _axial_mask_slice_resized_to_ct(pred, z_index, d, h, w)
    expert_slice = _axial_mask_slice_resized_to_ct(expert, z_index, d, h, w)
    if pred_slice.shape != (h, w) or expert_slice.shape != (h, w):
        raise HTTPException(status_code=500, detail="Mask slice shape mismatch after resize")

    rgb_ai = rgb_base.copy()
    rgb_ex = rgb_base.copy()
    _apply_ild_class_overlay_to_rgb(rgb_ai, pred_slice, overlay_opacity)
    _apply_ild_class_overlay_to_rgb(rgb_ex, expert_slice, overlay_opacity)

    dual = np.concatenate([rgb_ai, rgb_ex], axis=1)
    pil = Image.fromarray(dual, mode="RGB")
    draw = ImageDraw.Draw(pil)
    label_h = 22
    draw.rectangle([0, 0, dual.shape[1] - 1, label_h], fill=(12, 12, 18))
    draw.text((8, 4), "AI prediction", fill=(230, 230, 240))
    draw.text((w + 8, 4), "Expert DICOM", fill=(230, 230, 240))
    draw.text((8, label_h + 4), "Class IDs: 1=GGO, 2=Reticulation, 3=Consolidation", fill=(220, 220, 230))

    buf = BytesIO()
    pil.save(buf, format="PNG")
    buf.seek(0)
    return Response(content=buf.read(), media_type="image/png")
