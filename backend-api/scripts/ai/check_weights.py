#!/usr/bin/env python3
"""Sanity-check hierarchical checkpoint loading and forward passes."""
from __future__ import annotations

import sys
from pathlib import Path

import torch

_SCRIPTS_ROOT = Path(__file__).resolve().parents[1]
if str(_SCRIPTS_ROOT) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_ROOT))

from common.bootstrap import ensure_backend_ai_on_path
from common.paths import (
    BACKEND_AI_DIR,
    DEFAULT_HIERARCHICAL_WEIGHTS_PATH,
    DEFAULT_ENCODER_WEIGHTS_PATH,
    DEFAULT_SOFTMAX_WEIGHTS_PATH,
)


def main() -> int:
    if not BACKEND_AI_DIR.is_dir():
        print(f"[ERROR] backend-ai directory not found at {BACKEND_AI_DIR}")
        return 1

    ensure_backend_ai_on_path()

    # Prefer hierarchical checkpoint, fall back to legacy
    use_hier = DEFAULT_HIERARCHICAL_WEIGHTS_PATH.exists()
    if use_hier:
        print(f"[INFO] Hierarchical checkpoint found: {DEFAULT_HIERARCHICAL_WEIGHTS_PATH}")
    else:
        errors = 0
        for label, path in [
            ("Med3D init", BACKEND_AI_DIR.parent / "backend-api" / "weights" / "resnet_18.pth"),
            ("Med3D encoder", DEFAULT_ENCODER_WEIGHTS_PATH),
            ("Softmax head", DEFAULT_SOFTMAX_WEIGHTS_PATH),
        ]:
            if not path.is_file():
                print(f"[ERROR] {label} weights not found at {path}")
                errors += 1
        if errors:
            print("[WARN] No hierarchical or legacy weights found; using random init for test.")
            use_hier = False

    try:
        if use_hier:
            from models.med3d_encoder import HierarchicalEncoder3D
            model = HierarchicalEncoder3D()
            model.load_hierarchical_checkpoint(DEFAULT_HIERARCHICAL_WEIGHTS_PATH)
            model.eval()
            x = torch.randn(1, 1, 16, 64, 64)
            with torch.no_grad():
                feat = model.extract_features(x)
                bin_logits = model(x, head="binary")
                hier_logits = model(x, head="hier")
                path_logits = model(x, head="path")
            print(f"[INFO] Hierarchical forward OK:")
            print(f"  Features: {tuple(feat.shape)}")
            print(f"  Binary head: {tuple(bin_logits.shape)}")
            print(f"  Hier head: {tuple(hier_logits.shape)}")
            print(f"  Path head: {tuple(path_logits.shape)}")
            assert feat.shape[-1] == 512, f"Expected 512-dim features, got {feat.shape}"
            assert bin_logits.shape[-1] == 2, f"Binary head should be 2-class"
            assert hier_logits.shape[-1] == 3, f"Hier head should be 3-class"
            assert path_logits.shape[-1] == 5, f"Path head should be 5-class"
            print("[INFO] All checks passed (hierarchical).")
        else:
            from models.med3d_encoder import (
                Med3DPathologyEncoder3D,
                build_softmax_head,
                load_encoder_from_checkpoint,
                load_softmax_head_from_checkpoint,
            )
            print(f"[INFO] Loading Med3D encoder from {DEFAULT_ENCODER_WEIGHTS_PATH}")
            encoder = Med3DPathologyEncoder3D()
            load_encoder_from_checkpoint(encoder, DEFAULT_ENCODER_WEIGHTS_PATH)
            encoder.eval()
            x = torch.randn(1, 1, 16, 64, 64)
            with torch.no_grad():
                y_enc = encoder(x)
            print(f"[INFO] Encoder forward OK. Features: {tuple(y_enc.shape)}")
            assert y_enc.shape[-1] == 512, f"Expected 512-dim features, got {y_enc.shape}"

            print(f"\n[INFO] Loading Softmax head from {DEFAULT_SOFTMAX_WEIGHTS_PATH}")
            head = build_softmax_head()
            load_softmax_head_from_checkpoint(
                head,
                DEFAULT_SOFTMAX_WEIGHTS_PATH,
                encoder_ckpt=DEFAULT_ENCODER_WEIGHTS_PATH,
            )
            head.eval()
            with torch.no_grad():
                logits = head(y_enc)
            print(f"[INFO] Softmax head forward OK. Logits: {tuple(logits.shape)}")
            print("\n[INFO] All checks passed (legacy).")
    except Exception as exc:
        print(f"[ERROR] Failed: {exc}")
        import traceback
        traceback.print_exc()
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
