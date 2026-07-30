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


def test_infer_env_knobs():
    """ILD_INFER_MAX_PATCHES / ILD_INFER_CLEANUP_EVERY honor notebook env names."""
    import os

    backend_api_dir = str(PROJECT_ROOT / "backend-api")
    if backend_api_dir not in sys.path:
        sys.path.insert(0, backend_api_dir)

    from services.ai.sliding_window import _env_int, _resolve_max_patches
    from services.ai.constants import _INFER_MAX_PATCHES

    os.environ.pop("ILD_INFER_MAX_PATCHES", None)
    os.environ.pop("ILD_INFER_CLEANUP_EVERY", None)
    assert _env_int("ILD_INFER_CLEANUP_EVERY", 64) == 64
    assert _resolve_max_patches(_INFER_MAX_PATCHES) == _INFER_MAX_PATCHES
    assert _resolve_max_patches(32) == 32  # explicit caller wins

    os.environ["ILD_INFER_MAX_PATCHES"] = "400"
    os.environ["ILD_INFER_CLEANUP_EVERY"] = "16"
    assert _resolve_max_patches(_INFER_MAX_PATCHES) == 400
    assert _env_int("ILD_INFER_CLEANUP_EVERY", 64) == 16

    os.environ["ILD_INFER_MAX_PATCHES"] = "not-an-int"
    assert _resolve_max_patches(_INFER_MAX_PATCHES) == _INFER_MAX_PATCHES

    os.environ.pop("ILD_INFER_MAX_PATCHES", None)
    os.environ.pop("ILD_INFER_CLEANUP_EVERY", None)
    print("  PASSED")


def test_high_recall_operating_point():
    """Lock published dual-threshold OP + dense Softmax defaults (fold0 deploy)."""
    backend_api_dir = str(PROJECT_ROOT / "backend-api")
    if backend_api_dir not in sys.path:
        sys.path.insert(0, backend_api_dir)

    from services.ai.constants import (
        CASCADE_PATH_THRESH,
        CASCADE_PROB_THRESH,
        _CLS_PATCH_SIZE,
        _INFER_DENSE_STRIDE,
        _INFER_MAX_PATCHES,
        _MIN_PATCH_LUNG_FRAC_CLS,
        _VOL_SMOOTH_SIZE,
    )
    from services.ai.sliding_window import patient_cascade_binary
    from services.core.paths import HIERARCHICAL_WEIGHTS, INFER_FOLD

    # Geometry / thresholds match evaluation-metrics.json cascade block
    assert CASCADE_PATH_THRESH == 0.005, CASCADE_PATH_THRESH
    assert CASCADE_PROB_THRESH == 0.45, CASCADE_PROB_THRESH
    assert _CLS_PATCH_SIZE == (16, 64, 64)
    assert _INFER_DENSE_STRIDE == (4, 8, 8)
    assert _INFER_MAX_PATCHES == 8000
    assert _MIN_PATCH_LUNG_FRAC_CLS == 0.20
    assert _VOL_SMOOTH_SIZE == 3

    # Default deploy checkpoint is hierarchical_fold0.pth
    assert INFER_FOLD == 0
    assert HIERARCHICAL_WEIGHTS.name == "hierarchical_fold0.pth"

    # Boundary cases for high-recall OR rule
    assert patient_cascade_binary(0.005, 0.0) == 1
    assert patient_cascade_binary(0.0049, 0.45) == 1
    assert patient_cascade_binary(0.0049, 0.449) == 0
    assert patient_cascade_binary(0.0, 0.0) == 0
    assert patient_cascade_binary(1.0, 1.0) == 1

    # backend-ai config must stay aligned (no stale 2048 cap)
    ai_cfg = _load_ai_module("config.py", "_test_ai_config_op")
    assert ai_cfg.INFER_MAX_PATCHES == 8000
    assert ai_cfg.CASCADE_PATH_THRESH == 0.005
    assert ai_cfg.CASCADE_PROB_THRESH == 0.45

    print("  PASSED")


def test_softmax_cascade_inference():
    """Run softmax_cascade_inference on a synthetic volume."""
    backend_api_dir = str(PROJECT_ROOT / "backend-api")
    if backend_api_dir not in sys.path:
        sys.path.insert(0, backend_api_dir)

    from services.ai.sliding_window import softmax_cascade_inference

    # Prefer hierarchical_fold0.pth (deployed default)
    hier_w = WEIGHTS_DIR / "hierarchical_fold0.pth"
    enc_w = WEIGHTS_DIR / "encoder3d_fold0.pth"
    softmax_w = WEIGHTS_DIR / "softmax3d_fold0.pth"

    if hier_w.exists():
        w_path, sw_path = hier_w, None
        mode = "hierarchical_fold0"
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

    cascade_stats = {}
    mask = softmax_cascade_inference(
        ct_norm,
        lung_mask,
        w_path,
        sw_path,
        device="cpu",
        max_patches=32,
        cascade_stats=cascade_stats,
    )

    assert mask.shape == (d, h, w), f"Output shape: {mask.shape}"
    assert mask.dtype == np.uint8, f"Output dtype: {mask.dtype}"
    unique = np.unique(mask)
    assert all(0 <= v < _NUM_CLASSES for v in unique), f"Unexpected classes: {unique}"
    assert "patient_binary_ild" in cascade_stats
    assert cascade_stats["patient_binary_ild"] in (0, 1)
    assert "pathology_fraction" in cascade_stats
    assert "mean_ild_prob" in cascade_stats
    # Dual-threshold decision must match helper
    from services.ai.sliding_window import patient_cascade_binary

    expected = patient_cascade_binary(
        float(cascade_stats["pathology_fraction"]),
        float(cascade_stats["mean_ild_prob"]),
    )
    assert int(cascade_stats["patient_binary_ild"]) == expected
    counts = dict(zip(*np.unique(mask, return_counts=True)))
    print(f"  [{mode}] shape={mask.shape} dtype={mask.dtype}")
    print(f"  classes: {counts}")
    print(
        f"  cascade: path_frac={cascade_stats['pathology_fraction']:.4f} "
        f"mean_ild={cascade_stats['mean_ild_prob']:.4f} "
        f"patient_bin={cascade_stats['patient_binary_ild']}"
    )
    print("  PASSED")


if __name__ == "__main__":
    tests = [
        ("Hierarchical weight loading", test_hierarchical_weight_loading),
        ("Legacy weight loading", test_legacy_weight_loading),
        ("Gaussian weight computation", test_gaussian_weights),
        ("Infer env knobs (cleanup / max_patches)", test_infer_env_knobs),
        ("High-recall OP (thresholds / fold0 / geometry)", test_high_recall_operating_point),
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
