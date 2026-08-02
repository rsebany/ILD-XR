# backend-ai

PyTorch models for ILD-XR (lungmask R231 + HierarchicalEncoder3D with 3 Softmax heads).

Loaded by **`backend-api`** at runtime — no separate install.

| Path | Purpose |
|------|---------|
| `models/med3d_encoder.py` | `HierarchicalEncoder3D` |
| `preprocessing/` | lungmask + HU helpers |
| `config.py` | Patch size, stride, cascade thresholds |

Weights live in `backend-api/weights/` — see [weights README](../backend-api/weights/README.md).

**To run the web app**, use the root [README](../README.md). Training notebooks: [`Experimentations/`](../Experimentations/).
