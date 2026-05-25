# backend-ai

PyTorch code for **ILD v2.2** chest CT segmentation: 3D residual U-Net (2 input channels, 4 classes), preprocessing, losses, and inference helpers.

The live app loads this folder from **`backend-api`** via `services/ai/bootstrap.py` (no separate install required).

## Layout

| Path | Purpose |
|------|---------|
| `config.py` | Patch size, stride, softmax temperature, per-class thresholds |
| `preprocessing/ct_preprocessing.py` | `preprocess_volume` → 2-channel stack + lung mask |
| `models/unet3d.py` | `UNet3DResidual` |
| `utils/losses.py` | Training losses (deep supervision) |
| `utils/postprocess.py` | Optional morphological mask cleanup |
| `train_pipeline.py` | Load checkpoint, `threshold_predict`, `predict_full_volume`, minimal `run_training_loop` |

## Model weights

Place the trained checkpoint at:

```text
backend-api/weights/best_multiclass_model.pth
```

(Not committed to git — copy your `.pth` there after training.)

Verify loading:

```bash
python backend-api/scripts/ai/check_weights.py
```

## Conventions

- Volumes are **`(Z, Y, X)`** (slice, row, col), same as the DICOM stack in the API.
- Spacing is **`(sz, sy, sx)`** in mm.
- Classes: `0` background, `1` GGO, `2` reticulation, `3` consolidation.

## Inference (production)

End-to-end flow is implemented in **`backend-api`**:

```text
DICOM → preprocess_volume → sliding_window_inference → mask (→ optional postprocess_mask)
```

See `backend-api/services/ai/dicom_pipeline.py`. Inference does **not** train the model; it only loads weights and runs forward passes.

## Offline / scripts

From the repo root, with dependencies from `requirements.txt` and weights in place:

- **Full DICOM pipeline:** `python backend-api/scripts/ai/regression_inference.py --dicom-dir path/to/dicoms`
- **Weights smoke test:** `python backend-api/scripts/ai/check_weights.py`

`train_pipeline.predict_full_volume` runs the same sliding-window idea on an already preprocessed `(2, Z, Y, X)` stack (useful for notebooks or tests).

## Training

Full dataset loading and augmentation live in **`notebook/segmentation_final.ipynb`**.  
`run_training_loop` in `train_pipeline.py` is a minimal trainer if you provide your own PyTorch `DataLoader`s; it is not used by the API.

## Config tuning

- **`CLASS_THRESHOLDS`** — lower = more sensitive per class (see comments in `config.py`).
- **`TEMPERATURE`** — softmax sharpness before thresholding (default `0.45`).
- **`PATCH_SIZE` / `STRIDE`** — inference window; API uses 50% overlap via `sliding_window.py`.

Keep `backend-api/services/ai/sliding_window.py` in sync when you change thresholds or patch settings (values are mirrored there today).
