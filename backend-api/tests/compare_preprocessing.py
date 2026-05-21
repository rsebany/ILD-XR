"""
Comparison test between notebook preprocessing and backend preprocessing.
This script helps identify exactly where the predictions diverge.
"""

import numpy as np
import torch
import pydicom
from pathlib import Path

# Import notebook functions (you'll need to adjust the path)
from backend_ai.preprocessing.ct_preprocessing import (
    isotropic_resample,
    extract_lung_mask,
    preprocess_volume_with_mask,
)
from backend_ai.models.unet3d import UNet3DResidual
from backend_ai.train_pipeline import predict_full_volume, load_trained_model

# For notebook functions, you might need to load them separately
# OR create a unified preprocessing module


def load_dicom_volume(dicom_dir):
    """Load DICOM volume same way as notebook."""
    ct_files = sorted([f for f in Path(dicom_dir).glob("*.dcm")])
    slices, spacing = [], None
    
    for i, f in enumerate(ct_files):
        ds = pydicom.dcmread(f)
        if i == 0:
            spacing = [
                float(ds.PixelSpacing[0]),
                float(ds.PixelSpacing[1]),
                float(getattr(ds, 'SliceThickness', 1.0))
            ]
        img = ds.pixel_array.astype(np.float32)
        if hasattr(ds, 'RescaleSlope'):
            img = img * ds.RescaleSlope + ds.RescaleIntercept
        slices.append(img)
    
    if not slices or not spacing:
        raise ValueError(f"No valid DICOM files found in {dicom_dir}")
    
    vol = np.stack(slices, axis=2)
    return vol, spacing


def notebook_preprocessing(volume, spacing):
    """
    Replicate exact notebook preprocessing:
    1. Generate mask
    2. Apply mask
    3. CROP to lung region
    4. Resample
    5. Clip and normalize
    """
    # This requires implementing the notebook functions
    # For now, placeholder
    pass


def backend_preprocessing(volume, spacing):
    """
    Current backend preprocessing:
    1. Resample first
    2. Then mask and normalize
    """
    # Step 1: Resample to isotropic
    resampled, _ = isotropic_resample(volume, spacing, target_spacing=(1.0, 1.0, 1.0))
    
    # Step 2: Mask and normalize
    normalized, mask = preprocess_volume_with_mask(resampled)
    
    return normalized, mask, resampled.shape


def compare_preprocessing(dicom_dir, model_weights_path):
    """
    Compare notebook vs backend preprocessing on same DICOM.
    """
    print(f"Loading DICOM from: {dicom_dir}")
    volume, spacing = load_dicom_volume(dicom_dir)
    print(f"  Original volume shape: {volume.shape}, spacing: {spacing}")
    
    # Backend preprocessing
    print("\n" + "="*60)
    print("BACKEND PREPROCESSING")
    print("="*60)
    norm_backend, mask_backend, shape_after_resample = backend_preprocessing(volume, spacing)
    print(f"  After resample: {shape_after_resample}")
    print(f"  Normalized shape: {norm_backend.shape}")
    print(f"  Normalized range: [{norm_backend.min():.4f}, {norm_backend.max():.4f}]")
    print(f"  Mask coverage: {(mask_backend > 0).sum() / mask_backend.size * 100:.2f}%")
    
    # Backend inference
    print("\nRunning backend inference...")
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    model = load_trained_model(model_weights_path, device)
    
    # Convert to proper format (D, H, W) for prediction
    norm_dhw = norm_backend.transpose(2, 0, 1)
    pred_backend = predict_full_volume(model, norm_dhw, device=device, return_probs=False)
    print(f"  Backend prediction shape: {pred_backend.shape}")
    print(f"  Prediction classes distribution:")
    for c in range(4):
        print(f"    Class {c}: {(pred_backend == c).sum()} voxels ({(pred_backend == c).sum() / pred_backend.size * 100:.2f}%)")
    
    # Notebook preprocessing (when implemented)
    print("\n" + "="*60)
    print("NOTEBOOK PREPROCESSING (TO BE IMPLEMENTED)")
    print("="*60)
    print("  [Pending: Implement notebook preprocessing to compare]")
    
    return {
        'backend': {
            'norm': norm_backend,
            'mask': mask_backend,
            'pred': pred_backend,
        },
        'volume': volume,
        'spacing': spacing,
    }


if __name__ == "__main__":
    # Configuration
    DICOM_DIR = "path/to/single/dicom"  # Set to a specific patient's DICOM
    MODEL_WEIGHTS = "backend-ai/weights/best_multiclass_model.pth"  # or wherever your weights are
    
    results = compare_preprocessing(DICOM_DIR, MODEL_WEIGHTS)
    
    print("\n" + "="*60)
    print("RECOMMENDATIONS")
    print("="*60)
    print("""
1. If backend prediction is much lower (fewer ILD voxels):
   → The issue is likely in preprocessing (masking/cropping order)
   
2. If the issue is specifically in normalized volume shape/content:
   → The cropping step is missing or order of operations is wrong
   
3. Compare visual output:
   - Save normalized volumes as NIfTI or PNG slices
   - Compare side-by-side with notebook output
   - Check if lung regions align
    """)
