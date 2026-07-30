# Model weights

Place checkpoints here (gitignored `*.pth`). Download from the latest
[GitHub Release](https://github.com/rsebany/ILD-XR/releases) when published,
or copy from your training export.

| File | Role |
|------|------|
| `hierarchical_fold0.pth` | Default HierarchicalEncoder3D inference checkpoint (preferred) |
| `resnet_18.pth` | Med3D ResNet-18 initialization weights |
| `encoder3d_fold0.pth` + `softmax3d_fold0.pth` | Legacy v3.0 pair (optional fallback) |

Override paths with environment variables:

- `ILD_HIERARCHICAL_WEIGHTS`
- `ILD_MED3D_WEIGHTS`
- `ILD_ENCODER_WEIGHTS` / `ILD_SOFTMAX_WEIGHTS`
- `ILD_INFER_FOLD` (default `0`)

Do not commit `.pth` binaries to git.
