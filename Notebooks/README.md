# Experimentations

Training / evaluation notebooks (MedGIFT). **Not required** to run the web platform — see the root [README](../README.md).

| Notebook | Purpose |
|----------|---------|
| `01_hierarchical_ild.ipynb` | Binary-primary training + patient-disjoint CV |
| `02_phase2_finetune.ipynb` | Phase 2 multi-head fine-tuning |
| `03_hierarchical_ablation.ipynb` | Ablations |

```bash
export ILD_MEDGIFT_ROOT=/path/to/medgift_volumes
export ILD_LUNG_MASK_BASE=/path/to/lung_masks
export ILD_MODELS_DIR=/path/to/checkpoints
```

Do not commit MedGIFT data, `local.env`, or `.pth` checkpoints.
