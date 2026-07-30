# backend-ai

PyTorch models for ILD-XR hierarchical CT classification (lungmask R231 + HierarchicalEncoder3D with 3 Softmax heads).

Loaded from **`backend-api`** via `services/ai/bootstrap.py` (no separate install).

## Layout

| Path | Purpose |
|------|---------|
| `config.py` | Patch size, stride, classes, cascade thresholds |
| `preprocessing/lungmask_stage1.py` | lungmask R231 + HU normalize |
| `preprocessing/ct_preprocessing.py` | HU clip / resampling helpers |
| `models/med3d_encoder.py` | `HierarchicalEncoder3D`, `SE_ResBlock3D` |
| `utils/postprocess.py` | Optional morphological cleanup |

## Weights

```text
backend-api/weights/resnet_18.pth
backend-api/weights/hierarchical_fold0.pth
```

Verify: `python backend-api/scripts/ai/check_weights.py`

Metrics / figures: `backend-api/results/`, `shared/figures/`. Training notebooks: [`Experimentations/`](../Experimentations/).

## Conventions

- Volumes `(Z, Y, X)`; spacing `(sz, sy, sx)` mm
- Classes: `0` Normal, `1` Emphysema, `2` Fibrosis, `3` Ground Glass, `4` Micronodules, `5` Consolidation

Inference path: `backend-api/services/ai/dicom_pipeline.py`.
