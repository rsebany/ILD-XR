"""
Comparison test between notebook preprocessing and backend preprocessing.
This script helps identify exactly where the predictions diverge.
"""

import numpy as np
import torch
import pydicom
from pathlib import Path

from backend_ai.preprocessing.ct_preprocessing import preprocess_volume
from backend_ai.train_pipeline import predict_full_volume, load_trained_model


def load_dicom_volume(dicom_dir):
    """Load DICOM volume as (Z, Y, X) with spacing (sz, sy, sx) in mm."""
    ct_files = sorted([f for f in Path(dicom_dir).glob("*.dcm")])
    slices, spacing_xy, z_spacing = [], None, 1.0

    for i, f in enumerate(ct_files):
        ds = pydicom.dcmread(f)
        if i == 0:
            spacing_xy = [float(ds.PixelSpacing[0]), float(ds.PixelSpacing[1])]
            z_spacing = float(getattr(ds, "SliceThickness", 1.0))
        img = ds.pixel_array.astype(np.float32)
        if hasattr(ds, "RescaleSlope"):
            img = img * ds.RescaleSlope + ds.RescaleIntercept
        slices.append(img)

    if not slices or spacing_xy is None:
        raise ValueError(f"No valid DICOM files found in {dicom_dir}")

    vol_zyx = np.stack(slices, axis=0)
    spacing_zyx = (z_spacing, spacing_xy[0], spacing_xy[1])
    return vol_zyx, spacing_zyx


def notebook_preprocessing(volume, spacing):
    """
    Replicate exact notebook preprocessing:
    1. Generate mask
    2. Apply mask
    3. CROP to lung region
    4. Resample
    5. Clip and normalize
    """
    pass


def backend_preprocessing(volume_zyx, spacing_zyx):
    """Production v2.2 preprocessing (resample → mask → normalize + variance)."""
    processed_stack, mask = preprocess_volume(volume_zyx, spacing_zyx)
    return processed_stack, mask, processed_stack.shape[1:]


def compare_preprocessing(dicom_dir, model_weights_path):
    """Compare notebook vs backend preprocessing on same DICOM."""
    print(f"Loading DICOM from: {dicom_dir}")
    volume, spacing = load_dicom_volume(dicom_dir)
    print(f"  Original volume shape: {volume.shape}, spacing: {spacing}")

    print("\n" + "=" * 60)
    print("BACKEND PREPROCESSING (v2)")
    print("=" * 60)
    stack, mask_backend, shape_after = backend_preprocessing(volume, spacing)
    hu_norm = stack[0]
    print(f"  After preprocess: {shape_after}")
    print(f"  Stack shape: {stack.shape}")
    print(f"  HU range: [{hu_norm.min():.4f}, {hu_norm.max():.4f}]")
    print(
        f"  Mask coverage: {(mask_backend > 0).sum() / mask_backend.size * 100:.2f}%"
    )

    print("\nRunning backend inference...")
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = load_trained_model(model_weights_path, device)

    pred_backend = predict_full_volume(
        model, stack, device=device, return_probs=False, lung_mask=mask_backend
    )
    print(f"  Backend prediction shape: {pred_backend.shape}")
    print("  Prediction classes distribution:")
    for c in range(4):
        count = (pred_backend == c).sum()
        print(f"    Class {c}: {count} voxels ({count / pred_backend.size * 100:.2f}%)")

    print("\n" + "=" * 60)
    print("NOTEBOOK PREPROCESSING (TO BE IMPLEMENTED)")
    print("=" * 60)
    print("  [Pending: Implement notebook preprocessing to compare]")

    return {
        "backend": {
            "stack": stack,
            "mask": mask_backend,
            "pred": pred_backend,
        },
        "volume": volume,
        "spacing": spacing,
    }


if __name__ == "__main__":
    DICOM_DIR = "path/to/single/dicom"
    MODEL_WEIGHTS = "backend-ai/weights/best_multiclass_model.pth"

    compare_preprocessing(DICOM_DIR, MODEL_WEIGHTS)
