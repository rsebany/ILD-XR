#!/usr/bin/env python3
"""Generate pathology failure figure: Softmax prediction vs expert ROI GT."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np

_SCRIPTS_ROOT = Path(__file__).resolve().parents[1]
if str(_SCRIPTS_ROOT) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_ROOT))

from common.bootstrap import ensure_backend_api_on_path
from common.paths import (
    DEFAULT_ENCODER_WEIGHTS_PATH,
    DEFAULT_MED3D_WEIGHTS_PATH,
    DEFAULT_SOFTMAX_WEIGHTS_PATH,
    DEFAULT_WEIGHTS_PATH,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate fig9 pathology failure figure (Softmax vs expert ROI GT)."
    )
    parser.add_argument(
        "--ct-dir",
        type=Path,
        required=True,
        help="CT DICOM directory.",
    )
    parser.add_argument(
        "--roi-dir",
        type=Path,
        default=None,
        help="Expert ROI DICOM directory (default: sibling roi_mask next to --ct-dir).",
    )
    parser.add_argument(
        "--output",
        type=Path,
        required=True,
        help="Output PNG path.",
    )
    parser.add_argument(
        "--patient-id",
        default=None,
        help="Optional label for logs only.",
    )
    parser.add_argument("--weights", type=Path, default=None)
    parser.add_argument(
        "--slices",
        type=int,
        nargs=2,
        default=None,
        help="Optional fixed z-indices (two slices). Default: auto top-2 disagreement.",
    )
    return parser.parse_args()


def _window_ct(hu_slice: np.ndarray, lo: float = -1000.0, hi: float = 400.0) -> np.ndarray:
    clipped = np.clip(hu_slice.astype(np.float32), lo, hi)
    return (clipped - lo) / (hi - lo)


def _slice_disagreement(
    expert: np.ndarray,
    prediction: np.ndarray,
    lung_mask: np.ndarray,
) -> np.ndarray:
    """Per-slice FN+FP voxel counts inside lung mask."""
    lung = lung_mask > 0
    gt_fg = expert > 0
    pred_fg = prediction > 0
    fn = gt_fg & ~pred_fg & lung
    fp = ~gt_fg & pred_fg & lung
    return (fn | fp).sum(axis=(1, 2)).astype(np.int64)


def _pick_slices(
    disagree: np.ndarray,
    expert: np.ndarray,
    fixed: list[int] | None,
) -> list[int]:
    if fixed is not None:
        return fixed
    # Sparse ROI: only rank slices that carry expert pathology annotations.
    annotated = np.array([np.any(expert[z] > 0) for z in range(expert.shape[0])])
    order = np.argsort(-disagree)
    top = [int(i) for i in order if annotated[i] and disagree[i] > 0][:2]
    if len(top) < 2:
        raise SystemExit(
            f"[FAIL] Fewer than 2 annotated slices with lung-scoped disagreement: {top}"
        )
    return top


def _render_panel(
    ct_hu: np.ndarray,
    expert: np.ndarray,
    prediction: np.ndarray,
    lung_mask: np.ndarray,
    slice_indices: list[int],
    output: Path,
) -> None:
    lung = lung_mask > 0
    gt_fg = expert > 0
    pred_fg = prediction > 0

    fig, axes = plt.subplots(2, 2, figsize=(8, 8))
    fig.subplots_adjust(wspace=0.05, hspace=0.25)

    for col, z in enumerate(slice_indices):
        ct_rgb = np.stack([_window_ct(ct_hu[z])] * 3, axis=-1)
        gt_mask = gt_fg[z]
        disagree = int(
            np.count_nonzero(
                ((gt_fg[z] & ~pred_fg[z]) | (~gt_fg[z] & pred_fg[z])) & lung[z]
            )
        )

        ax_gt = axes[0, col]
        ax_gt.imshow(ct_rgb, origin="upper")
        overlay = np.zeros((*gt_mask.shape, 4), dtype=np.float32)
        overlay[gt_mask, 0] = 0.6
        overlay[gt_mask, 1] = 0.0
        overlay[gt_mask, 2] = 0.8
        overlay[gt_mask, 3] = 0.45
        ax_gt.imshow(overlay, origin="upper")
        ax_gt.set_title(f"z={z} GT (disagree={disagree})")
        ax_gt.axis("off")

        fn = gt_fg[z] & ~pred_fg[z] & lung[z]
        fp = ~gt_fg[z] & pred_fg[z] & lung[z]
        tp = gt_fg[z] & pred_fg[z] & lung[z]

        err_rgb = np.zeros((*gt_mask.shape, 3), dtype=np.float32)
        err_rgb[tp] = (0.5, 0.5, 0.5)
        err_rgb[fn] = (1.0, 0.0, 0.0)
        err_rgb[fp] = (0.0, 0.0, 1.0)

        ax_err = axes[1, col]
        ax_err.imshow(err_rgb, origin="upper")
        ax_err.set_title(f"z={z} Errors (R=FN B=FP)")
        ax_err.axis("off")

    output.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(output, dpi=150, bbox_inches="tight", facecolor="white")
    plt.close(fig)
    print(f"[INFO] Saved figure: {output}")


def main() -> int:
    args = parse_args()
    ensure_backend_api_on_path()

    from services.ai.inference import process_dicom_zip_dir
    from services.dicom.expert_volume_align import (
        auto_correct_inplane_flip,
        stack_expert_volume_on_ct_grid,
    )
    from services.dicom.series_read import read_sorted_dicom_slices

    ct_dir = args.ct_dir.resolve()
    roi_dir = (args.roi_dir or (ct_dir.parent / "roi_mask")).resolve()
    output = args.output.resolve()
    weights_path = (
        args.weights.resolve() if args.weights else DEFAULT_WEIGHTS_PATH
    )

    if not ct_dir.is_dir():
        raise SystemExit(f"[FAIL] CT dir not found: {ct_dir}")
    if not roi_dir.is_dir():
        raise SystemExit(f"[FAIL] ROI dir not found: {roi_dir}")
    if not weights_path.is_file():
        raise SystemExit(f"[FAIL] Weights not found: {weights_path}")

    if args.patient_id:
        print(f"[INFO] Patient:  {args.patient_id}")
    print(f"[INFO] CT dir:   {ct_dir}")
    print(f"[INFO] ROI dir:  {roi_dir}")
    print(f"[INFO] Output:   {output}")

    mask, spacing, volume_hu, lung_mask = process_dicom_zip_dir(
        ct_dir,
        weights_path,
        encoder_weights=DEFAULT_ENCODER_WEIGHTS_PATH,
        softmax_weights=DEFAULT_SOFTMAX_WEIGHTS_PATH,
        med3d_weights=DEFAULT_MED3D_WEIGHTS_PATH,
    )
    print(f"[INFO] Prediction shape: {mask.shape}, spacing: {spacing}")
    print(
        f"[INFO] Pred foreground voxels: {int((mask > 0).sum())}, "
        f"lung voxels: {int((lung_mask > 0).sum())}"
    )

    ct_slices = read_sorted_dicom_slices(ct_dir, include_dicom_ext=True)
    roi_slices = read_sorted_dicom_slices(roi_dir, include_dicom_ext=True)
    expert, align_meta = stack_expert_volume_on_ct_grid(roi_slices, ct_slices)
    print(
        f"[INFO] Expert stack: matched={align_meta.get('expert_slices_matched')}, "
        f"unmatched={align_meta.get('expert_slices_unmatched')}, "
        f"fg voxels={int((expert > 0).sum())}"
    )

    if expert.shape != mask.shape:
        raise SystemExit(
            f"[FAIL] Shape mismatch expert {expert.shape} vs prediction {mask.shape}"
        )

    expert, flip_mode, flip_gain = auto_correct_inplane_flip(expert, mask)
    if flip_mode != "none":
        print(f"[INFO] Applied in-plane flip: {flip_mode} (gain={flip_gain} voxels)")

    disagree = _slice_disagreement(expert, mask, lung_mask)
    slice_indices = _pick_slices(
        disagree, expert, list(args.slices) if args.slices else None
    )
    print(f"[INFO] Selected slices: {slice_indices}")
    for z in slice_indices:
        print(f"       z={z}: disagree={int(disagree[z])}")

    _render_panel(volume_hu, expert, mask, lung_mask, slice_indices, output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
