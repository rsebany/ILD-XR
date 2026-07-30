"""Test sliding-window inference for both legacy and hierarchical models.

Validates:
1. Legacy: Med3D encoder + Softmax weight loading
2. Hierarchical: HierarchicalEncoder3D weight loading
3. Gaussian weight computation
4. End-to-end softmax cascade inference on synthetic volume
5. Feature dimension (512-dim) and output shapes
"""
from __future__ import annotations

import sys
import numpy as np
import torch
from pathlib import Path

# --- Constants matching notebook ---
_CLS_PATCH_SIZE = (16, 64, 64)
_NUM_CLASSES = 6

PROJECT_ROOT = Path(__file__).resolve().parents[3]  # ILD-XR-main
WEIGHTS_DIR = PROJECT_ROOT / "backend-api" / "weights"
BACKEND_AI = PROJECT_ROOT / "backend-ai"


def _load_ai_module(rel_path, module_name):
    """Load a module from backend-ai."""
    import importlib.util
    path = BACKEND_AI / rel_path
    spec = importlib.util.spec_from_file_location(module_name, path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = mod
    spec.loader.exec_module(mod)
    return mod


def test_hierarchical_weight_loading():
    """Verify HierarchicalEncoder3D loads from a single checkpoint."""
    med3d = _load_ai_module("models/med3d_encoder.py", "_test_hier")
    HierarchicalEncoder3D = med3d.HierarchicalEncoder3D
    load_hierarchical_checkpoint = med3d.load_hierarchical_checkpoint

    hier_path = WEIGHTS_DIR / "hierarchical_fold0.pth"
    if not hier_path.exists():
        print("  SKIP: hierarchical_fold0.pth not in backend-api/weights")
        return

    model = HierarchicalEncoder3D()
    load_hierarchical_checkpoint(model, hier_path)
    model.eval()

    x = torch.randn(1, 1, *_CLS_PATCH_SIZE)
    with torch.no_grad():
        feat = model.extract_features(x)
        bin_logits = model(x, head="binary")
        hier_logits = model(x, head="hier")
        path_logits = model(x, head="path")

    assert feat.shape == (1, 512), f"Unexpected feature shape: {feat.shape}"
    assert bin_logits.shape == (1, 2), f"Binary head shape: {bin_logits.shape}"
    assert hier_logits.shape == (1, 3), f"Hier head shape: {hier_logits.shape}"
    assert path_logits.shape == (1, 5), f"Path head shape: {path_logits.shape}"
    print(f"  Hierarchical fold0: OK feat={tuple(feat.shape)} "
          f"bin={tuple(bin_logits.shape)} hier={tuple(hier_logits.shape)} path={tuple(path_logits.shape)}")
    print("  PASSED")


def test_legacy_weight_loading():
    """Verify paper-aligned encoder and softmax checkpoints load."""
    med3d = _load_ai_module("models/med3d_encoder.py", "_test_med3d")
    Med3DPathologyEncoder3D = med3d.Med3DPathologyEncoder3D
    build_softmax_head = med3d.build_softmax_head
    load_encoder_from_checkpoint = med3d.load_encoder_from_checkpoint
    load_softmax_head_from_checkpoint = med3d.load_softmax_head_from_checkpoint

    enc_path = WEIGHTS_DIR / "encoder3d_fold0.pth"
    softmax_path = WEIGHTS_DIR / "softmax3d_fold0.pth"
    if not enc_path.exists() or not softmax_path.exists():
        print("  SKIP: fold0 encoder/softmax weights not in backend-api/weights")
        return

    encoder = Med3DPathologyEncoder3D()
    load_encoder_from_checkpoint(encoder, enc_path)
    head = build_softmax_head()
    load_softmax_head_from_checkpoint(head, softmax_path, encoder_ckpt=enc_path)

    x = torch.randn(1, 1, *_CLS_PATCH_SIZE)
    with torch.no_grad():
        feat = encoder(x)
        logits = head(feat)
    assert feat.shape == (1, 512), f"Unexpected feature shape: {feat.shape}"
    assert logits.shape == (1, _NUM_CLASSES), f"Unexpected logits shape: {logits.shape}"
    print(f"  Legacy fold0: OK feat={tuple(feat.shape)} logits={tuple(logits.shape)}")
    print("  PASSED")


def test_gaussian_weights():
    """Verify Gaussian weights match notebook formula."""
    ps = _CLS_PATCH_SIZE
    sigma = tuple(float(p) / 4.0 for p in ps)
    pd, ph, pw = ps
    sz, sy, sx = sigma
    zz = np.arange(pd) - (pd - 1) / 2.0
    yy = np.arange(ph) - (ph - 1) / 2.0
    xx = np.arange(pw) - (pw - 1) / 2.0
    Z, Y, X = np.meshgrid(zz, yy, xx, indexing="ij")
    gw = np.exp(-0.5 * ((Z / sz) ** 2 + (Y / sy) ** 2 + (X / sx) ** 2))
    gw = gw.astype(np.float32)
    gw /= gw.max() + 1e-8

    assert gw.shape == ps, f"Shape mismatch: {gw.shape} != {ps}"
    assert gw.min() >= 0.0
    assert gw.max() <= 1.0 + 1e-6
    assert abs(gw.max() - 1.0) < 1e-5
    center = gw[ps[0] // 2, ps[1] // 2, ps[2] // 2]
    corner = gw[0, 0, 0]
    assert center > corner
    print(f"  cls: shape={ps} center={center:.4f} corner={corner:.4f}")
    print("  PASSED")


def test_softmax_cascade_inference():
    """Run softmax_cascade_inference on a synthetic volume."""
    backend_api_dir = str(PROJECT_ROOT / "backend-api")
    if backend_api_dir not in sys.path:
        sys.path.insert(0, backend_api_dir)

    from services.ai.sliding_window import softmax_cascade_inference

    # Prefer hierarchical checkpoint
    hier_w = WEIGHTS_DIR / "hierarchical_fold0.pth"
    enc_w = WEIGHTS_DIR / "encoder3d_fold0.pth"
    softmax_w = WEIGHTS_DIR / "softmax3d_fold0.pth"

    if hier_w.exists():
        w_path, sw_path = hier_w, None
        mode = "hierarchical"
    elif enc_w.exists() and softmax_w.exists():
        w_path, sw_path = enc_w, softmax_w
        mode = "legacy"
    else:
        print("  SKIP: no model weights found")
        return

    np.random.seed(42)
    d, h, w = 24, 96, 96
    ct_norm = np.random.rand(d, h, w).astype(np.float32) * 0.3
    lung_mask = np.zeros((d, h, w), dtype=np.uint8)
    lung_mask[:, 20:76, 20:76] = 1

    mask = softmax_cascade_inference(
        ct_norm,
        lung_mask,
        w_path,
        sw_path,
        device="cpu",
        max_patches=32,
    )

    assert mask.shape == (d, h, w), f"Output shape: {mask.shape}"
    assert mask.dtype == np.uint8, f"Output dtype: {mask.dtype}"
    unique = np.unique(mask)
    assert all(0 <= v < _NUM_CLASSES for v in unique), f"Unexpected classes: {unique}"
    counts = dict(zip(*np.unique(mask, return_counts=True)))
    print(f"  [{mode}] shape={mask.shape} dtype={mask.dtype}")
    print(f"  classes: {counts}")
    print("  PASSED")


if __name__ == "__main__":
    tests = [
        ("Hierarchical weight loading", test_hierarchical_weight_loading),
        ("Legacy weight loading", test_legacy_weight_loading),
        ("Gaussian weight computation", test_gaussian_weights),
        ("Softmax cascade inference (CPU)", test_softmax_cascade_inference),
    ]

    results = []
    for name, fn in tests:
        print()
        print("=" * 60)
        print(f"  {name}")
        print("=" * 60)
        try:
            fn()
            results.append((name, "PASSED"))
        except Exception as e:
            print(f"  FAILED: {e}")
            import traceback
            traceback.print_exc()
            results.append((name, f"FAILED: {e}"))

    print()
    print("=" * 60)
    print("  SUMMARY")
    print("=" * 60)
    for name, status in results:
        print(f"  {status:>8s}  {name}")
    print("=" * 60)
