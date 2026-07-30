# ILD-XR

**ILD-XR** is a clinical workflow platform for **high-recall ILD triage/screening** on chest CT: DICOM upload, AI-powered hierarchical classification, quantitative review, and immersive visualization. Browser-native **WebXR** on Meta Quest headsets is systems integration of existing standards, not a new XR method.

> **Paper:** This repository accompanies the paper *"Patient-Level Hierarchical 3D Deep Learning for ILD Screening with Volumetric Biomarkers"*. Scope is single-center MedGIFT validation (N=113); no external validation and no prospective reader study.

## Features

- **AI Screening Triage:** Hierarchical pipeline (lungmask R231 + HierarchicalEncoder3D with 3 heads) for high-recall binary screening, 3-class grouping, and 5-class pathology mapping
- **2D Viewer:** DICOM slice navigation with pathology overlay, lung boundary visualization, window presets
- **3D Viewer:** Real-time mesh reconstruction with per-class visibility toggles and craniocaudal zone filtering
- **WebXR:** Immersive VR/AR review on Meta Quest headsets (integration of the WebXR Device API / Three.js stack, not methodological novelty)
- **Quantitative Metrics:** Per-class volume, burden, and zonal distribution for triage/monitoring support (inherit limited secondary/tertiary per-class reliability)
- **Clinical Workflow:** Patient/study management, role-based access, DICOM export, 3D Slicer integration
- **Expert Comparison:** Side-by-side AI prediction vs expert annotation with Dice scoring

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌──────────┐
│   Frontend   │────▶│  Backend API  │────▶│ Postgres │
│  (Next.js)   │     │  (FastAPI)    │     │   DB     │
│  :3000       │     │  :8000        │     │  :5432   │
└─────────────┘     └──────┬───────┘     └──────────┘
                           │
                    ┌──────▼───────┐
                    │   Backend AI  │
                    │  (PyTorch)    │
                    │  lungmask R231 │
                    │  Hierarchical  │
                    │  Encoder3D    │
                    └──────────────┘
```

| Component | Path | Technology |
|-----------|------|------------|
| Frontend | `frontend/` | Next.js 16, React 19, TypeScript, Tailwind CSS 4, Three.js/WebXR |
| Backend API | `backend-api/` | FastAPI, SQLAlchemy, PostgreSQL, PyTorch |
| Backend AI | `backend-ai/` | PyTorch HierarchicalEncoder3D, lungmask preprocessing, 3 Softmax heads |
| Shared Config | `shared/` | Cross-service model metadata |

## AI Pipeline

ILD-XR uses a **hierarchical inference pipeline** with 3 classification heads sharing a single encoder:

### Stage 1: Lung Preprocessing
- **Method:** lungmask R231 (fixed pretrained model, not trained in this repo)
- **Input:** HU-normalized CT volume resampled to isotropic 1 mm
- **Output:** Binary lung mask (HU-threshold fallback if lungmask is unavailable)

### Stage 2: Hierarchical Classification
- **Encoder:** HierarchicalEncoder3D (3D ResNet-18 + SE blocks, 512-dim features)
  - Input: 16×64×64 lung-centered patches
  - Initialized from Med3D `resnet_18.pth`, fine-tuned per fold
- **Three Softmax heads** (shared encoder):
  - **Binary head** (primary): Normal vs Any-ILD high-recall screening triage
  - **3-class head** (secondary): Normal / Fibrotic / NonFibrotic (biomarker attribution; not standalone diagnosis)
  - **5-class head** (tertiary): Emphysema, Fibrosis, Ground Glass, Micronodules, Consolidation (biomarker attribution; not standalone diagnosis)
- Dense sliding window: patch `(16,64,64)`, stride `(4,8,8)`

### Model Checkpoints

| File | Model | Notes |
|------|-------|-------|
| `resnet_18.pth` | Med3D ResNet-18 init | Required at startup validation |
| `hierarchical_fold0.pth` | HierarchicalEncoder3D (all 3 heads) | Default inference checkpoint |
| `encoder3d_fold0.pth` | Legacy Med3DPathologyEncoder3D | Fallback (v3.0 compat) |
| `softmax3d_fold0.pth` | Legacy Softmax head | Fallback (v3.0 compat) |

Place in `backend-api/weights/`. Override fold via `ILD_INFER_FOLD` (default `0`).  
Override hierarchical path via `ILD_HIERARCHICAL_WEIGHTS`. The API prefers `hierarchical_fold{N}.pth` when present and falls back to legacy encoder+Softmax.

**Download weights:** `.pth` files are not stored in git. Get them from the latest
[GitHub Release](https://github.com/rsebany/ILD-XR/releases) (or your training export)
and copy into `backend-api/weights/`. See [backend-api/weights/README.md](backend-api/weights/README.md).


### Reported metrics (113-patient, patient-disjoint protocol)

On this ~93:7 ILD-prevalent cohort, the **primary metric is patient cascade F1** at the fixed dual-threshold operating point (not overall discrimination). High F1 with near-chance patient ranking is expected under that triage design.

| Metric | Value | Task |
|--------|-------|------|
| Binary patient F1 (5-fold CV cascade) | **0.839 ± 0.056** | Primary generalization claim (operating-point) |
| Binary patient Acc (5-fold CV cascade) | 0.734 ± 0.083 | Primary |
| Binary patient MCC (5-fold CV cascade) | 0.006 ± 0.153 | Near chance; ranking not claimed |
| Patch OOF binary F1 (bootstrap) | 0.680 (95% CI 0.614-0.757) | Patch-level |
| Patch OOF binary AUC | 0.693 (95% CI 0.682-0.705) | Co-reported discriminative metric (patch) |
| Exploratory patient AUC (mean lung ILD prob.) | ≈0.58 | Near chance; not claimed |
| Binary patient F1 (Phase 2 deployed) | 0.938 | Full-cohort deployment checkpoint — **not** held-out generalization |
| Binary patient Acc (Phase 2 deployed) | 0.885 | Deployed (same caveat) |
| 3-class Hier Macro-F1 (CV patch) | ≈0.155 | Secondary; biomarkers inherit this unreliability |
| 5-class Path Macro-F1 (CV patch) | ≈0.094 | Tertiary; biomarkers inherit this unreliability |
| 3-class Hier Macro-F1 (Phase 2) | 0.252 | Secondary (Phase 2 only) |
| 5-class Path Macro-F1 (Phase 2) | 0.078 | Tertiary (Phase 2 only) |
| Binary ECE | 0.052 | Calibration |


Patient-level binary uses the dual-threshold cascade rule (`pathology_fraction ≥ 0.5%` OR `mean_ild_prob ≥ 0.45`). Voxel pathology maps remain Softmax argmax. No formal significance testing vs prior literature (cohorts/splits differ).

**Limitations:** Single-center MedGIFT (N=113); no external multi-center validation; no prospective reader study. Intended role is triage/monitoring support, not autonomous diagnosis.

See `shared/config/evaluation-metrics.json` and `GET /health`.

## Requirements

- Python **3.11** or **3.12**
- Node.js **20+**
- **PostgreSQL** (required; SQLite is not supported)
- NVIDIA GPU optional (CUDA used when available; CPU fallback supported)

## Quick Start (Local)

### Database

```bash
# Create PostgreSQL database
createdb ild_xr
```

### Backend

```bash
cd backend-api
python -m venv venv
# Windows: .\venv\Scripts\Activate.ps1  |  macOS/Linux: source venv/bin/activate
pip install -r ../requirements.txt
```

Create `backend-api/.env`:

```env
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/ild_xr
```

Place model weights at `backend-api/weights/`. Start the API:

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000 --env-file .env
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

- App: http://localhost:3000
- API docs: http://localhost:8000/docs
- Health: http://localhost:8000/health

## Docker Deployment

### Prerequisites

- Docker Engine 24+
- Docker Compose v2+
- Model weights in `backend-api/weights/`

### 1. Clone and configure

```bash
git clone https://github.com/rsebany/ILD-XR.git
cd ILD-XR
cp .env.example .env
# Edit .env with your settings (especially ILD_JWT_SECRET)
```

### 2. Add model weights

```bash
# Copy hierarchical weights into the weights directory
cp /path/to/resnet_18.pth backend-api/weights/
cp /path/to/hierarchical_fold0.pth backend-api/weights/
# Legacy weights also supported (auto-detected)
```

### 3. Build and run

```bash
docker compose up --build -d
```

This starts three services:

| Service | Port | Description |
|---------|------|-------------|
| `frontend` | 3000 | Next.js web application |
| `backend-api` | 8000 | FastAPI REST API + AI inference |
| `postgres` | 5432 | PostgreSQL database |

### 4. Verify

```bash
# Check health
curl http://localhost:8000/health

# Open the app
open http://localhost:3000
```

### Docker Commands

```bash
# View logs
docker compose logs -f backend-api

# Stop all services
docker compose down

# Stop and remove volumes (fresh start)
docker compose down -v

# Rebuild after code changes
docker compose up --build -d

# Run a single container
docker compose up backend-api
```

### Volumes

| Volume | Purpose |
|--------|---------|
| `backend-api/weights/` | Model weights (read-only mount) |
| `backend-api/data/` | DICOM uploads, masks, segmentation revisions |
| `backend-api/static/meshes/` | Generated GLB mesh files |
| `pgdata` | PostgreSQL data (managed by Docker) |

## Environment Variables

### Backend API

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `DATABASE_URL` | — | Yes | PostgreSQL connection string |
| `ILD_JWT_SECRET` | dev secret | Yes (prod) | JWT signing key |
| `API_HOST` | `0.0.0.0` | No | Bind address |
| `API_PORT` | `8000` | No | Listen port |
| `TORCH_NUM_THREADS` | `2` | No | PyTorch thread count |
| `AI_FORCE_CPU` | `false` | No | Force CPU inference |
| `ILD_INFER_FOLD` | `0` | No | Cross-validation fold for checkpoint weights |
| `ILD_HIERARCHICAL_WEIGHTS` | `backend-api/weights/hierarchical_fold{N}.pth` | No | Hierarchical checkpoint (preferred) |
| `ILD_MED3D_WEIGHTS` | `backend-api/weights/resnet_18.pth` | No | Med3D init checkpoint path |
| `ILD_ENCODER_WEIGHTS` | `backend-api/weights/encoder3d_fold{N}.pth` | No | Legacy encoder path |
| `ILD_SOFTMAX_WEIGHTS` | `backend-api/weights/softmax3d_fold{N}.pth` | No | Legacy Softmax head path |
| `FRONTEND_BASE_URL` | `http://localhost:3000` | No | DICOM export links |

### Frontend

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_API_BASE_URL` | `http://localhost:8000` | Backend API URL |

## Extended Setup

**WebXR (Meta Quest):** Bind both services on `0.0.0.0`, set `NEXT_PUBLIC_API_BASE_URL` to your PC's LAN IP, and open `http://<LAN-IP>:3000` on the headset. See `GET /health` for XR hints.

**WebXR AR (Android phone):** Phone AR needs a **secure context** (HTTPS). Quest LAN HTTP is not enough for Chrome on phones.

1. Keep `NEXT_PUBLIC_API_BASE_URL=/api` in `frontend/.env.local` (Next proxies `/api` → local backend).
2. Start the API, then either:
   - `npm run certs:phone` (optional) then `npm run dev:phone` in `frontend/` — open `https://<PC-LAN-IP>:3443/webxr` on the phone (accept the self-signed warning), or
   - `npm run dev` + an HTTPS tunnel (`ngrok http 3000` / Cloudflare Tunnel) and open the `https://…` URL on the phone.
3. On an **ARCore Android** device, open **Chrome** → `https://…/webxr?studyId=…` → **Enter AR** → allow camera.
4. **iPhone/iPad Safari cannot run WebXR AR** — use Android Chrome.

**3D Slicer:** Push revised masks with `backend-api/scripts/integrations/slicer_bridge.py`. Masks must be `uint8 [Z,Y,X]` with spacing matching the server DICOM.

**Tunnel/Proxy:** To expose only the frontend (e.g. ngrok), proxy API calls via Next.js (`/api` → `http://127.0.0.1:8000`) and set `NEXT_PUBLIC_API_BASE_URL=/api`.

## Evaluation

Research notebooks ship under `Experimentations/` (sanitized; no machine-local defaults):

- `Experimentations/01_hierarchical_ild.ipynb` — HierarchicalEncoder3D training + CV
- `Experimentations/02_phase2_finetune.ipynb` — Phase 2 deployment fine-tuning
- `Experimentations/03_hierarchical_ablation.ipynb` — Ablation factor matrix
- `Experimentations/cascade_cv_fold_metrics.csv` — patient-level cascade fold metrics

Set environment variables before running notebooks:

| Variable | Purpose |
|----------|---------|
| `ILD_MEDGIFT_ROOT` | MedGIFT volume/ROI root |
| `ILD_LUNG_MASK_BASE` | Cached lung masks root |
| `ILD_MODELS_DIR` | Checkpoint output/input directory |
| `ILD_EXPORTS_DIR` | Optional metrics export directory |

Canonical published metrics: `shared/config/evaluation-metrics.json`.  
Exported JSON artifacts: `backend-api/results/`.

```bash
python backend-api/scripts/ai/check_weights.py
python backend-api/scripts/ai/regression_inference.py --dicom-dir path/to/dicoms
```
## Project Structure

```
ILD-XR/
├── Experimentations/          # Training / evaluation notebooks (MedGIFT)
├── frontend/                  # Next.js web application
│   ├── components/            # React components
│   │   ├── features/viewer/   # 2D/3D/XR viewer components
│   │   └── ui/                # Shared UI components
│   ├── api/                   # API client functions
│   ├── hooks/                 # React hooks
│   ├── lib/                   # Utilities (metrics, DICOM, mesh)
│   └── public/                # Static assets, XR scenes
├── backend-api/               # FastAPI REST API
│   ├── routes/                # API route handlers
│   │   ├── studies/           # Study CRUD, upload, viewer
│   │   ├── patients/          # Patient management
│   │   └── segmentation_sync/ # 3D Slicer bridge
│   ├── services/              # Business logic
│   │   ├── ai/                # Inference pipeline, mesh generation
│   │   ├── studies/           # Upload, expert compare
│   │   └── dicom/             # DICOM reading, series stacking
│   ├── models/                # SQLAlchemy ORM models
│   ├── auth/                  # JWT authentication
│   ├── weights/               # Model checkpoints (.gitignored *.pth)
│   └── data/                  # Runtime data (DICOM, masks)
├── backend-ai/                # Model definitions
│   ├── models/                # HierarchicalEncoder3D, SE blocks, legacy compat
│   ├── preprocessing/         # CT preprocessing, lungmask stage 1
│   └── config.py              # Hyperparameters
├── shared/                    # Cross-service config
├── Dockerfile.backend         # Backend Docker image
├── Dockerfile.frontend        # Frontend Docker image
├── docker-compose.yml         # Multi-service orchestration
└── requirements.txt           # Python dependencies
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Docker build fails | Ensure Docker Engine 24+ and Docker Compose v2+ |
| Backend won't start | Check `DATABASE_URL` and PostgreSQL is running |
| Inference fails | Verify weights in `backend-api/weights/` |
| CUDA kernel error | Set `AI_FORCE_CPU=true` or use GPU with sm_75+ arch |
| Frontend can't reach API | Check `NEXT_PUBLIC_API_BASE_URL` matches backend |
| WebXR won't connect | Use LAN IP, not localhost; ensure same Wi-Fi network |
| Phone AR unavailable | Needs Android Chrome + HTTPS (`npm run dev:phone` or ngrok). iOS Safari has no WebXR AR |
| Slicer upload 422 | Mask shape/spacing must match study DICOM on server |

## Citation

If you use ILD-XR in your research, please cite:

```bibtex
@article{sebany2026ildxr,
  title={Patient-Level Hierarchical 3D Deep Learning for ILD Screening with Volumetric Biomarkers},
  author={Sebany, Romualdo and Benbelkacem, Samir and Ykhlef, Hadjer and Ykhlef, Faycal and Masmoudi, Mostefa},
  year={2026}
}
```
## License

This project (ILD-XR source code, trained weights, and deployment configurations) is released under the [Apache License 2.0](LICENSE). See [NOTICE](NOTICE).

The WebXR hospital operating room 3D environment is a third-party asset **not** covered by Apache 2.0: it remains [CC BY-NC 4.0](http://creativecommons.org/licenses/by-nc/4.0/) and is used for non-commercial research demonstration only. See [`frontend/public/xr/backgrounds/hospital/license.txt`](frontend/public/xr/backgrounds/hospital/license.txt).

## Credits

**ILD-XR** — developed by **Romualdo SEBANY** ([romualdosebany@gmail.com](mailto:romualdosebany@gmail.com) · [LinkedIn](https://www.linkedin.com/in/romualdo-sebany/)).

### WebXR environment (Fig. platform panel d)

This work is based on ["Charité University Hospital - Operating Room"](https://sketchfab.com/3d-models/charite-university-hospital-operating-room-9ec46c4d615a4581a235eebfb162f574) by [ChrisRE](https://sketchfab.com/ChrisRE), licensed under [CC BY-NC 4.0](http://creativecommons.org/licenses/by-nc/4.0/). Used for non-commercial research demonstration only; not covered by the Apache 2.0 license applied to ILD-XR's own source code.

### HUG ILD Database

This project uses the multimedia ILD collection from the **University Hospitals of Geneva (HUG)**: HRCT series with 3D annotations for **128 patients** across **13 histological ILD diagnoses**.

- Depeursinge *et al.*, [*Building a reference multimedia database for interstitial lung diseases*](https://www.sciencedirect.com/science/article/abs/pii/S0895611111001017), *Computerized Medical Imaging and Graphics*, 2012
- Access: [ILD database information page](https://medgift.hevs.ch/wordpress/databases/ild-database)


#   I L D - X R  
 