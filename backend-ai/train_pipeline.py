import os
import importlib.util
from pathlib import Path
from typing import Dict, Optional, Tuple

import numpy as np
import pydicom
import torch
import torch.nn.functional as F
from torch.utils.data import DataLoader
from tqdm import tqdm

_BACKEND_AI_DIR = Path(__file__).resolve().parent


def _load_backend_ai_module(rel_path: str, module_name: str):
    path = _BACKEND_AI_DIR / rel_path
    spec = importlib.util.spec_from_file_location(module_name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)  # type: ignore[union-attr]
    return mod


_unet3d = _load_backend_ai_module("models/unet3d.py", "_ildxr_backend_ai_unet3d")
UNet3DResidual = _unet3d.UNet3DResidual

'''
def _load_checkpoint(path, map_location=None):
    """Same semantics as ``services.ai.torch_io.load_torch_checkpoint`` (standalone backend-ai copy)."""
    try:
        return torch.load(path, map_location=map_location, weights_only=False)
    except TypeError:
        return torch.load(path, map_location=map_location)
'''

_config = _load_backend_ai_module("config.py", "_ildxr_backend_ai_config")
PATCH_SIZE = _config.PATCH_SIZE
STRIDE = _config.STRIDE
CLASS_THRESHOLDS = _config.CLASS_THRESHOLDS
TEMPERATURE = _config.TEMPERATURE

_losses = _load_backend_ai_module("utils/losses.py", "_ildxr_backend_ai_losses")
DeepSupervisionLoss = _losses.DeepSupervisionLoss
HybridMulticlassLoss = _losses.HybridMulticlassLoss

# load the trained model from the weights folder
def load_trained_model(checkpoint_path, device):
    """Load fine-tuned v2.2 checkpoint into a 2-channel UNet3DResidual.

    Strips deep-supervision head keys (ds2.*, ds3.*) that are only used during
    training and are not present in the inference topology output, then loads
    with strict=False for forward compatibility.
    """
    try:
        ckpt = torch.load(checkpoint_path, map_location=device, weights_only=False)
    except TypeError:
        ckpt = torch.load(checkpoint_path, map_location=device)

    if isinstance(ckpt, dict) and "state_dict" in ckpt:
        ckpt = ckpt["state_dict"]

    # Strip training-only deep-supervision output heads
    ckpt_clean = {
        k: v for k, v in ckpt.items()
        if not (k.startswith("ds2.") or k.startswith("ds3."))
    }

    model = UNet3DResidual(in_channels=2, num_classes=4).to(device)
    model.load_state_dict(ckpt_clean, strict=False)
    model.eval()
    return model


def threshold_predict(
    prob_vol_cdhw: np.ndarray,
    lung_mask: np.ndarray,
    thresholds: Dict[int, float],
) -> np.ndarray:
    """Per-class threshold prediction (v2.2).

    Each foreground class fires when its probability exceeds ``thresholds[c]``.
    When multiple classes exceed their thresholds at the same voxel, the one
    with the highest probability wins.  Non-lung voxels are forced to background.

    Args:
        prob_vol_cdhw: Probability array of shape (C, D, H, W).
        lung_mask: Binary mask of shape (D, H, W); 1 = inside lung.
        thresholds: Mapping of class index → probability threshold.

    Returns:
        Integer prediction array of shape (D, H, W), dtype int32.
    """
    C, D, H, W = prob_vol_cdhw.shape
    pred = np.zeros((D, H, W), dtype=np.int32)
    best_prob = np.zeros((D, H, W), dtype=np.float32)

    for c, thr in thresholds.items():
        p_c = prob_vol_cdhw[c]
        fires = p_c > thr
        wins = fires & (p_c > best_prob)
        pred[wins] = c
        best_prob[wins] = p_c[wins]

    pred[lung_mask < 0.5] = 0
    return pred


def predict_full_volume(
    model,
    volume,
    patch_size=None,
    stride=None,
    device="cuda",
    return_probs=False,
    temperature: float = 0.5,
    lung_mask: Optional[np.ndarray] = None,
    thresholds: Optional[Dict[int, float]] = None,
):
    """Tensor-based sliding-window inference (v2.2).

    Accepts either a single-channel (D, H, W) volume for backward compat, or a
    2-channel (2, D, H, W) stack as produced by ``preprocess_volume_v2``.
    Shallow volumes shorter than the patch depth are zero-padded via replication
    on the tensor, avoiding edge artefacts.

    Args:
        model: Eval-mode UNet3DResidual.
        volume: numpy array — (D,H,W) or (2,D,H,W).
        patch_size: Inference patch size, defaults to PATCH_SIZE.
        stride: Sliding stride, defaults to STRIDE.
        device: Torch device string.
        return_probs: If True, return (mask, avg_probs); else return mask.
        temperature: Softmax temperature (lower = sharper; default 0.5).
        lung_mask: Optional (D,H,W) binary mask to restrict predictions.
        thresholds: Per-class thresholds dict.  Defaults to CLASS_THRESHOLDS.
            Pass an empty dict ``{}`` to fall back to pure argmax.

    Returns:
        uint8 mask (D,H,W) — or (mask, probs) when return_probs=True.
    """
    patch_size = patch_size or PATCH_SIZE
    stride = stride or STRIDE

    # Normalise to (2, D, H, W)
    vol = np.asarray(volume, dtype=np.float32)
    if vol.ndim == 3:
        vol = np.stack([vol, vol], axis=0)  # dummy 2-ch for legacy single-ch weights
    elif vol.ndim != 4 or vol.shape[0] != 2:
        raise ValueError(f"Expected (D,H,W) or (2,D,H,W) volume, got {vol.shape}")

    _, d, h, w = vol.shape
    p_d, p_h, p_w = patch_size

    vol_tensor = torch.from_numpy(vol).unsqueeze(0).to(device)  # (1, 2, D, H, W)

    # Replicate-pad if the volume is shallower than one patch
    pad_d = max(0, p_d - d)
    pad_h = max(0, p_h - h)
    pad_w = max(0, p_w - w)
    if pad_d > 0 or pad_h > 0 or pad_w > 0:
        vol_tensor = F.pad(vol_tensor, (0, pad_w, 0, pad_h, 0, pad_d), mode="replicate")
    _, _, D, H, W = vol_tensor.shape

    accum = torch.zeros((1, 4, D, H, W), device=vol_tensor.device)
    weights = torch.zeros_like(accum)

    sd = max(1, int(p_d * (stride[0] / patch_size[0])))
    sh = max(1, int(p_h * (stride[1] / patch_size[1])))
    sw = max(1, int(p_w * (stride[2] / patch_size[2])))

    zl = sorted(set(list(range(0, max(D - p_d + 1, 1), sd)) + [max(D - p_d, 0)]))
    yl = sorted(set(list(range(0, max(H - p_h + 1, 1), sh)) + [max(H - p_h, 0)]))
    xl = sorted(set(list(range(0, max(W - p_w + 1, 1), sw)) + [max(W - p_w, 0)]))

    model.eval()
    with torch.no_grad():
        for z in tqdm(zl, desc="Volumetric Slabs"):
            for y in yl:
                for x in xl:
                    patch = vol_tensor[:, :, z:z + p_d, y:y + p_h, x:x + p_w]
                    logits = model(patch)
                    probs = F.softmax(logits / temperature, dim=1)
                    accum[:, :, z:z + p_d, y:y + p_h, x:x + p_w] += probs
                    weights[:, :, z:z + p_d, y:y + p_h, x:x + p_w] += 1.0

    avg_probs_t = accum / torch.clamp(weights, min=1.0)
    # Crop back to original (pre-pad) dimensions
    avg_probs_t = avg_probs_t[:, :, :d, :h, :w]
    avg_probs = avg_probs_t[0].cpu().numpy()  # (4, D, H, W)

    if thresholds is None:
        thresholds = _config.CLASS_THRESHOLDS

    if lung_mask is None:
        lung_mask = np.ones((d, h, w), dtype=np.float32)

    if thresholds:
        multiclass_mask = threshold_predict(avg_probs, lung_mask, thresholds).astype(np.uint8)
    else:
        multiclass_mask = np.argmax(avg_probs, axis=0).astype(np.uint8)

    if return_probs:
        return multiclass_mask, avg_probs
    return multiclass_mask

def quantify_ild_volume(prediction_mask, spacing):
    
    # quantify the ild volume in cm³

    voxel_count = np.sum(prediction_mask > 0)
    # Vol in mm³
    voxel_volume_mm3 = np.prod(spacing)
    # Convert to cm³
    return (voxel_count * voxel_volume_mm3) / 1000.0


def build_default_training_loss(
    n_classes: int = 4, device: str = "cuda"
) -> DeepSupervisionLoss:
    # build the training loss
    hybrid = HybridMulticlassLoss(n_classes=n_classes).to(device)
    return DeepSupervisionLoss(hybrid, weights=(1.0, 0.5, 0.25))


def run_training_loop(
    model: torch.nn.Module,
    train_loader: DataLoader,
    val_loader: DataLoader,
    *,
    num_epochs: int = 100,
    learning_rate: float = 3e-4,
    device: str = "cuda",
    n_classes: int = 4,
) -> torch.nn.Module:
   
    optimizer = torch.optim.AdamW(model.parameters(), lr=learning_rate)
    criterion = build_default_training_loss(n_classes=n_classes, device=device)
    model.to(device)

    for epoch in range(num_epochs):
        model.train()
        epoch_loss = 0.0
        for volumes, masks in tqdm(train_loader, desc=f"Epoch {epoch + 1}/{num_epochs}"):
            volumes = volumes.to(device)
            masks = masks.to(device)
            optimizer.zero_grad()
            outputs = model(volumes)  # (out, ds2, ds3) when training
            loss = criterion(outputs, masks)
            loss.backward()
            optimizer.step()
            epoch_loss += float(loss.detach().item())

        model.eval()
        with torch.no_grad():
            for volumes, masks in val_loader:
                volumes = volumes.to(device)
                masks = masks.to(device)
                _ = model(volumes)

    return model


if __name__ == "__main__":
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    
    # Load model from the weights folder
    WEIGHT_PATH = 'weights/best_multiclass_model.pth'
    if os.path.exists(WEIGHT_PATH):
        model = load_trained_model(WEIGHT_PATH, device)
        print("Model loaded successfully.")
        
    else:
        print(f"Weights not found at {WEIGHT_PATH}")