# Model weights

Place checkpoints here (gitignored `*.pth`). Download from the latest
[GitHub Release](https://github.com/rsebany/ILD-XR/releases) when published,
or copy from your training export.

| File | Role |
|------|------|
| `hierarchical_fold0.pth` | **Default** HierarchicalEncoder3D inference checkpoint (ILD_INFER_FOLD=0) |
| `resnet_18.pth` | Med3D ResNet-18 initialization weights |

High-recall triage operating point (do not lower for production uploads):

- Dual-threshold: `pathology_fraction >= 0.005` OR `mean_ild_prob >= 0.45`
- Dense Softmax: patch `(16,64,64)`, stride `(4,8,8)`, **max_patches=8000**
- Published CV: precision ≈0.876, recall ≈0.808, F1 ≈0.839 (`shared/config/evaluation-metrics.json`)

Override paths with environment variables:

- `ILD_HIERARCHICAL_WEIGHTS` (e.g. `weights/hierarchical_fold0.pth`)
- `ILD_MED3D_WEIGHTS`
- `ILD_INFER_FOLD` (default `0` → `hierarchical_fold0.pth`)
- `ILD_INFER_MAX_PATCHES` (default `8000`; use `400` only for smoke tests — hurts recall)

Do not commit `.pth` binaries to git.
