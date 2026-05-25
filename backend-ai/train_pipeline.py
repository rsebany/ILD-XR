from __future__ import annotations

import importlib.util
import os
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple, Union

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import DataLoader
from tqdm import tqdm

# ---------------------------------------------------------------------------
# Local imports (file-based loading — no package install required)
# ---------------------------------------------------------------------------

_BACKEND_AI_DIR = Path(__file__).resolve().parent


def _load_backend_ai_module(rel_path: str, module_name: str):
    path = _BACKEND_AI_DIR / rel_path
    spec = importlib.util.spec_from_file_location(module_name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)  # type: ignore[union-attr]
    return mod


_unet3d = _load_backend_ai_module("models/unet3d.py", "_ildxr_backend_ai_unet3d")
UNet3DResidual = _unet3d.UNet3DResidual

_config = _load_backend_ai_module("config.py", "_ildxr_backend_ai_config")
PATCH_SIZE: Tuple[int, int, int] = _config.PATCH_SIZE
STRIDE: Tuple[int, int, int] = _config.STRIDE
CLASS_THRESHOLDS: Dict[int, float] = _config.CLASS_THRESHOLDS
TEMPERATURE: float = _config.TEMPERATURE
IN_CHANNELS: int = _config.IN_CHANNELS
NUM_CLASSES: int = 4

_losses = _load_backend_ai_module("utils/losses.py", "_ildxr_backend_ai_losses")
DeepSupervisionLoss = _losses.DeepSupervisionLoss
HybridMulticlassLoss = _losses.HybridMulticlassLoss
DEFAULT_DS_WEIGHTS = _losses.DEFAULT_DS_WEIGHTS

_DEFAULT_WEIGHTS_PATH = _BACKEND_AI_DIR / "weights" / "best_multiclass_model.pth"
_TRAINING_DS_PREFIXES = ("ds2.", "ds3.")


# ---------------------------------------------------------------------------
# Checkpoint loading
# ---------------------------------------------------------------------------


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
    """Remove training-only auxiliary heads (ds2.*, ds3.*)."""
    return {
        k: v
        for k, v in state_dict.items()
        if not k.startswith(_TRAINING_DS_PREFIXES)
    }


def load_trained_model(
    checkpoint_path: Union[str, Path],
    device: Union[str, torch.device],
) -> UNet3DResidual:
    """Load a fine-tuned v2.2 checkpoint into eval-mode ``UNet3DResidual``.

    Strips deep-supervision head weights used only during training, then loads
    with ``strict=False`` for minor checkpoint/key mismatches.
    """
    torch_device = torch.device(device) if isinstance(device, str) else device
    ckpt = _strip_deep_supervision_keys(
        _extract_state_dict(_load_checkpoint_raw(checkpoint_path, torch_device))
    )

    model = UNet3DResidual(in_channels=IN_CHANNELS, num_classes=NUM_CLASSES).to(
        torch_device
    )
    model.load_state_dict(ckpt, strict=False)
    model.eval()
    return model


# ---------------------------------------------------------------------------
# Post-inference label fusion
# ---------------------------------------------------------------------------


def threshold_predict(
    prob_vol_cdhw: np.ndarray,
    lung_mask: np.ndarray,
    thresholds: Dict[int, float],
) -> np.ndarray:
    """Per-class thresholding with highest-probability tie-breaking.

    Args:
        prob_vol_cdhw: Softmax probabilities, shape (C, D, H, W).
        lung_mask: Binary (D, H, W); voxels outside lung → background.
        thresholds: ``{class_id: min_probability}``; lower = more sensitive.

    Returns:
        int32 label map (D, H, W).
    """
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


# ---------------------------------------------------------------------------
# Sliding-window inference (standalone)
# ---------------------------------------------------------------------------


def _stride_step(patch_len: int, stride_len: int, patch_size_dim: int) -> int:
    return max(1, int(patch_len * (stride_len / patch_size_dim)))


def _window_starts(volume_len: int, patch_len: int, step: int) -> List[int]:
    """Start indices so the last window still covers the far boundary."""
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
    """Sliding-window inference on a 2-channel preprocessed stack.

    Args:
        model: Eval-mode UNet (returns logits only at inference).
        volume: float32 (2, D, H, W) from :func:`preprocess_volume`.
        patch_size: Defaults to :data:`PATCH_SIZE`.
        stride: Defaults to :data:`STRIDE`.
        device: Torch device.
        return_probs: If True, return ``(mask, avg_probs)`` with probs (4, D, H, W).
        temperature: Softmax temperature (lower → sharper probabilities).
        lung_mask: Optional (D, H, W) restriction; defaults to all-lung.
        thresholds: Per-class cutoffs; defaults to :data:`CLASS_THRESHOLDS`.
            Pass ``{}`` for plain argmax.

    Returns:
        uint8 mask (D, H, W), or ``(mask, probs)`` when ``return_probs=True``.
    """
    patch_size = patch_size or PATCH_SIZE
    stride = stride or STRIDE

    vol = np.asarray(volume, dtype=np.float32)
    if vol.ndim != 4 or vol.shape[0] != IN_CHANNELS:
        raise ValueError(f"Expected ({IN_CHANNELS}, D, H, W), got {vol.shape}")

    _, d, h, w = vol.shape
    p_d, p_h, p_w = patch_size
    torch_device = torch.device(device) if isinstance(device, str) else device

    vol_tensor = torch.from_numpy(vol).unsqueeze(0).to(torch_device)

    pad_d = max(0, p_d - d)
    pad_h = max(0, p_h - h)
    pad_w = max(0, p_w - w)
    if pad_d or pad_h or pad_w:
        vol_tensor = F.pad(
            vol_tensor, (0, pad_w, 0, pad_h, 0, pad_d), mode="replicate"
        )
    _, _, D, H, W = vol_tensor.shape

    accum = torch.zeros((1, NUM_CLASSES, D, H, W), device=torch_device)
    counts = torch.zeros_like(accum)

    sd = _stride_step(p_d, stride[0], patch_size[0])
    sh = _stride_step(p_h, stride[1], patch_size[1])
    sw = _stride_step(p_w, stride[2], patch_size[2])

    z_starts = _window_starts(D, p_d, sd)
    y_starts = _window_starts(H, p_h, sh)
    x_starts = _window_starts(W, p_w, sw)

    model.eval()
    with torch.no_grad():
        for z in tqdm(z_starts, desc="Volumetric inference"):
            for y in y_starts:
                for x in x_starts:
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


# ---------------------------------------------------------------------------
# Training
# ---------------------------------------------------------------------------


def build_default_training_loss(
    n_classes: int = NUM_CLASSES,
    device: Union[str, torch.device] = "cuda",
) -> DeepSupervisionLoss:
    """Hybrid CE + focal Tversky wrapped for UNet deep-supervision heads."""
    torch_device = torch.device(device) if isinstance(device, str) else device
    hybrid = HybridMulticlassLoss(n_classes=n_classes).to(torch_device)
    return DeepSupervisionLoss(hybrid, weights=DEFAULT_DS_WEIGHTS)


def run_training_loop(
    model: nn.Module,
    train_loader: DataLoader,
    val_loader: DataLoader,
    *,
    num_epochs: int = 100,
    learning_rate: float = 3e-4,
    device: Union[str, torch.device] = "cuda",
    n_classes: int = NUM_CLASSES,
) -> nn.Module:
    """Simple AdamW train/val loop (validation forward-only, no metrics)."""
    torch_device = torch.device(device) if isinstance(device, str) else device
    optimizer = torch.optim.AdamW(model.parameters(), lr=learning_rate)
    criterion = build_default_training_loss(n_classes=n_classes, device=torch_device)
    model.to(torch_device)

    for epoch in range(num_epochs):
        model.train()
        for volumes, masks in tqdm(train_loader, desc=f"Epoch {epoch + 1}/{num_epochs}"):
            volumes = volumes.to(torch_device)
            masks = masks.to(torch_device)
            optimizer.zero_grad()
            outputs = model(volumes)
            loss = criterion(outputs, masks)
            loss.backward()
            optimizer.step()

        model.eval()
        with torch.no_grad():
            for volumes, masks in val_loader:
                volumes = volumes.to(torch_device)
                masks = masks.to(torch_device)
                _ = model(volumes)

    return model


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def _main() -> None:
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    if _DEFAULT_WEIGHTS_PATH.exists():
        load_trained_model(_DEFAULT_WEIGHTS_PATH, device)
        print(f"Model loaded from {_DEFAULT_WEIGHTS_PATH}")
    else:
        print(f"Weights not found at {_DEFAULT_WEIGHTS_PATH}")


if __name__ == "__main__":
    _main()


__all__ = [
    "UNet3DResidual",
    "PATCH_SIZE",
    "STRIDE",
    "CLASS_THRESHOLDS",
    "TEMPERATURE",
    "DeepSupervisionLoss",
    "HybridMulticlassLoss",
    "load_trained_model",
    "threshold_predict",
    "predict_full_volume",
    "build_default_training_loss",
    "run_training_loop",
]
