# backend-ai

PyTorch code for **ILD-XR v4.0** chest CT hierarchical classification: lungmask R231 preprocessing, HierarchicalEncoder3D (ResNet-18 + SE blocks) with 3 Softmax heads.

The live app loads this folder from **`backend-api`** via `services/ai/bootstrap.py` (no separate install required).

## Layout

| Path | Purpose |
|------|---------|
| `config.py` | Patch size, dense stride, hierarchical class definitions, cascade thresholds |
| `preprocessing/lungmask_stage1.py` | lungmask R231 + HU normalize (`preprocess_for_softmax`) |
| `preprocessing/ct_preprocessing.py` | HU clip constants and isotropic resampling helpers |
| `models/med3d_encoder.py` | `HierarchicalEncoder3D`, `SE_ResBlock3D`, legacy `Med3DPathologyEncoder3D` compat |
| `utils/postprocess.py` | Optional morphological mask cleanup |

## Model weights

Place paper-aligned checkpoints at:

```text
backend-api/weights/resnet_18.pth                    # Med3D init (required)
backend-api/weights/hierarchical_fold0.pth            # Phase 2 multi-head checkpoint (all 3 heads, F1=0.938)
backend-api/weights/encoder3d_fold0.pth               # Legacy fallback (v3.0)
backend-api/weights/softmax3d_fold0.pth                # Legacy fallback (v3.0)
```

Evaluation results (JSON/CSV) and paper figures are at:

```text
backend-api/results/          # Bootstrap metrics, calibration, ablation, cascade, confusion
shared/figures/               # ROC curves, reliability diagrams, confusion matrix, pipeline architecture
```

Verify loading:

```bash
python backend-api/scripts/ai/check_weights.py
```

## Conventions

- Volumes are **`(Z, Y, X)`** (slice, row, col), same as the DICOM stack in the API.
- Spacing is **`(sz, sy, sx)`** in mm.
- Classes: `0` Normal, `1` Emphysema, `2` Fibrosis, `3` Ground Glass, `4` Micronodules, `5` Consolidation.

## Inference (production)

```text
DICOM → preprocess_for_softmax (lungmask) → softmax_cascade_inference → mask
```

See `backend-api/services/ai/dicom_pipeline.py`.

## Offline / scripts

- **Full DICOM pipeline:** `python backend-api/scripts/ai/regression_inference.py --dicom-dir path/to/dicoms`
- **Weights smoke test:** `python backend-api/scripts/ai/check_weights.py`

## Training

Full dataset loading, lungmask caching, and hierarchical training live in **`Experimentations/01_hierarchical_ild.ipynb`** (Phase 1 binary + Phase 2 multi-head fine-tuning).  
Phase 2 deployment fine-tuning: **`Experimentations/02_phase2_finetune.ipynb`**.  
Ablation studies: **`Experimentations/03_hierarchical_ablation.ipynb`**.
