#!/usr/bin/env python3
"""Run backend inference regression checks on one DICOM series."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np

_SCRIPTS_ROOT = Path(__file__).resolve().parents[1]
if str(_SCRIPTS_ROOT) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_ROOT))

from common.bootstrap import ensure_backend_api_on_path
from common.paths import DEFAULT_WEIGHTS_PATH


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run backend inference regression checks on one DICOM series."
    )
    parser.add_argument(
        "--dicom-dir",
        required=False,
        help="Path to a folder containing one DICOM series (.dcm/.dicom files).",
    )
    parser.add_argument(
        "--weights",
        default=None,
        help=f"Optional weights path (default: {DEFAULT_WEIGHTS_PATH}).",
    )
    parser.add_argument(
        "--min-volume-ml",
        type=float,
        default=0.0,
        help="Minimum accepted ILD volume in ml (default: 0.0).",
    )
    parser.add_argument(
        "--max-volume-ml",
        type=float,
        default=5000.0,
        help="Maximum accepted ILD volume in ml (default: 5000.0).",
    )
    parser.add_argument(
        "--allow-empty-mask",
        action="store_true",
        help="Do not fail when predicted mask is empty.",
    )
    parser.add_argument(
        "--check-native-remap",
        action="store_true",
        help="Run synthetic regression for remap path (48,408,408)->(48,512,512).",
    )
    parser.add_argument(
        "--remap-only",
        action="store_true",
        help="Run only the synthetic remap regression and skip full model inference.",
    )
    return parser.parse_args()


def run_native_remap_regression() -> None:
    from services.ai.inference import _resample_mask_to_shape  # noqa: E402

    src_shape = (48, 408, 408)
    tgt_shape = (48, 512, 512)

    synthetic_mask = np.zeros(src_shape, dtype=np.uint8)
    synthetic_mask[:, 150:258, 150:258] = 1
    synthetic_mask[10:30, 180:230, 180:230] = 2
    synthetic_mask[22:40, 210:250, 210:250] = 3

    remapped = _resample_mask_to_shape(synthetic_mask, tgt_shape, binary=False)
    labels = set(np.unique(remapped).tolist())

    if remapped.shape != tgt_shape:
        raise SystemExit(
            f"[FAIL] Remapped mask has unexpected shape {remapped.shape}, expected {tgt_shape}"
        )
    if remapped.dtype != np.uint8:
        raise SystemExit(f"[FAIL] Remapped mask has unexpected dtype {remapped.dtype}")
    if not labels.issubset({0, 1, 2, 3}):
        raise SystemExit(f"[FAIL] Remapped mask has unexpected labels: {sorted(labels)}")
    if int((remapped > 0).sum()) <= 0:
        raise SystemExit("[FAIL] Remapped mask is unexpectedly empty.")

    print(
        "[PASS] Native remap regression passed: "
        f"{src_shape} -> {tgt_shape}, labels={sorted(labels)}"
    )


def main() -> int:
    args = parse_args()
    ensure_backend_api_on_path()

    from services.ai.inference import (  # noqa: E402
        compute_class_metrics,
        compute_ild_volume_ml,
        process_dicom_zip_dir,
    )

    if args.check_native_remap:
        run_native_remap_regression()
        if args.remap_only:
            return 0

    if not args.dicom_dir:
        raise SystemExit(
            "[FAIL] --dicom-dir is required unless --check-native-remap --remap-only is used."
        )

    dicom_dir = Path(args.dicom_dir).resolve()
    if not dicom_dir.is_dir():
        raise SystemExit(f"[FAIL] Invalid --dicom-dir: {dicom_dir}")

    weights_path = Path(args.weights).resolve() if args.weights else DEFAULT_WEIGHTS_PATH
    if not weights_path.is_file():
        raise SystemExit(f"[FAIL] Weights not found: {weights_path}")

    print(f"[INFO] DICOM dir: {dicom_dir}")
    print(f"[INFO] Weights:   {weights_path}")

    mask, spacing, _volume_hu, lung_mask = process_dicom_zip_dir(dicom_dir, weights_path)
    volume_ml = compute_ild_volume_ml(mask, spacing)
    class_metrics = compute_class_metrics(mask, spacing, lung_mask=lung_mask)
    nonzero_voxels = int((mask > 0).sum())

    print(f"[INFO] Mask shape: {tuple(mask.shape)}")
    print(f"[INFO] Spacing:    {spacing}")
    print(f"[INFO] Voxels>0:   {nonzero_voxels}")
    print(f"[INFO] Volume ml:  {volume_ml:.4f}")
    print(f"[INFO] Lung ml:    {class_metrics['lung_volume_ml']:.4f}")
    print(
        "[INFO] Per-class:  "
        f"GGO={class_metrics['ggo_volume_ml']:.4f} ml "
        f"({class_metrics['ggo_burden'] * 100:.2f}%), "
        f"Reticulation={class_metrics['reticulation_volume_ml']:.4f} ml "
        f"({class_metrics['reticulation_burden'] * 100:.2f}%), "
        f"Consolidation={class_metrics['consolidation_volume_ml']:.4f} ml "
        f"({class_metrics['consolidation_burden'] * 100:.2f}%)"
    )

    if len(spacing) != 3:
        raise SystemExit(f"[FAIL] Invalid spacing tuple: {spacing}")
    if any(s <= 0 for s in spacing):
        raise SystemExit(f"[FAIL] Non-positive spacing values: {spacing}")

    if not args.allow_empty_mask and nonzero_voxels == 0:
        raise SystemExit("[FAIL] Predicted mask is empty.")

    if not (args.min_volume_ml <= volume_ml <= args.max_volume_ml):
        raise SystemExit(
            f"[FAIL] Volume {volume_ml:.4f} ml outside expected range "
            f"[{args.min_volume_ml}, {args.max_volume_ml}]"
        )

    print("[PASS] Inference regression checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
