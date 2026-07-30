# Experimentations

Hierarchical training and evaluation notebooks for ILD-XR (MedGIFT).

## Notebooks

| Notebook | Purpose |
|----------|---------|
| `01_hierarchical_ild.ipynb` | Binary-primary training + patient-disjoint CV |
| `02_phase2_finetune.ipynb` | Phase 2 multi-head deployment fine-tuning |
| `03_hierarchical_ablation.ipynb` | Ablation factor matrix |
| `cascade_cv_fold_metrics.csv` | Per-fold patient-level cascade metrics |

## Required environment

```bash
export ILD_MEDGIFT_ROOT=/path/to/ILD_DB_volumeROIs
export ILD_LUNG_MASK_BASE=/path/to/ILD_DB_lungMasks
export ILD_MODELS_DIR=/path/to/checkpoints
export ILD_EXPORTS_DIR=/path/to/exports   # optional
```

Do not commit MedGIFT volumes, local env files, or checkpoint binaries.
