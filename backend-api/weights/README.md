# Model weights

Place checkpoints here (`*.pth` are gitignored). Download from the latest
[GitHub Release](https://github.com/rsebany/ILD-XR/releases), or copy from training.

| File | Role |
|------|------|
| `hierarchical.pth` | Default HierarchicalEncoder3D inference |
| `resnet_18.pth` | Med3D ResNet-18 initialization |

Optional overrides: `ILD_HIERARCHICAL_WEIGHTS`, `ILD_MED3D_WEIGHTS`, `ILD_INFER_FOLD` (legacy encoder/softmax fold).

```bash
cd backend-api
python scripts/ai/check_weights.py
```

Do not commit `.pth` binaries.
