# ILD-XR

**ILD-XR** is an open platform for patient-level ILD screening on chest CT: DICOM upload, hierarchical 3D deep learning, quantitative biomarkers, and browser-native WebXR review.

![License](https://img.shields.io/badge/license-Apache_2.0-blue.svg)
![Python](https://img.shields.io/badge/python-3.11%20%7C%203.12-green.svg)
![Node](https://img.shields.io/badge/node-20%2B-brightgreen.svg)
![PyTorch](https://img.shields.io/badge/PyTorch-2.6-orange.svg)
![Next.js](https://img.shields.io/badge/Next.js-16-black.svg)

## Overview

ILD-XR converts HRCT volumes into interactive quantitative maps. A fixed lung segmentation stage (lungmask R231) feeds a MedicalNet initialized hierarchical 3D residual encoder with three Softmax heads: binary Normal vs. Any ILD screening (primary), three class fibrotic grouping, and five class pathology mapping. Voxel outputs are aggregated into volumetric biomarkers (lesion volumes, ILD burden, zonal distribution) and rendered through 2D overlays, desktop 3D meshes, and immersive WebXR sessions.

## Features

- DICOM upload (ZIP or folder) with asynchronous inference jobs
- Hierarchical 3D inference: binary, hierarchical, and pathology Softmax maps
- Dual threshold cascade aggregation to the patient level
- Volumetric biomarkers: per class lesion volumes, ILD burden, zonal distribution
- Marching Cubes mesh reconstruction with Taubin smoothing, exported as GLB
- 2D slice viewer with alpha composited pathology overlays
- Browser native WebXR review (VR and AR passthrough) on consumer HMDs
- PDF report download per study

## Technology Stack

| Layer | Technologies |
|-------|-------------|
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS 4, Radix UI / shadcn |
| 3D / XR | Three.js, @react-three/fiber, @react-three/xr, WebXR Device API, dicom-parser |
| Backend API | FastAPI, Uvicorn, Pydantic v2, SQLAlchemy 2, PostgreSQL, JWT auth |
| AI inference | PyTorch 2.6 (CUDA 12.6), lungmask R231, SimpleITK, pydicom, nibabel |
| Mesh processing | scikit-image (Marching Cubes), trimesh (Taubin smoothing), GLB export |
| Infrastructure | Docker, Docker Compose, NVIDIA GPU (optional, CPU fallback) |

## Requirements

- **Docker** (recommended), **or** Python **3.11/3.12** + Node.js **20+** + PostgreSQL
- NVIDIA GPU optional (`AI_FORCE_CPU=true` for CPU)

## Model Weights

Download from [GitHub Releases](https://github.com/rsebany/ILD-XR/releases) into `backend-api/weights/`:

| File | Role |
|------|------|
| `resnet_18.pth` | Med3D initialization (required) |
| `hierarchical.pth` | Default inference checkpoint |

Details: [backend-api/weights/README.md](backend-api/weights/README.md).

## Run with Docker

```bash
git clone https://github.com/rsebany/ILD-XR.git
cd ILD-XR
cp .env.example .env          # set ILD_JWT_SECRET for production
# place both .pth files in backend-api/weights/
docker compose up --build -d
```

| Service | URL |
|---------|-----|
| App | http://localhost:3000 |
| API docs | http://localhost:8000/docs |
| Health | http://localhost:8000/health |

```bash
docker compose logs -f backend-api
docker compose down
```

## Run Locally

```bash
createdb ild_xr

cd backend-api
python -m venv venv
# Windows: .\venv\Scripts\Activate.ps1
# macOS/Linux: source venv/bin/activate
pip install -r ../requirements.txt
```

Create `backend-api/.env`:

```env
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/ild_xr
```

Place weights in `backend-api/weights/`, then:

```bash
# Do not use --reload during AI uploads (restarts drop long Softmax jobs)
uvicorn main:app --host 0.0.0.0 --port 8000 --env-file .env
```

Frontend (new terminal):

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:3000 · API http://localhost:8000/docs

## First Use

1. Open the app and sign up / log in
2. Upload a DICOM study (ZIP or folder flow in the UI)
3. Wait for analysis to finish (upload returns a job; the UI polls until done)
4. Review **2D**, **3D**, and optional **WebXR**

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes (local) | PostgreSQL URL |
| `ILD_JWT_SECRET` | Prod | JWT signing key |
| `NEXT_PUBLIC_API_BASE_URL` | No | Frontend → API (default `http://localhost:8000`) |
| `ILD_INFER_FOLD` | No | Fold index for legacy encoder/softmax weights (default `0`) |
| `ILD_HIERARCHICAL_WEIGHTS` | No | Override hierarchical checkpoint path |
| `ILD_MED3D_WEIGHTS` | No | Override Med3D init path |
| `AI_FORCE_CPU` | No | Force CPU inference |

Copy [`.env.example`](.env.example) for Docker. See that file for optional Softmax / lungmask knobs.

**WebXR (Quest):** bind on `0.0.0.0`, set `NEXT_PUBLIC_API_BASE_URL` to your PC LAN IP, same Wi‑Fi.
**Phone AR:** HTTPS required (`npm run dev:phone` or a tunnel); Android Chrome.

## Repository Layout

```
ILD-XR/
├── frontend/          # Next.js UI + WebXR review
├── backend-api/       # FastAPI server + inference services
├── backend-ai/        # Model code (encoder, preprocessing, config)
├── shared/            # Shared model metadata
├── Notebooks/         # Training and ablation notebooks
├── docker-compose.yml
└── requirements.txt
```

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Backend won't start | Check Postgres and `DATABASE_URL` |
| Inference fails | Both `.pth` files in `backend-api/weights/`? |
| Frontend can't reach API | Match `NEXT_PUBLIC_API_BASE_URL` to the API |
| WebXR fails | Use LAN IP (not localhost); same Wi‑Fi |
| CUDA / TDR errors | `AI_FORCE_CPU=true` or lower `LUNGMASK_BATCH_SIZE` |

Verify weights: `python backend-api/scripts/ai/check_weights.py` (from `backend-api/` with venv active).

## License

Apache License 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).

The WebXR hospital OR background is third party [CC BY-NC 4.0](http://creativecommons.org/licenses/by-nc/4.0/) (non-commercial demo): `frontend/public/xr/backgrounds/hospital/license.txt`.

## Credits

**ILD-XR** is developed by Romualdo Sebany ([email](mailto:romualdosebany@gmail.com)).

**WebXR environment:** ["Charité University Hospital - Operating Room"](https://sketchfab.com/3d-models/charite-university-hospital-operating-room-9ec46c4d615a4581a235eebfb162f574) by [ChrisRE](https://sketchfab.com/ChrisRE), CC BY-NC 4.0.

**HUG ILD Database (MedGIFT):** Depeursinge et al., CMIG, 2012 · [medgift.hevs.ch](https://medgift.hevs.ch/wordpress/databases/ild-database).
