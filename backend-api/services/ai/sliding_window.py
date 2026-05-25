from __future__ import annotations

import gc
from pathlib import Path
from typing import Dict, Optional, Tuple

import numpy as np
import torch
import torch.nn.functional as F
from tqdm import tqdm

from services.ai import bootstrap
from services.ai.config import DEVICE, logger
from services.ai.torch_io import load_torch_checkpoint

# Default inference hyper-parameters (mirror backend-ai/config.py)
_PATCH_SIZE: Tuple[int, int, int] = (32, 128, 128)
_STRIDE_RATIO: float = 0.5
_TEMPERATURE: float = 0.45
_CLASS_THRESHOLDS: Dict[int, float] = {1: 0.05, 2: 0.07, 3: 0.05}

__all__ = ["sliding_window_inference"]

# ---------------------------------------------------------------------------
# Model loading
# ---------------------------------------------------------------------------


def _is_cuda_runtime_failure(exc: RuntimeError) -> bool:
    """Identify CUDA runtime failures where CPU retry is appropriate."""
    msg = str(exc).lower()
    return "cuda error" in msg or "cublas" in msg or "cudnn" in msg


def _load_model(weights_path: Path, device: str):
    """Load fine-tuned 2-channel UNet3DResidual from checkpoint.

    Strips training-only deep-supervision head keys (ds2.*, ds3.*) and
    falls back to a manual key-remap loader when bootstrap.load_trained_model
    is unavailable.
    """
    if callable(bootstrap.load_trained_model):
        try:
            return bootstrap.load_trained_model(str(weights_path), device)
        except Exception:
            logger.exception(
                "bootstrap.load_trained_model failed; falling back to manual remap loader"
            )

    # Manual fallback: load state dict and remap keys
    model = bootstrap.UNet3DResidual(in_channels=2, num_classes=4)
    state = load_torch_checkpoint(weights_path, map_location=device)
    if isinstance(state, dict) and "state_dict" in state:
        state = state["state_dict"]

    remapped = {}
    for k, v in state.items():
        nk = k.replace("module.", "").replace("final_conv.", "final.")
        # Strip training-only deep-supervision heads
        if nk.startswith("ds2.") or nk.startswith("ds3."):
            continue
        remapped[nk] = v

    model.load_state_dict(remapped, strict=False)
    model.to(device).eval()
    return model


# ---------------------------------------------------------------------------
# Sliding-window inference
# ---------------------------------------------------------------------------


def sliding_window_inference(
    processed_stack: np.ndarray,
    weights_path: Path,
    *,
    device: str = DEVICE,
    patch_size: Tuple[int, int, int] = _PATCH_SIZE,
    stride_ratio: float = _STRIDE_RATIO,
    temperature: float = _TEMPERATURE,
    lung_mask: Optional[np.ndarray] = None,
    thresholds: Optional[Dict[int, float]] = None,
) -> np.ndarray:
    """Run v2.2 sliding-window inference on a preprocessed 2-channel volume.

    Args:
        processed_stack: float32 array of shape (2, D, H, W) as returned by
            ``preprocess_volume``.
        weights_path: Path to the fine-tuned ``.pth`` checkpoint.
        device: Torch device string.
        patch_size: (p_d, p_h, p_w) inference patch dimensions.
        stride_ratio: Fraction of patch size used as stride.
        temperature: Softmax temperature (lower = sharper distributions).
        lung_mask: Optional binary (D, H, W) mask; non-lung voxels are zeroed.
        thresholds: Per-class probability thresholds.  Defaults to
            ``_CLASS_THRESHOLDS``.  Pass ``{}`` to use plain argmax.

    Returns:
        uint8 segmentation mask of shape (D, H, W).
    """
    if not weights_path.exists():
        raise FileNotFoundError(f"Missing weights: {weights_path}")

    if thresholds is None:
        thresholds = _CLASS_THRESHOLDS

    stack = np.asarray(processed_stack, dtype=np.float32)
    if stack.ndim != 4 or stack.shape[0] != 2:
        raise ValueError(
            f"Expected (2,D,H,W) processed_stack, got {stack.shape}"
        )

    _, orig_d, orig_h, orig_w = stack.shape
    p_d, p_h, p_w = patch_size

    def _run_on_device(run_device: str) -> np.ndarray:
        model = _load_model(weights_path, run_device)
        model.eval()

        vol_tensor = torch.from_numpy(stack).unsqueeze(0).to(run_device)  # (1,2,D,H,W)

        # Replication-pad shallow volumes to fit at least one patch
        pad_d = max(0, p_d - orig_d)
        pad_h = max(0, p_h - orig_h)
        pad_w = max(0, p_w - orig_w)
        if pad_d > 0 or pad_h > 0 or pad_w > 0:
            logger.info(
                "Shallow volume (%d slices); applying replication padding to fit patch (%d,%d,%d)",
                orig_d,
                p_d,
                p_h,
                p_w,
            )
            vol_tensor = F.pad(
                vol_tensor, (0, pad_w, 0, pad_h, 0, pad_d), mode="replicate"
            )

        _, _, D, H, W = vol_tensor.shape
        accum = torch.zeros((1, 4, D, H, W), device=vol_tensor.device)
        weight_map = torch.zeros_like(accum)

        sd = max(1, int(p_d * stride_ratio))
        sh = max(1, int(p_h * stride_ratio))
        sw = max(1, int(p_w * stride_ratio))

        zl = sorted(set(list(range(0, max(D - p_d + 1, 1), sd)) + [max(D - p_d, 0)]))
        yl = sorted(set(list(range(0, max(H - p_h + 1, 1), sh)) + [max(H - p_h, 0)]))
        xl = sorted(set(list(range(0, max(W - p_w + 1, 1), sw)) + [max(W - p_w, 0)]))

        with torch.no_grad():
            for z in tqdm(zl, desc="Volumetric Slabs", leave=False):
                for y in yl:
                    for x in xl:
                        patch = vol_tensor[:, :, z:z + p_d, y:y + p_h, x:x + p_w]
                        logits = model(patch)
                        probs = F.softmax(logits / temperature, dim=1)
                        accum[:, :, z:z + p_d, y:y + p_h, x:x + p_w] += probs
                        weight_map[:, :, z:z + p_d, y:y + p_h, x:x + p_w] += 1.0

        avg_probs_t = accum / torch.clamp(weight_map, min=1.0)
        out = avg_probs_t[0, :, :orig_d, :orig_h, :orig_w].cpu().numpy()  # (4,D,H,W)
        del model, vol_tensor, accum, weight_map, avg_probs_t
        gc.collect()
        return out

    try:
        avg_probs = _run_on_device(device)
    except RuntimeError as exc:
        if device.startswith("cuda") and _is_cuda_runtime_failure(exc):
            logger.exception(
                "CUDA inference failed; retrying on CPU for this request"
            )
            try:
                torch.cuda.empty_cache()
            except Exception:
                pass
            avg_probs = _run_on_device("cpu")
        else:
            raise

    # Build lung mask fallback
    if lung_mask is None:
        lung_mask = np.ones((orig_d, orig_h, orig_w), dtype=np.float32)

    if thresholds:
        if callable(bootstrap.threshold_predict):
            mask = bootstrap.threshold_predict(avg_probs, lung_mask, thresholds)
        else:
            # Inline fallback
            pred = np.zeros((orig_d, orig_h, orig_w), dtype=np.int32)
            best = np.zeros((orig_d, orig_h, orig_w), dtype=np.float32)
            for c, thr in thresholds.items():
                p_c = avg_probs[c]
                fires = p_c > thr
                wins = fires & (p_c > best)
                pred[wins] = c
                best[wins] = p_c[wins]
            pred[lung_mask < 0.5] = 0
            mask = pred
    else:
        mask = np.argmax(avg_probs, axis=0).astype(np.int32)
        mask[lung_mask < 0.5] = 0

    return mask.astype(np.uint8)
