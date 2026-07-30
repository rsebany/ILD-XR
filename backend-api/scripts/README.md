# Backend API scripts

CLI utilities for model checks, inference regression, API smoke tests, and 3D Slicer sync.
Run from **`backend-api/`** unless noted.

## Layout

| Path | Purpose |
|------|---------|
| `common/` | Shared paths, import bootstrap, mask metrics, segmentation-sync payloads |
| `ai/` | Model weights and inference validation |
| `api/` | HTTP smoke tests against a running API |
| `auth/` | Practitioner accounts (create user, set password, list) |
| `integrations/` | External tools (3D Slicer) |

## AI / inference

**Check weights** — load checkpoint, report key mismatches, one forward pass:

```bash
python scripts/ai/check_weights.py
```

**Regression inference** — full DICOM → mask pipeline with volume assertions:

```bash
python scripts/ai/regression_inference.py --dicom-dir path/to/dicoms
python scripts/ai/regression_inference.py --check-native-remap --remap-only
```

**Parity check** — compare API mask vs notebook reference (`.npy` / `.npz`):

```bash
python scripts/ai/parity_check.py \
  --dicom-dir path/to/dicoms \
  --weights weights/encoder3d_fold0.pth \
  --reference-mask path/to/ref_mask.npy
```

Parity uses checkpoints from `common/paths.py` (prefers `hierarchical_fold{N}.pth`, falls back to `encoder3d_fold{N}.pth` + `softmax3d_fold{N}.pth`).

## Auth / users

Run from **`backend-api/`** with `DATABASE_URL` set (same as the API).

**Create account** (prompts for password if `--password` omitted):

```bash
python scripts/auth/create_user.py --email dr@hospital.example --full-name "Dr. Smith" --role radiologist
python scripts/auth/create_user.py --email admin@hospital.example --full-name "System Admin" --role admin --password "ChangeMeNow!"
```

**Reset password**:

```bash
python scripts/auth/set_password.py --email dr@hospital.example
```

**List accounts** (table or JSON):

```bash
python scripts/auth/list_users.py
python scripts/auth/list_users.py --format json
```

Roles: `radiologist`, `referring_physician`, `admin`. Passwords are never exposed via the admin HTTP API — use these scripts only.

## API smoke tests

**Upload** (needs `BEARER_TOKEN`):

```bash
set BEARER_TOKEN=your_jwt
python scripts/api/upload_smoke_test.py --zip tmp/118/scan_118_download.zip
```

**Segmentation sync** (synthetic mask, no auth):

```bash
python scripts/api/sync_smoke_test.py --study-id ST-xxxxxxxx
```

## Integrations

**3D Slicer bridge** — push a `[Z,Y,X]` uint8 `.npy` labelmap:

```bash
python scripts/integrations/slicer_bridge.py \
  --study-id ST-xxxxxxxx \
  --mask-npy C:/path/mask.npy \
  --spacing 1.2,0.7,0.7
```

Set `ILD_API_BASE_URL` or `NEXT_PUBLIC_API_BASE_URL` for the default API host.
Use `--urllib` inside Slicer’s Python if `requests` is unavailable.

## Defaults

- Weights (hierarchical preferred, fold 0 by default):
  - `backend-api/weights/resnet_18.pth`
  - `backend-api/weights/hierarchical_fold0.pth` (preferred)
  - `backend-api/weights/encoder3d_fold0.pth` (legacy fallback)
  - `backend-api/weights/softmax3d_fold0.pth` (legacy fallback)
- Override fold via `ILD_INFER_FOLD` (see `common/paths.py`)
- API base: `http://127.0.0.1:8000` unless env overrides (see `common/paths.py`)
