from __future__ import annotations
from io import BytesIO

import numpy as np
from fastapi import APIRouter, HTTPException, Response
from scipy.ndimage import zoom
from PIL import Image, ImageDraw

from services.studies.analysis_state import MASK_STORAGE

from .common import (
    _ct_hu_plane_to_lung_window_rgb,
    _ensure_study_dicom_dir,
    _load_dicom_volume_and_slices,
)

router = APIRouter(prefix="/studies", tags=["studies"])


def _apply_ild_class_overlay_to_rgb(
    rgb: np.ndarray,
    mask_slice: np.ndarray,
    overlay_opacity: float,
) -> None:
    """Blend ILD class colors onto ``rgb`` [H,W,3] uint8 in place."""
    if not np.any(mask_slice > 0):
        return
    alpha = float(min(1.0, max(0.0, overlay_opacity)))
    class_colors: dict[int, np.ndarray] = {
        1: np.array([102.0, 204.0, 102.0], dtype=np.float32),
        2: np.array([43.0, 119.0, 255.0], dtype=np.float32),
        3: np.array([255.0, 230.0, 64.0], dtype=np.float32),
    }
    for class_id, color in class_colors.items():
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
    """Pick axial plane ``z_index`` from mask [D,H,W] and resize to CT in-plane (h,w)."""
    md, mh, mw = mask.shape
    if md == d:
        mask_z = z_index
    else:
        mask_z = int(round((z_index / max(d - 1, 1)) * max(md - 1, 0)))
    mask_slice = mask[mask_z, :, :].astype(np.float32, copy=False)
    if (mh, mw) != (h, w):
        mask_slice = zoom(mask_slice, (h / mh, w / mw), order=0)
    return np.rint(mask_slice).astype(np.uint8, copy=False)


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
    # 1. Load native stack
    study_dicom_dir = _ensure_study_dicom_dir(study_id)
    if not study_dicom_dir.exists():
        raise HTTPException(status_code=404, detail="DICOM data not found on disk")

    try:
        volume, dicom_slices = _load_dicom_volume_and_slices(study_dicom_dir)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    d, h, w = volume.shape
    _logp = f"[SliceOverlay {study_id} {orientation} z={z_index}]"

    orientation = orientation.lower()
    if orientation not in ["axial", "coronal", "sagittal"]:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid orientation: {orientation}. Must be axial, coronal, or sagittal",
        )

    if orientation == "axial":
        max_idx = d - 1
        if z_index < 0 or z_index >= d:
            raise HTTPException(
                status_code=400, detail=f"z_index must be in [0, {max_idx}] for axial"
            )
    elif orientation == "coronal":
        max_idx = h - 1
        if z_index < 0 or z_index >= h:
            raise HTTPException(
                status_code=400, detail=f"z_index must be in [0, {max_idx}] for coronal"
            )
    else:
        max_idx = w - 1
        if z_index < 0 or z_index >= w:
            raise HTTPException(
                status_code=400, detail=f"z_index must be in [0, {max_idx}] for sagittal"
            )

    slope = float(getattr(dicom_slices[0], "RescaleSlope", 1.0))
    intercept = float(getattr(dicom_slices[0], "RescaleIntercept", 0.0))
    vol_hu = volume * slope + intercept

    if not include_overlay:
        if orientation == "axial":
            ct_slice_3d = vol_hu[z_index, :, :]
        elif orientation == "coronal":
            ct_slice_3d = vol_hu[:, z_index, :]
        else:
            ct_slice_3d = vol_hu[:, :, z_index]
        rgb = _ct_hu_plane_to_lung_window_rgb(
            ct_slice_3d, window_center, window_width, denoise
        )
        print(
            f"{_logp} original_ct vol={vol_hu.shape} slab={ct_slice_3d.shape} "
            f"z={z_index}/{max_idx} denoise={denoise}"
        )
        buf = BytesIO()
        Image.fromarray(rgb, mode="RGB").save(buf, format="PNG")
        buf.seek(0)
        return Response(content=buf.read(), media_type="image/png")

    mask_path = MASK_STORAGE / f"{study_id}.npy"
    if not mask_path.exists():
        raise HTTPException(status_code=404, detail="Mask not available on disk")
    mask = np.load(mask_path).astype(np.uint8)
    if mask.ndim != 3:
        raise HTTPException(status_code=500, detail="Stored mask has invalid shape")

    volume = vol_hu
    md, mh, mw = mask.shape

    if orientation == "axial":
        ct_slice_3d = volume[z_index, :, :]
        if md == d:
            mask_z = z_index
        else:
            mask_z = int(round((z_index / max(d - 1, 1)) * max(md - 1, 0)))
        mask_slice = mask[mask_z, :, :]
        slice_h, slice_w = h, w
        mask_slice_h, mask_slice_w = mh, mw

    elif orientation == "coronal":
        ct_slice_3d = volume[:, z_index, :]
        if mh == h:
            mask_y = z_index
        else:
            mask_y = int(round((z_index / max(h - 1, 1)) * max(mh - 1, 0)))
        mask_slice = mask[:, mask_y, :]
        slice_h, slice_w = d, w
        mask_slice_h, mask_slice_w = md, mw

    else:
        ct_slice_3d = volume[:, :, z_index]
        if mw == w:
            mask_x = z_index
        else:
            mask_x = int(round((z_index / max(w - 1, 1)) * max(mw - 1, 0)))
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
        f"{_logp} vol={volume.shape} mask3d={mask.shape} "
        f"slab={ct_slice_3d.shape} z_idx={z_index}/{max_idx} "
        f"mask_fg={n_pos} ({frac * 100:.4f}%) {resize_note}"
    )

    if mask_slice.shape != (slice_h, slice_w):
        raise HTTPException(status_code=500, detail="Mask/DICOM size mismatch after alignment")

    rgb = _ct_hu_plane_to_lung_window_rgb(
        ct_slice_3d, window_center, window_width, denoise
    )

    _apply_ild_class_overlay_to_rgb(rgb, mask_slice, overlay_opacity)

    buf = BytesIO()
    Image.fromarray(rgb, mode="RGB").save(buf, format="PNG")
    buf.seek(0)

    return Response(content=buf.read(), media_type="image/png")


@router.get(
    "/{study_id}/expert-compare/slices/{z_index}",
    summary="Axial dual-panel PNG: CT+AI mask | CT+expert mask (after compare upload)",
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
    """
    Side-by-side visualization like View2D: left = AI prediction overlay, right = last expert
    mask from ``POST /studies/upload/expert-mask-compare`` (saved as ``{study_id}.expert_compare.npy``).
    Axial index ``z_index`` matches ``/studies/{id}/slices/{z}`` for the same study.
    """
    study_dicom_dir = _ensure_study_dicom_dir(study_id)
    if not study_dicom_dir.exists():
        raise HTTPException(status_code=404, detail="DICOM data not found on disk")

    try:
        volume, dicom_slices = _load_dicom_volume_and_slices(study_dicom_dir)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    slope = float(getattr(dicom_slices[0], "RescaleSlope", 1.0))
    intercept = float(getattr(dicom_slices[0], "RescaleIntercept", 0.0))
    vol_hu = volume * slope + intercept
    d, h, w = vol_hu.shape
    max_idx = d - 1
    if z_index < 0 or z_index >= d:
        raise HTTPException(
            status_code=400, detail=f"z_index must be in [0, {max_idx}] for expert-compare (axial)"
        )

    pred_path = MASK_STORAGE / f"{study_id}.prediction_compare.npy"
    expert_path = MASK_STORAGE / f"{study_id}.expert_compare.npy"
    if not pred_path.exists():
        pred_path = MASK_STORAGE / f"{study_id}.npy"
    if not pred_path.exists():
        raise HTTPException(status_code=404, detail="AI mask not available on disk")
    if not expert_path.exists():
        raise HTTPException(
            status_code=404,
            detail=(
                "No expert comparison volume. Run **Expert mask vs AI** compare on Upload DICOM "
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
