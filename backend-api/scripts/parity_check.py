from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Dict, Optional, Tuple

import numpy as np
from scipy.ndimage import zoom


def _bootstrap_backend_imports() -> None:
    """Ensure script can import backend-api modules when run directly."""
    project_root = Path(__file__).resolve().parents[2]
    backend_api_dir = project_root / "backend-api"
    if str(backend_api_dir) not in sys.path:
        sys.path.insert(0, str(backend_api_dir))


def _load_reference_mask(path: Path) -> np.ndarray:
    if not path.exists():
        raise FileNotFoundError(f"Reference mask not found: {path}")

    if path.suffix.lower() == ".npy":
        arr = np.load(path)
    elif path.suffix.lower() == ".npz":
        data = np.load(path)
        if "mask" in data:
            arr = data["mask"]
        elif len(data.files) == 1:
            arr = data[data.files[0]]
        else:
            raise ValueError(
                "NPZ reference has multiple arrays. Provide a key named 'mask'."
            )
    else:
        raise ValueError("Reference mask must be .npy or .npz")

    arr = np.asarray(arr)
    if arr.ndim != 3:
        raise ValueError(f"Reference mask must be 3D, got shape={arr.shape}")
    return np.rint(arr).clip(0, 255).astype(np.uint8)


def _resample_mask_to_shape(mask: np.ndarray, target_shape: Tuple[int, int, int]) -> np.ndarray:
    if mask.shape == target_shape:
        return mask.astype(np.uint8, copy=False)
    factors = tuple(float(t) / float(s) for t, s in zip(target_shape, mask.shape))
    out = zoom(mask.astype(np.float32), factors, order=0, prefilter=False)
    return np.rint(out).clip(0, 255).astype(np.uint8)


def _dice_for_class(pred: np.ndarray, ref: np.ndarray, class_id: int) -> float:
    p = pred == class_id
    r = ref == class_id
    inter = int(np.count_nonzero(p & r))
    denom = int(np.count_nonzero(p) + np.count_nonzero(r))
    if denom == 0:
        return 1.0
    return float((2.0 * inter) / denom)


def _summary(pred: np.ndarray, ref: np.ndarray) -> Dict[str, object]:
    classes = (0, 1, 2, 3)
    per_class: Dict[str, Dict[str, float]] = {}
    for c in classes:
        pred_vox = int(np.count_nonzero(pred == c))
        ref_vox = int(np.count_nonzero(ref == c))
        per_class[str(c)] = {
            "pred_voxels": pred_vox,
            "ref_voxels": ref_vox,
            "voxel_delta": pred_vox - ref_vox,
            "dice": round(_dice_for_class(pred, ref, c), 6),
        }

    lesion_pred = pred > 0
    lesion_ref = ref > 0
    lesion_inter = int(np.count_nonzero(lesion_pred & lesion_ref))
    lesion_denom = int(np.count_nonzero(lesion_pred) + np.count_nonzero(lesion_ref))
    lesion_dice = 1.0 if lesion_denom == 0 else (2.0 * lesion_inter) / lesion_denom

    return {
        "shape_pred": tuple(int(v) for v in pred.shape),
        "shape_ref": tuple(int(v) for v in ref.shape),
        "per_class": per_class,
        "lesion_dice": round(float(lesion_dice), 6),
    }


def _parse_class_dice_thresholds(spec: str) -> Dict[int, float]:
    """
    Parse '1:0.80,2:0.75,3:0.75' -> {1: 0.8, 2: 0.75, 3: 0.75}.
    """
    out: Dict[int, float] = {}
    if not spec.strip():
        return out
    for token in spec.split(","):
        token = token.strip()
        if not token:
            continue
        if ":" not in token:
            raise ValueError(f"Invalid --min-class-dice entry '{token}', expected class:threshold")
        cls_txt, thr_txt = token.split(":", 1)
        cls = int(cls_txt.strip())
        thr = float(thr_txt.strip())
        if cls < 0:
            raise ValueError(f"Class id must be >= 0, got {cls}")
        if not (0.0 <= thr <= 1.0):
            raise ValueError(f"Threshold must be in [0,1], got {thr}")
        out[cls] = thr
    return out


def _evaluate_thresholds(
    report: Dict[str, object],
    *,
    min_lesion_dice: Optional[float],
    min_class_dice: Dict[int, float],
) -> Tuple[bool, list[str]]:
    failures: list[str] = []
    lesion = float(report["lesion_dice"])
    if min_lesion_dice is not None and lesion < min_lesion_dice:
        failures.append(
            f"lesion_dice={lesion:.6f} is below required minimum {min_lesion_dice:.6f}"
        )

    per_class = report["per_class"]
    assert isinstance(per_class, dict)
    for class_id, threshold in min_class_dice.items():
        key = str(class_id)
        if key not in per_class:
            failures.append(f"class {class_id} is missing in report")
            continue
        class_row = per_class[key]
        assert isinstance(class_row, dict)
        dice = float(class_row["dice"])
        if dice < threshold:
            failures.append(
                f"class {class_id} dice={dice:.6f} is below required minimum {threshold:.6f}"
            )
    return (len(failures) == 0), failures


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Parity check: backend inference mask vs notebook reference mask."
    )
    parser.add_argument("--dicom-dir", required=True, help="Directory containing DICOM slices.")
    parser.add_argument("--weights", required=True, help="Path to .pth model weights.")
    parser.add_argument(
        "--reference-mask",
        required=True,
        help="Path to notebook reference mask (.npy or .npz).",
    )
    parser.add_argument(
        "--out-json",
        default="",
        help="Optional output file for JSON report.",
    )
    parser.add_argument(
        "--min-lesion-dice",
        type=float,
        default=None,
        help="Optional minimum lesion Dice. Exits non-zero if unmet.",
    )
    parser.add_argument(
        "--min-class-dice",
        default="",
        help="Optional per-class minimum Dice, e.g. '1:0.80,2:0.75,3:0.75'.",
    )
    args = parser.parse_args()

    _bootstrap_backend_imports()
    from services.ai.inference import process_dicom_zip_dir  # pylint: disable=import-error

    dicom_dir = Path(args.dicom_dir).resolve()
    weights_path = Path(args.weights).resolve()
    ref_path = Path(args.reference_mask).resolve()

    pred_mask, _spacing, _volume_hu, _lung_mask = process_dicom_zip_dir(
        dicom_dir, weights_path
    )
    pred_mask = np.asarray(pred_mask, dtype=np.uint8)
    ref_mask = _load_reference_mask(ref_path)

    if pred_mask.shape != ref_mask.shape:
        ref_mask = _resample_mask_to_shape(ref_mask, pred_mask.shape)

    report = _summary(pred_mask, ref_mask)
    text = json.dumps(report, indent=2)
    print(text)

    if args.out_json:
        out_path = Path(args.out_json).resolve()
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(text, encoding="utf-8")
        print(f"\nSaved report to: {out_path}")

    if args.min_lesion_dice is not None and not (0.0 <= args.min_lesion_dice <= 1.0):
        raise ValueError("--min-lesion-dice must be in [0,1]")
    min_class_dice = _parse_class_dice_thresholds(args.min_class_dice)
    passed, failures = _evaluate_thresholds(
        report,
        min_lesion_dice=args.min_lesion_dice,
        min_class_dice=min_class_dice,
    )
    if passed:
        if args.min_lesion_dice is not None or min_class_dice:
            print("Threshold checks: PASS")
        return 0

    print("\nThreshold checks: FAIL")
    for msg in failures:
        print(f"- {msg}")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())

