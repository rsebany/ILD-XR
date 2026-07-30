"""Sliding-window Softmax cascade — supports both legacy & hierarchical models."""
from __future__ import annotations

import gc
from pathlib import Path
from typing import Optional, Tuple

import numpy as np
import torch
import torch.nn.functional as F
from scipy import ndimage
from tqdm import tqdm

from services.ai import bootstrap
from services.ai.config import DEVICE, logger
from services.ai.constants import (
    _CLS_PATCH_SIZE,
    _INFER_DENSE_STRIDE,
    _INFER_MAX_PATCHES,
    _MIN_PATCH_LUNG_FRAC_CLS,
    _NUM_CLASSES,
    _VOL_SMOOTH_SIZE,
    CASCADE_PATH_THRESH,
    CASCADE_PROB_THRESH,
)

__all__ = ["softmax_cascade_inference", "patient_cascade_binary"]


def patient_cascade_binary(
    pathology_fraction: float,
    mean_ild_prob: float,
    *,
    path_thresh: float = CASCADE_PATH_THRESH,
    prob_thresh: float = CASCADE_PROB_THRESH,
) -> int:
    """Patient-level ILD call: pathology_fraction >= path_thresh OR mean_ild_prob >= prob_thresh.

    Voxel pathology maps remain plain Softmax argmax; this rule is only for patient binary.
    """
    return int(pathology_fraction >= path_thresh or mean_ild_prob >= prob_thresh)


def _is_cuda_runtime_failure(exc: Exception) -> bool:
    if isinstance(exc, torch.cuda.OutOfMemoryError):
        return True
    msg = str(exc).lower()
    cuda_keywords = (
        "cuda error", "cublas", "cudnn", "cuda out of memory",
        "no cuda gpu", "cuda device", "cuda unavailable",
        "cuda kernel", "device-side assert", "cuda runtime",
        "cufft", "cusolver", "cusparse",
    )
    return any(kw in msg for kw in cuda_keywords)


def _smooth_volume_labels(
    labels: np.ndarray, lung_mask: np.ndarray, size: int = _VOL_SMOOTH_SIZE
) -> np.ndarray:
    if size < 2:
        return labels
    lung = lung_mask > 0.5
    if not lung.any():
        return labels
    vol = labels.copy()
    vol[~lung] = 0
    filtered = ndimage.median_filter(vol, size=size)
    out = labels.copy()
    out[lung] = filtered[lung]
    out[~lung] = 0
    return out.astype(np.uint8)


def _extract_patch(
    volume: np.ndarray, origin: Tuple[int, int, int], patch_size: Tuple[int, int, int]
) -> np.ndarray:
    oz, oy, ox = origin
    pd, ph, pw = patch_size
    z1 = min(volume.shape[0], oz + pd)
    y1 = min(volume.shape[1], oy + ph)
    x1 = min(volume.shape[2], ox + pw)
    patch = volume[oz:z1, oy:y1, ox:x1]
    if patch.shape != (pd, ph, pw):
        out = np.zeros((pd, ph, pw), dtype=volume.dtype)
        out[: patch.shape[0], : patch.shape[1], : patch.shape[2]] = patch
        return out
    return patch


def softmax_cascade_inference(
    ct_norm: np.ndarray,
    lung_mask: np.ndarray,
    encoder_weights: Path,
    softmax_weights: Optional[Path] = None,
    *,
    device: str = DEVICE,
    patch_size: Tuple[int, int, int] = _CLS_PATCH_SIZE,
    stride: Tuple[int, int, int] = _INFER_DENSE_STRIDE,
    max_patches: int = _INFER_MAX_PATCHES,
    cascade_stats: Optional[dict] = None,
) -> np.ndarray:
    """Dense Softmax classification inside a lungmask-preprocessed volume.

    Supports two modes:
      1. Legacy: encoder_weights (Med3DPathologyEncoder3D) + softmax_weights (separate head)
      2. Hierarchical: encoder_weights points to a single HierarchicalEncoder3D checkpoint
         (softmax_weights ignored — uses model.path_head for 5-class pathology mapping
          and model.binary_head for Normal vs ILD)

    Returns uint8 volume (Z,Y,X) with 6-class labels (0=Normal, 1-5=pathology).
    Voxel maps use plain argmax. When ``cascade_stats`` is provided, it is filled with
    pathology_fraction, mean_ild_prob, and patient_binary_ild from the dual-threshold rule.
    """
    ct_norm = np.asarray(ct_norm, dtype=np.float32)
    lung_mask = (np.asarray(lung_mask) > 0.5).astype(np.float32)
    if ct_norm.ndim != 3:
        raise ValueError(f"Expected ct_norm (D,H,W), got {ct_norm.shape}")

    def _run(device_name: str) -> np.ndarray:
        # Detect checkpoint type: hierarchical has 3 heads, legacy has encoder + head
        ckpt = torch.load(str(encoder_weights), map_location="cpu", weights_only=False)
        is_hierarchical = isinstance(ckpt, dict) and any(
            k in ckpt.get("model", ckpt) for k in ("binary_head.0.weight", "binary_head.1.weight")
        )
        del ckpt

        if is_hierarchical:
            logger.info("Loading HierarchicalEncoder3D checkpoint")
            model = bootstrap.HierarchicalEncoder3D()
            bootstrap.load_hierarchical_checkpoint(model, encoder_weights)
            model.to(device_name).eval()
            _infer = _hierarchical_infer
            model_ref = model
        else:
            logger.info("Loading legacy Med3DPathologyEncoder3D + separate head")
            if softmax_weights is None:
                raise FileNotFoundError("softmax_weights required for legacy checkpoint mode")
            encoder = bootstrap.Med3DPathologyEncoder3D()
            bootstrap.load_encoder_from_checkpoint(encoder, encoder_weights)
            head = bootstrap.build_softmax_head()
            bootstrap.load_softmax_head_from_checkpoint(
                head, softmax_weights, encoder_ckpt=encoder_weights
            )
            encoder.to(device_name).eval()
            head.to(device_name).eval()
            _infer = _legacy_infer
            model_ref = (encoder, head)

        d, h, w = ct_norm.shape
        pd, ph, pw = patch_size
        vote = np.zeros((_NUM_CLASSES, d, h, w), dtype=np.float32)
        weight = np.zeros((d, h, w), dtype=np.float32)

        coords = np.argwhere(lung_mask > 0.5)
        if len(coords) == 0:
            if cascade_stats is not None:
                cascade_stats.clear()
                cascade_stats.update(
                    {
                        "pathology_fraction": 0.0,
                        "mean_ild_prob": 0.0,
                        "patient_binary_ild": 0,
                        "decision_rule": (
                            f"path_frac>={CASCADE_PATH_THRESH} OR "
                            f"mean_ild_prob>={CASCADE_PROB_THRESH}"
                        ),
                    }
                )
            return np.zeros((d, h, w), dtype=np.uint8)

        z0, y0, x0 = coords.min(axis=0)
        z1, y1, x1 = coords.max(axis=0) + 1
        zs = list(range(max(0, z0 - pd // 2), max(1, min(d, z1) - pd + 1), stride[0])) or [0]
        ys = list(range(max(0, y0 - ph // 2), max(1, min(h, y1) - ph + 1), stride[1])) or [0]
        xs = list(range(max(0, x0 - pw // 2), max(1, min(w, x1) - pw + 1), stride[2])) or [0]

        processed = 0
        with torch.no_grad():
            for oz in tqdm(zs, desc="Softmax patches", leave=False):
                for oy in ys:
                    for ox in xs:
                        if processed >= max_patches:
                            break
                        lung_crop = _extract_patch(lung_mask, (oz, oy, ox), patch_size)
                        if float(lung_crop.mean()) < _MIN_PATCH_LUNG_FRAC_CLS:
                            continue
                        patch = _extract_patch(ct_norm, (oz, oy, ox), patch_size)
                        proba = _infer(patch, model_ref, device_name)
                        dd, hh, ww = lung_crop.shape
                        inside = lung_crop > 0.5
                        for c in range(_NUM_CLASSES):
                            vote[c, oz : oz + dd, oy : oy + hh, ox : ox + ww][inside] += float(proba[c])
                        weight[oz : oz + dd, oy : oy + hh, ox : ox + ww][inside] += 1.0
                        processed += 1

        mask = np.zeros((d, h, w), dtype=np.uint8)
        inside = lung_mask > 0.5
        if inside.any():
            probs = vote[:, inside] / np.maximum(weight[inside], 1e-6)
            mask[inside] = np.argmax(probs, axis=0).astype(np.uint8)
            mean_ild_prob = float(np.mean(1.0 - probs[0]))
            path_frac = float(np.mean(mask[inside] > 0))
        else:
            mean_ild_prob = 0.0
            path_frac = 0.0

        if _VOL_SMOOTH_SIZE >= 2:
            mask = _smooth_volume_labels(mask, lung_mask, size=_VOL_SMOOTH_SIZE)
            if inside.any():
                path_frac = float(np.mean(mask[inside] > 0))

        if cascade_stats is not None:
            cascade_stats.clear()
            cascade_stats.update(
                {
                    "pathology_fraction": path_frac,
                    "mean_ild_prob": mean_ild_prob,
                    "patient_binary_ild": patient_cascade_binary(path_frac, mean_ild_prob),
                    "decision_rule": (
                        f"path_frac>={CASCADE_PATH_THRESH} OR "
                        f"mean_ild_prob>={CASCADE_PROB_THRESH}"
                    ),
                }
            )

        logger.info(
            "Softmax cascade: processed=%d lung_voxels=%d path_frac=%.4f mean_ild=%.4f patient_bin=%s",
            processed,
            int(inside.sum()),
            path_frac,
            mean_ild_prob,
            cascade_stats.get("patient_binary_ild") if cascade_stats else "n/a",
        )
        del model_ref
        gc.collect()
        return mask.astype(np.uint8)

    try:
        return _run(device)
    except (RuntimeError, torch.cuda.CudaError) as exc:
        if device.startswith("cuda") and _is_cuda_runtime_failure(exc):
            logger.warning("CUDA softmax inference failed (%s); retrying on CPU", exc)
            try:
                torch.cuda.empty_cache()
            except Exception:
                pass
            return _run("cpu")
        raise


def _hierarchical_infer(
    patch: np.ndarray, model: torch.nn.Module, device_name: str
) -> np.ndarray:
    """Run HierarchicalEncoder3D on a single patch, return 6-class proba."""
    tensor = torch.from_numpy(patch).unsqueeze(0).unsqueeze(0).float().to(device_name)
    feat = model.extract_features(tensor)

    # Binary head: Normal (0) vs ILD (1-5)
    bin_logits = model.binary_head(feat)
    bin_proba = F.softmax(bin_logits, dim=1)  # [1, 2] -> [Normal, ILD]
    p_ild = float(bin_proba[0, 1].item())

    # Path head: 5-class pathology (only meaningful when ILD)
    path_logits = model.path_head(feat)
    path_proba = F.softmax(path_logits, dim=1)[0]  # [5]

    # Build 6-class probability: [Normal, Emphysema, Fibrosis, GGO, Micronodules, Consolidation]
    proba_6 = np.zeros(6, dtype=np.float32)
    proba_6[0] = 1.0 - p_ild  # Normal = not ILD
    proba_6[1:6] = path_proba.cpu().numpy() * p_ild  # scale pathology by ILD probability
    return proba_6


def _legacy_infer(
    patch: np.ndarray, model_ref: Tuple[torch.nn.Module, torch.nn.Module], device_name: str
) -> np.ndarray:
    """Run legacy Med3DPathologyEncoder3D + separate head."""
    encoder, head = model_ref
    tensor = torch.from_numpy(patch).unsqueeze(0).unsqueeze(0).float().to(device_name)
    feat = encoder(tensor)
    return F.softmax(head(feat), dim=1).cpu().numpy()[0]
