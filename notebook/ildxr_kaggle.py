"""Self-contained ILD-XR v2.2 inference for Kaggle (no backend-api dependency)."""
from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple, Union

import numpy as np
import pydicom
import SimpleITK as sitk
import torch
import torch.nn as nn
import torch.nn.functional as F
from PIL import Image
from scipy import ndimage
from scipy.ndimage import uniform_filter
from skimage import measure, morphology, segmentation
from tqdm import tqdm

# --- config (backend-ai/config.py) ---
PATCH_SIZE: Tuple[int, int, int] = (32, 128, 128)
STRIDE: Tuple[int, int, int] = (16, 64, 64)
CLASS_LABELS: Dict[int, str] = {1: "ggo", 2: "reticulation", 3: "consolidation"}
IN_CHANNELS: int = 2
NUM_CLASSES: int = 4
TEMPERATURE: float = 0.45
CLASS_THRESHOLDS: Dict[int, float] = {1: 0.05, 2: 0.07, 3: 0.05}

HU_CLIP_LOWER = -1350.0
HU_CLIP_UPPER = 150.0
_HU_RANGE = HU_CLIP_UPPER - HU_CLIP_LOWER
LUNG_HU_THRESHOLD = -400
_MORPH_MAX_SIZE = 99
_ROI_BG_TOLERANCE = 1e-1
_ROI_FG_DELTA = 10.0
_DEFAULT_TARGET_SPACING = (1.0, 1.0, 1.0)
_TRAINING_DS_PREFIXES = ("ds2.", "ds3.")

# Table VIII footer fallback when Kaggle exports alone (override via merge_local_latency.py).
TABLE_VIII_FOOTER_E2E_SEC_MEAN_CPU = 266.4
TABLE_VIII_FOOTER_MESH_SEC_MEAN = 0.0
TABLE_VIII_FOOTER_FPS_LATENCY = "60 / 45 ms"


# --- model (backend-ai/models/unet3d.py) ---
class ResidualBlock3D(nn.Module):
    def __init__(self, in_channels: int, out_channels: int):
        super().__init__()
        self.conv = nn.Sequential(
            nn.Conv3d(in_channels, out_channels, kernel_size=3, padding=1),
            nn.BatchNorm3d(out_channels),
            nn.ReLU(inplace=True),
            nn.Conv3d(out_channels, out_channels, kernel_size=3, padding=1),
            nn.BatchNorm3d(out_channels),
        )
        self.shortcut = (
            nn.Conv3d(in_channels, out_channels, kernel_size=1)
            if in_channels != out_channels
            else nn.Identity()
        )
        self.relu = nn.ReLU(inplace=True)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.relu(self.conv(x) + self.shortcut(x))


class UNet3DResidual(nn.Module):
    def __init__(self, in_channels: int = 2, num_classes: int = 4, base_channels: int = 32):
        super().__init__()
        c1, c2, c3, c4 = base_channels, base_channels * 2, base_channels * 4, base_channels * 8
        self.enc1 = ResidualBlock3D(in_channels, c1)
        self.enc2 = ResidualBlock3D(c1, c2)
        self.enc3 = ResidualBlock3D(c2, c3)
        self.pool = nn.MaxPool3d(kernel_size=2, stride=2)
        self.bottleneck = ResidualBlock3D(c3, c4)
        self.up3 = nn.ConvTranspose3d(c4, c3, kernel_size=2, stride=2)
        self.dec3 = ResidualBlock3D(c3 + c3, c3)
        self.ds3 = nn.Conv3d(c3, num_classes, kernel_size=1)
        self.up2 = nn.ConvTranspose3d(c3, c2, kernel_size=2, stride=2)
        self.dec2 = ResidualBlock3D(c2 + c2, c2)
        self.ds2 = nn.Conv3d(c2, num_classes, kernel_size=1)
        self.up1 = nn.ConvTranspose3d(c2, c1, kernel_size=2, stride=2)
        self.dec1 = ResidualBlock3D(c1 + c1, c1)
        self.final = nn.Conv3d(c1, num_classes, kernel_size=1)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        e1 = self.enc1(x)
        e2 = self.enc2(self.pool(e1))
        e3 = self.enc3(self.pool(e2))
        b = self.bottleneck(self.pool(e3))
        d3 = F.interpolate(self.up3(b), size=e3.shape[2:], mode="trilinear", align_corners=False)
        d3 = self.dec3(torch.cat([d3, e3], dim=1))
        d2 = F.interpolate(self.up2(d3), size=e2.shape[2:], mode="trilinear", align_corners=False)
        d2 = self.dec2(torch.cat([d2, e2], dim=1))
        d1 = F.interpolate(self.up1(d2), size=e1.shape[2:], mode="trilinear", align_corners=False)
        d1 = self.dec1(torch.cat([d1, e1], dim=1))
        if self.training:
            out_ds2 = F.interpolate(self.ds2(d2), size=d1.shape[2:], mode="trilinear", align_corners=False)
            out_ds3 = F.interpolate(self.ds3(d3), size=d1.shape[2:], mode="trilinear", align_corners=False)
            return self.final(d1), out_ds2, out_ds3
        return self.final(d1)


# --- preprocessing ---
def _spacing_zyx_to_xyz(spacing_zyx: Tuple[float, float, float]) -> Tuple[float, float, float]:
    sz, sy, sx = (float(s) for s in spacing_zyx)
    return (sx, sy, sz)


def _clip_normalize_hu(volume: np.ndarray) -> np.ndarray:
    clipped = np.clip(volume, HU_CLIP_LOWER, HU_CLIP_UPPER)
    return ((clipped - HU_CLIP_LOWER) / _HU_RANGE).astype(np.float32)


def _isotropic_resample(
    volume_zyx: np.ndarray,
    input_spacing_xyz: Tuple[float, float, float],
    output_spacing_xyz: Tuple[float, float, float],
    *,
    nearest: bool = False,
) -> np.ndarray:
    image = sitk.GetImageFromArray(np.asarray(volume_zyx))
    image.SetSpacing(tuple(float(s) for s in input_spacing_xyz))
    orig_size = image.GetSize()
    orig_sp = image.GetSpacing()
    out_sp = tuple(float(s) for s in output_spacing_xyz)
    new_size = [max(1, int(round(s * (o / n)))) for s, o, n in zip(orig_size, orig_sp, out_sp)]
    resampler = sitk.ResampleImageFilter()
    resampler.SetSize(new_size)
    resampler.SetOutputSpacing(out_sp)
    resampler.SetOutputDirection(image.GetDirection())
    resampler.SetOutputOrigin(image.GetOrigin())
    resampler.SetTransform(sitk.Transform())
    resampler.SetInterpolator(sitk.sitkNearestNeighbor if nearest else sitk.sitkLinear)
    return sitk.GetArrayFromImage(resampler.Execute(image)).astype(
        np.float32 if not nearest else np.uint8, copy=False
    )


def _morphological_lung_mask_slice(slice_yx: np.ndarray) -> np.ndarray:
    binary = slice_yx < LUNG_HU_THRESHOLD
    try:
        cleared = morphology.remove_small_objects(binary, max_size=_MORPH_MAX_SIZE)
    except TypeError:
        cleared = morphology.remove_small_objects(binary, min_size=_MORPH_MAX_SIZE + 1)
    cleared = segmentation.clear_border(cleared)
    labels = measure.label(cleared)
    regions = measure.regionprops(labels)
    if not regions:
        return np.zeros_like(slice_yx, dtype=np.float32)
    regions.sort(key=lambda r: r.area, reverse=True)
    mask = np.zeros_like(slice_yx, dtype=np.float32)
    for region in regions[:2]:
        mask[labels == region.label] = 1.0
    return ndimage.binary_fill_holes(mask).astype(np.float32)


def _adaptive_lung_mask_slice(slice_yx: np.ndarray) -> np.ndarray:
    bg_value = slice_yx[0, 0]
    is_precropped_roi = (
        np.allclose(slice_yx[:5, :5], bg_value, atol=_ROI_BG_TOLERANCE) and bg_value > -200
    )
    mask = (
        (np.abs(slice_yx - bg_value) > _ROI_FG_DELTA).astype(np.float32)
        if is_precropped_roi
        else _morphological_lung_mask_slice(slice_yx)
    )
    if mask.sum() > 0:
        return ndimage.binary_fill_holes(mask).astype(np.float32)
    return np.ones_like(slice_yx, dtype=np.float32)


def _lung_mask_volume_zyx(volume_zyx: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
    vol = np.asarray(volume_zyx, dtype=np.float32)
    lung_mask = np.zeros_like(vol, dtype=np.float32)
    masked = np.zeros_like(vol, dtype=np.float32)
    for z in range(vol.shape[0]):
        m = _adaptive_lung_mask_slice(vol[z])
        lung_mask[z] = m
        masked[z] = vol[z] * m
    return masked, lung_mask


def add_variance_channel(vol: np.ndarray, radius: int = 3) -> np.ndarray:
    kernel = radius * 2 + 1
    vol_f64 = vol.astype(np.float64)
    mean = uniform_filter(vol_f64, size=kernel)
    mean_sq = uniform_filter(vol_f64 ** 2, size=kernel)
    var = np.sqrt(np.maximum(mean_sq - mean ** 2, 0)).astype(np.float32)
    return var / (var.max() + 1e-6)


def preprocess_volume(
    volume_zyx: np.ndarray,
    spacing_zyx: Tuple[float, float, float],
    target_spacing: Tuple[float, float, float] = _DEFAULT_TARGET_SPACING,
) -> Tuple[np.ndarray, np.ndarray]:
    vol = np.asarray(volume_zyx, dtype=np.float32)
    in_xyz = _spacing_zyx_to_xyz(spacing_zyx)
    out_xyz = _spacing_zyx_to_xyz(target_spacing)
    vol_iso = _isotropic_resample(vol, in_xyz, out_xyz)
    masked_vol, lm_vol = _lung_mask_volume_zyx(vol_iso)
    hu_norm = _clip_normalize_hu(masked_vol)
    var_norm = add_variance_channel(hu_norm)
    processed_stack = np.stack([hu_norm, var_norm], axis=0)
    lung_mask = (lm_vol > 0.5).astype(np.uint8)
    return processed_stack, lung_mask


def resample_mask_to_native(
    mask_iso: np.ndarray,
    native_shape: Tuple[int, int, int],
    spacing_zyx: Tuple[float, float, float],
    target_spacing: Tuple[float, float, float] = _DEFAULT_TARGET_SPACING,
) -> np.ndarray:
    """Resample isotropic mask back to native DICOM grid (nearest neighbor)."""
    in_xyz = _spacing_zyx_to_xyz(target_spacing)
    out_xyz = _spacing_zyx_to_xyz(spacing_zyx)
    resampled = _isotropic_resample(mask_iso.astype(np.uint8), in_xyz, out_xyz, nearest=True)
    out = np.zeros(native_shape, dtype=np.uint8)
    z, y, x = (min(resampled.shape[i], native_shape[i]) for i in range(3))
    out[:z, :y, :x] = resampled[:z, :y, :x]
    return out


# --- inference ---
def _load_checkpoint_raw(checkpoint_path: Union[str, Path], device: torch.device):
    try:
        return torch.load(checkpoint_path, map_location=device, weights_only=False)
    except TypeError:
        return torch.load(checkpoint_path, map_location=device)


def _extract_state_dict(checkpoint) -> dict:
    if isinstance(checkpoint, dict) and "state_dict" in checkpoint:
        return checkpoint["state_dict"]
    return checkpoint


def _strip_deep_supervision_keys(state_dict: dict) -> dict:
    return {k: v for k, v in state_dict.items() if not k.startswith(_TRAINING_DS_PREFIXES)}


def load_trained_model(checkpoint_path: Union[str, Path], device: Union[str, torch.device]) -> UNet3DResidual:
    torch_device = torch.device(device) if isinstance(device, str) else device
    ckpt = _strip_deep_supervision_keys(_extract_state_dict(_load_checkpoint_raw(checkpoint_path, torch_device)))
    model = UNet3DResidual(in_channels=IN_CHANNELS, num_classes=NUM_CLASSES).to(torch_device)
    model.load_state_dict(ckpt, strict=False)
    model.eval()
    return model


def threshold_predict(prob_vol_cdhw: np.ndarray, lung_mask: np.ndarray, thresholds: Dict[int, float]) -> np.ndarray:
    _, d, h, w = prob_vol_cdhw.shape
    pred = np.zeros((d, h, w), dtype=np.int32)
    best_prob = np.zeros((d, h, w), dtype=np.float32)
    for class_id, thr in thresholds.items():
        p_c = prob_vol_cdhw[class_id]
        wins = (p_c > thr) & (p_c > best_prob)
        pred[wins] = class_id
        best_prob[wins] = p_c[wins]
    pred[lung_mask < 0.5] = 0
    return pred


def _stride_step(patch_len: int, stride_len: int, patch_size_dim: int) -> int:
    return max(1, int(patch_len * (stride_len / patch_size_dim)))


def _window_starts(volume_len: int, patch_len: int, step: int) -> List[int]:
    if volume_len <= patch_len:
        return [0]
    last = max(volume_len - patch_len, 0)
    return sorted(set(range(0, volume_len - patch_len + 1, step)) | {last})


def predict_full_volume(
    model: nn.Module,
    volume: np.ndarray,
    patch_size: Optional[Tuple[int, int, int]] = None,
    stride: Optional[Tuple[int, int, int]] = None,
    device: Union[str, torch.device] = "cuda",
    return_probs: bool = False,
    temperature: float = TEMPERATURE,
    lung_mask: Optional[np.ndarray] = None,
    thresholds: Optional[Dict[int, float]] = None,
) -> Union[np.ndarray, Tuple[np.ndarray, np.ndarray]]:
    patch_size = patch_size or PATCH_SIZE
    stride = stride or STRIDE
    vol = np.asarray(volume, dtype=np.float32)
    _, d, h, w = vol.shape
    p_d, p_h, p_w = patch_size
    torch_device = torch.device(device) if isinstance(device, str) else device
    vol_tensor = torch.from_numpy(vol).unsqueeze(0).to(torch_device)
    pad_d, pad_h, pad_w = max(0, p_d - d), max(0, p_h - h), max(0, p_w - w)
    if pad_d or pad_h or pad_w:
        vol_tensor = F.pad(vol_tensor, (0, pad_w, 0, pad_h, 0, pad_d), mode="replicate")
    _, _, D, H, W = vol_tensor.shape
    accum = torch.zeros((1, NUM_CLASSES, D, H, W), device=torch_device)
    counts = torch.zeros_like(accum)
    sd = _stride_step(p_d, stride[0], patch_size[0])
    sh = _stride_step(p_h, stride[1], patch_size[1])
    sw = _stride_step(p_w, stride[2], patch_size[2])
    model.eval()
    with torch.no_grad():
        for z in tqdm(_window_starts(D, p_d, sd), desc="Volumetric inference"):
            for y in _window_starts(H, p_h, sh):
                for x in _window_starts(W, p_w, sw):
                    patch = vol_tensor[:, :, z : z + p_d, y : y + p_h, x : x + p_w]
                    probs = F.softmax(model(patch) / temperature, dim=1)
                    slc = (slice(None), slice(None), slice(z, z + p_d), slice(y, y + p_h), slice(x, x + p_w))
                    accum[slc] += probs
                    counts[slc] += 1.0
    avg_probs = (accum / torch.clamp(counts, min=1.0))[0, :, :d, :h, :w].cpu().numpy()
    if thresholds is None:
        thresholds = CLASS_THRESHOLDS
    if lung_mask is None:
        lung_mask = np.ones((d, h, w), dtype=np.float32)
    if thresholds:
        mask = threshold_predict(avg_probs, lung_mask, thresholds).astype(np.uint8)
    else:
        mask = np.argmax(avg_probs, axis=0).astype(np.uint8)
    return (mask, avg_probs) if return_probs else mask


# --- DICOM I/O (ILD_DB layout) ---
def load_dicom_volume(patient_dir: Path) -> Tuple[np.ndarray, Tuple[float, float, float]]:
    """Load CT as HU volume (Z, Y, X) and spacing (sz, sy, sx) mm."""
    ct_files = sorted(
        f for f in patient_dir.iterdir() if f.is_file() and f.suffix.lower() == ".dcm"
    )
    if not ct_files:
        raise FileNotFoundError(f"No .dcm files in {patient_dir}")
    slices: list[np.ndarray] = []
    spacing_zyx: Tuple[float, float, float] | None = None
    for i, f in enumerate(ct_files):
        ds = pydicom.dcmread(f)
        if i == 0:
            ps = getattr(ds, "PixelSpacing", [1.0, 1.0])
            st = float(getattr(ds, "SliceThickness", 1.0))
            spacing_zyx = (st, float(ps[0]), float(ps[1]))
        img = ds.pixel_array.astype(np.float32)
        slope = float(getattr(ds, "RescaleSlope", 1.0))
        intercept = float(getattr(ds, "RescaleIntercept", 0.0))
        slices.append(img * slope + intercept)
    if spacing_zyx is None:
        spacing_zyx = (1.0, 1.0, 1.0)
    return np.stack(slices, axis=0), spacing_zyx


def load_ground_truth_mask(patient_dir: Path, target_shape: tuple[int, int, int]) -> np.ndarray | None:
    mask_dir = patient_dir / "roi_mask"
    if not mask_dir.is_dir():
        return None
    masks: list[np.ndarray] = []
    for f in sorted(mask_dir.iterdir()):
        if f.name.startswith("."):
            continue
        try:
            if f.suffix.lower() == ".dcm":
                arr = pydicom.dcmread(f).pixel_array
            elif f.suffix.lower() in (".png", ".jpg", ".jpeg", ".tif", ".tiff"):
                arr = np.array(Image.open(f).convert("L"))
            else:
                continue
            masks.append(np.clip(np.round(arr), 0, 3).astype(np.uint8))
        except Exception:
            continue
    if not masks:
        return None
    gt = np.stack(masks, axis=0)
    out = np.zeros(target_shape, dtype=np.uint8)
    z = min(gt.shape[0], target_shape[0])
    y = min(gt.shape[1], target_shape[1])
    x = min(gt.shape[2], target_shape[2])
    out[:z, :y, :x] = gt[:z, :y, :x]
    return out


# --- patient cohort / metrics ---
def list_patient_dirs(data_dir: Path) -> List[Path]:
    """Return sorted patient folder paths under ILD_DB_volumeROIs and HRCT_pilot/."""
    seen: set[str] = set()
    dirs: list[Path] = []
    for base in (data_dir, data_dir / "HRCT_pilot"):
        if not base.is_dir():
            continue
        for p in sorted(base.iterdir(), key=lambda x: (not x.name.isdigit(), int(x.name) if x.name.isdigit() else x.name)):
            if not p.is_dir() or not p.name.isdigit():
                continue
            if p.name in seen:
                continue
            seen.add(p.name)
            dirs.append(p)
    return dirs


def list_patient_ids(data_dir: Path) -> List[str]:
    return [p.name for p in list_patient_dirs(data_dir)]


def is_evaluable_patient(patient_dir: Path) -> bool:
    """True when root CT slices and roi_mask/ are present (paper load rule)."""
    if not patient_dir.is_dir():
        return False
    has_dcm = any(
        f.is_file() and f.suffix.lower() == ".dcm"
        for f in patient_dir.iterdir()
    )
    roi_dir = patient_dir / "roi_mask"
    if not has_dcm or not roi_dir.is_dir():
        return False
    for f in roi_dir.iterdir():
        if f.name.startswith("."):
            continue
        if f.suffix.lower() in (".dcm", ".png", ".jpg", ".jpeg", ".tif", ".tiff"):
            return True
    return False


def split_patient_ids(
    patient_ids: Sequence[str | int],
    test_size: float = 0.15,
    seed: int = 42,
) -> Tuple[List[str], List[str]]:
    """Patient-level hold-out split (not patch-level)."""
    from sklearn.model_selection import train_test_split

    ids = sorted({str(pid) for pid in patient_ids}, key=int)
    if len(ids) < 2:
        raise ValueError(f"Need at least 2 patient IDs for split, got {len(ids)}")
    train_ids, val_ids = train_test_split(ids, test_size=test_size, random_state=seed)
    return sorted(train_ids, key=int), sorted(val_ids, key=int)


def dice_per_class_full(pred: np.ndarray, gt: np.ndarray, class_id: int) -> Optional[float]:
    p = pred == class_id
    g = gt == class_id
    if not g.any() and not p.any():
        return 1.0
    if not g.any() or not p.any():
        return 0.0
    return float(2.0 * (p & g).sum() / (p.sum() + g.sum() + 1e-9))


def pattern_volumes_ml(mask: np.ndarray, spacing_zyx: Tuple[float, float, float]) -> Dict[int, float]:
    """Per-class volume in mL from native-grid voxel counts."""
    voxel_mm3 = float(spacing_zyx[0] * spacing_zyx[1] * spacing_zyx[2])
    out: Dict[int, float] = {}
    flat = mask.ravel()
    for class_id in (1, 2, 3):
        count = int(np.sum(flat == class_id))
        out[class_id] = count * voxel_mm3 / 1000.0
    return out


def relative_volume_error(pred_ml: float, gt_ml: float) -> Optional[float]:
    if gt_ml < 1.0 and pred_ml < 1.0:
        return 0.0
    if gt_ml < 1e-6:
        return None
    return abs(pred_ml - gt_ml) / gt_ml


def parity_ok(pred_ml: float, gt_ml: float, rel_threshold: float = 0.25) -> bool:
    if gt_ml < 1.0 and pred_ml < 1.0:
        return True
    err = relative_volume_error(pred_ml, gt_ml)
    return err is not None and err <= rel_threshold


def time_inference(
    model: nn.Module,
    processed_stack: np.ndarray,
    lung_mask: np.ndarray,
    device: Union[str, torch.device],
) -> float:
    """Wall-clock GPU/CPU sliding-window inference in seconds."""
    if torch.cuda.is_available() and str(device).startswith("cuda"):
        torch.cuda.synchronize()
    t0 = time.perf_counter()
    predict_full_volume(
        model,
        processed_stack,
        device=device,
        lung_mask=lung_mask.astype(np.float32),
        thresholds=CLASS_THRESHOLDS,
        temperature=TEMPERATURE,
    )
    if torch.cuda.is_available() and str(device).startswith("cuda"):
        torch.cuda.synchronize()
    return float(time.perf_counter() - t0)


def best_disease_slice_index(gt_mask: np.ndarray) -> int:
    """Axial slice with maximum combined lesion foreground (classes 1--3)."""
    if gt_mask is None or gt_mask.size == 0:
        return 0
    lesion = (gt_mask >= 1) & (gt_mask <= 3)
    if not lesion.any():
        return gt_mask.shape[0] // 2
    per_slice = lesion.reshape(lesion.shape[0], -1).sum(axis=1)
    return int(np.argmax(per_slice))


def evaluate_validation_patient(
    patient_dir: Path,
    model: nn.Module,
    device: str,
) -> Dict[str, Any]:
    """Full-volume metrics for one validation patient."""
    volume_hu, spacing_zyx = load_dicom_volume(patient_dir)
    native_shape = volume_hu.shape
    gt_mask = load_ground_truth_mask(patient_dir, native_shape)
    if gt_mask is None:
        raise FileNotFoundError(f"Missing roi_mask for {patient_dir.name}")

    processed_stack, lung_mask_iso = preprocess_volume(volume_hu, spacing_zyx)
    if torch.cuda.is_available() and str(device).startswith("cuda"):
        torch.cuda.synchronize()
    t0 = time.perf_counter()
    mask_iso = predict_full_volume(
        model,
        processed_stack,
        device=device,
        lung_mask=lung_mask_iso.astype(np.float32),
        thresholds=CLASS_THRESHOLDS,
        temperature=TEMPERATURE,
    )
    if torch.cuda.is_available() and str(device).startswith("cuda"):
        torch.cuda.synchronize()
    infer_sec = float(time.perf_counter() - t0)
    pred_mask = resample_mask_to_native(mask_iso, native_shape, spacing_zyx)

    dice: Dict[str, Optional[float]] = {}
    present: Dict[str, bool] = {}
    for class_id, label in CLASS_LABELS.items():
        g = gt_mask == class_id
        present[label] = bool(g.any())
        dice[label] = dice_per_class_full(pred_mask, gt_mask, class_id)

    pred_vol = pattern_volumes_ml(pred_mask, spacing_zyx)
    gt_vol = pattern_volumes_ml(gt_mask, spacing_zyx)
    parity: Dict[str, Dict[str, Any]] = {}
    for class_id, label in CLASS_LABELS.items():
        p_ml = pred_vol[class_id]
        g_ml = gt_vol[class_id]
        parity[label] = {
            "pred_ml": round(p_ml, 2),
            "gt_ml": round(g_ml, 2),
            "rel_err": round(relative_volume_error(p_ml, g_ml) or 0.0, 4),
            "ok": parity_ok(p_ml, g_ml),
        }

    return {
        "patient_id": patient_dir.name,
        "evaluable": True,
        "shape": list(native_shape),
        "spacing_zyx": list(spacing_zyx),
        "infer_sec_gpu": round(infer_sec, 2),
        "dice": dice,
        "present_in_gt": present,
        "volumes_ml": {"pred": {CLASS_LABELS[k]: pred_vol[k] for k in CLASS_LABELS}, "gt": {CLASS_LABELS[k]: gt_vol[k] for k in CLASS_LABELS}},
        "parity": parity,
        "best_slice": best_disease_slice_index(gt_mask),
        "_volume_hu": volume_hu,
        "_pred_mask": pred_mask,
        "_gt_mask": gt_mask,
    }


def aggregate_validation_metrics(patient_rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Summaries for Tables VII, VIII, XI."""
    eval_rows = [r for r in patient_rows if r.get("evaluable")]
    dice_by_class: Dict[str, List[float]] = {label: [] for label in CLASS_LABELS.values()}
    present_counts = {label: 0 for label in CLASS_LABELS.values()}
    infer_times: List[float] = []
    parity_pass = 0
    parity_total = 0

    for row in eval_rows:
        infer_times.append(float(row["infer_sec_gpu"]))
        for label in CLASS_LABELS.values():
            if row["present_in_gt"].get(label):
                present_counts[label] += 1
            d = row["dice"].get(label)
            if d is not None:
                dice_by_class[label].append(float(d))
        for label in CLASS_LABELS.values():
            parity_total += 1
            if row["parity"][label]["ok"]:
                parity_pass += 1

    summary: Dict[str, Any] = {
        "n_patients": len(eval_rows),
        "dice": {},
        "infer_sec_gpu_mean": round(float(np.mean(infer_times)), 2) if infer_times else None,
        "infer_sec_gpu_std": round(float(np.std(infer_times)), 2) if infer_times else None,
        "parity_pass_rate": round(parity_pass / parity_total, 4) if parity_total else None,
        "parity_pass": parity_pass,
        "parity_total": parity_total,
    }
    for label in CLASS_LABELS.values():
        vals = dice_by_class[label]
        summary["dice"][label] = {
            "n": len(eval_rows),
            "present": present_counts[label],
            "mean": round(float(np.mean(vals)), 3) if vals else None,
            "std": round(float(np.std(vals)), 3) if vals else None,
        }
    return summary


def export_validation_bundle(
    output_dir: Path,
    train_ids: List[str],
    val_ids: List[str],
    patient_rows: List[Dict[str, Any]],
    *,
    hardware: str = "2x Tesla T4 (Kaggle)",
    weights_path: Optional[Path] = None,
) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    summary = aggregate_validation_metrics(patient_rows)
    payload = {
        "split": {
            "seed": 42,
            "test_size": 0.15,
            "train_ids": train_ids,
            "val_ids": val_ids,
            "n_train": len(train_ids),
            "n_val": len(val_ids),
        },
        "hardware": hardware,
        "weights": str(weights_path) if weights_path else None,
        "stride": list(STRIDE),
        "patch_size": list(PATCH_SIZE),
        "summary": summary,
        "patients": [{k: v for k, v in row.items() if not k.startswith("_")} for row in patient_rows],
        "table_viii_footer": {
            "e2e_sec_mean_cpu_gate": TABLE_VIII_FOOTER_E2E_SEC_MEAN_CPU,
            "e2e_sec_mean_cpu_holdout": TABLE_VIII_FOOTER_E2E_SEC_MEAN_CPU,
            "mesh_sec_mean": TABLE_VIII_FOOTER_MESH_SEC_MEAN,
            "fps_latency": TABLE_VIII_FOOTER_FPS_LATENCY,
        },
    }
    json_path = output_dir / "validation_metrics.json"
    json_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    csv_path = output_dir / "validation_patient_rows.csv"
    header = [
        "patient_id",
        "evaluable",
        "infer_sec_gpu",
        "dice_ggo",
        "dice_reticulation",
        "dice_consolidation",
        "pred_ggo_ml",
        "pred_ret_ml",
        "pred_cons_ml",
        "gt_ggo_ml",
        "gt_ret_ml",
        "gt_cons_ml",
    ]
    lines = [",".join(header)]
    for row in patient_rows:
        if not row.get("evaluable"):
            lines.append(
                f"{row['patient_id']},False,,,,,,,,,,"
            )
            continue
        lines.append(
            ",".join(
                [
                    row["patient_id"],
                    "True",
                    str(row["infer_sec_gpu"]),
                    str(row["dice"]["ggo"]),
                    str(row["dice"]["reticulation"]),
                    str(row["dice"]["consolidation"]),
                    str(row["parity"]["ggo"]["pred_ml"]),
                    str(row["parity"]["reticulation"]["pred_ml"]),
                    str(row["parity"]["consolidation"]["pred_ml"]),
                    str(row["parity"]["ggo"]["gt_ml"]),
                    str(row["parity"]["reticulation"]["gt_ml"]),
                    str(row["parity"]["consolidation"]["gt_ml"]),
                ]
            )
        )
    csv_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return json_path


def find_patient_dir(data_dir: Path, patient_id: int | str) -> Path:
    pid = str(patient_id)
    for base in (data_dir, data_dir / "HRCT_pilot"):
        candidate = base / pid
        if candidate.is_dir():
            return candidate
    raise FileNotFoundError(f"Patient {pid} not found under {data_dir}")


def run_patient_inference(
    patient_dir: Path,
    model: nn.Module,
    device: str,
) -> Tuple[np.ndarray, Tuple[float, float, float], np.ndarray]:
    """Full pipeline: DICOM → preprocess → infer → native-grid mask."""
    volume_hu, spacing_zyx = load_dicom_volume(patient_dir)
    native_shape = volume_hu.shape
    processed_stack, lung_mask_iso = preprocess_volume(volume_hu, spacing_zyx)
    mask_iso = predict_full_volume(
        model,
        processed_stack,
        device=device,
        lung_mask=lung_mask_iso.astype(np.float32),
        thresholds=CLASS_THRESHOLDS,
        temperature=TEMPERATURE,
    )
    mask_native = resample_mask_to_native(mask_iso, native_shape, spacing_zyx)
    return mask_native, spacing_zyx, volume_hu


def resolve_weights() -> Path:
    """Stage-2 fine-tuned checkpoint (2-channel HU+variance)."""
    candidates = [
        Path("/kaggle/input/datasets/harifraise/fine-tuning-second/best_finetuned_multiclass_model.pth"),
        Path("/kaggle/input/fine-tuning-second/best_finetuned_multiclass_model.pth"),
        Path("/kaggle/input/datasets/harifraise/segmentation-ild-classes/best_finetuned_multiclass_model.pth"),
        Path("/kaggle/input/datasets/harifraise/segmentation-ild-classes/best_multiclass_model.pth"),
        Path("/kaggle/input/segmentation-ild-classes/best_multiclass_model.pth"),
        Path("/kaggle/input/datasets/harifraise/segmentation-ild-classes/best_multiclass_model/best_multiclass_model.pth"),
    ]
    for p in candidates:
        if p.is_file():
            return p
    weights_dir = Path(__file__).resolve().parents[1] / "Project" / "ILD-XR-main" / "backend-api" / "weights"
    for name in ("best_finetuned_multiclass_model.pth", "best_multiclass_model.pth"):
        local = weights_dir / name
        if local.is_file():
            return local
    raise FileNotFoundError(
        "Stage-2 weights not found. Add harifraise/fine-tuning-second (best_finetuned_multiclass_model.pth) on Kaggle."
    )


def resolve_data_dir() -> Path:
    candidates = [
        Path("/kaggle/input/datasets/romualdosebany/intertitial-lung-disease/ILD_DB/ILD_DB_volumeROIs"),
        Path("/kaggle/input/intertitial-lung-disease/ILD_DB/ILD_DB_volumeROIs"),
        Path("/kaggle/input/datasets/romualdosebany/intertitial-lung-disease/ILD_DB_volumeROIs"),
    ]
    for p in candidates:
        if p.is_dir():
            return p
    may_full = Path(__file__).resolve().parents[2] / "05-May" / "Week1" / "data" / "MedGIFT" / "ILD_DB_volumeROIs"
    if may_full.is_dir():
        return may_full
    local = Path(__file__).resolve().parents[2] / "07-July" / "ILD-XR-main" / "data" / "validation" / "ILD_DB_volumeROIs"
    if local.is_dir():
        return local
    raise FileNotFoundError("ILD_DB_volumeROIs not found. Add romualdosebany/intertitial-lung-disease on Kaggle.")
