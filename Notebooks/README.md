# Notebooks

Training, evaluation and ablation pipeline for the ILD-XR model. **Not required** to run the web platform. See the root [README](../README.md).

| Notebook | Purpose |
|----------|---------|
| `ILD_XR_Training_Pipeline.ipynb` | Single end to end pipeline: shared setup and patch mining, Stage 1 binary primary cross validation with cascade inference and biomarkers, Phase 2 multi head fine tuning, ablation factor matrix |

## Environment

```bash
export ILD_MEDGIFT_ROOT=/path/to/volumes
export ILD_LUNG_MASK_BASE=/path/to/lung_masks
export ILD_MODELS_DIR=/path/to/checkpoints
export ILD_EXPORTS_DIR=/path/to/exports
```

A `local.env` file placed next to the notebook is loaded automatically.

Do not commit dataset volumes, `local.env`, or `.pth` checkpoints.
