# ILD-XR

Open platform for hierarchical 3D ILD analysis on chest CT: DICOM upload, AI inference with high-recall candidate flagging, volumetric biomarkers, and browser-native WebXR review.

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| Frontend | [Next.js 16](https://nextjs.org) · [React 19](https://react.dev) · [TypeScript](https://www.typescriptlang.org) · [Tailwind CSS 4](https://tailwindcss.com) · [Radix UI](https://www.radix-ui.com) |
| 3D / XR | [Three.js](https://threejs.org) · [react-three-fiber](https://docs.pmnd.rs) · [react-three-xr](https://github.com/pmndrs/react-three-xr) · [WebXR Device API](https://developer.mozilla.org/en-US/docs/Web/API/WebXR_Device_API) |
| Backend API | [FastAPI](https://fastapi.tiangolo.com) · [SQLAlchemy 2](https://www.sqlalchemy.org) · [PostgreSQL](https://www.postgresql.org) · [python-jose](https://github.com/mpdavis/python-jose) (JWT) |
| AI inference | [PyTorch 2.6](https://pytorch.org) · [lungmask R231](https://github.com/JoHof/lungmask) · [SimpleITK](https://simpleitk.org) · [pydicom](https://pydicom.github.io) · [nibabel](https://nipy.org/nibabel) |
| Mesh processing | [scikit-image](https://scikit-image.org) (Marching Cubes) · [trimesh](https://trimesh.org) (GLB export, Taubin smoothing) |
| Infrastructure | [Docker Compose](https://docs.docker.com/compose/) · NVIDIA GPU optional |

**Algorithm and data references**

- Lung segmentation: Hofmanninger et al., *Automatic lung segmentation in routine imaging is primarily a data diversity problem*, European Radiology (2020) · [lungmask](https://github.com/JoHof/lungmask)
- Transfer initialization: Chen et al., *Med3D: Transfer Learning for 3D Medical Image Analysis* (2019) · [MedicalNet](https://github.com/Tencent/MedicalNet)
- Evaluation cohort: Depeursinge et al., *Building a reference multimedia database for interstitial lung diseases*, CMIG (2012) · [MedGIFT](https://medgift.hevs.ch/wordpress/databases/ild-database/)
- Surface reconstruction: Lorensen & Cline, *Marching Cubes* (SIGGRAPH 1987); Taubin, *Geometric Signal Processing on Polygonal Meshes* (Eurographics 2000)

## Features

- DICOM upload (ZIP or folder) with async inference jobs
- Hierarchical 3D encoder, three Softmax heads: binary screening, fibrotic grouping, five-class pathology mapping
- Volumetric biomarkers: lesion volumes, ILD burden, zonal distribution
- Marching Cubes meshes (GLB) reviewed in 2D, desktop 3D, and WebXR (VR/AR)

## Quick Start

Requirements: **Docker**, or Python **3.11/3.12** + Node.js **20+** + PostgreSQL. NVIDIA GPU optional (`AI_FORCE_CPU=true` for CPU).

Download both weights from [GitHub Releases](https://github.com/rsebany/ILD-XR/releases) into `backend-api/weights/`:

| File | Role |
|------|------|
| `resnet_18.pth` | Med3D initialization (required) |
| `hierarchical.pth` | Default inference checkpoint |

```bash
git clone https://github.com/rsebany/ILD-XR.git
cd ILD-XR
cp .env.example .env          # set ILD_JWT_SECRET for production
# place both .pth files in backend-api/weights/
docker compose up --build -d
```

App: http://localhost:3000 · API docs: http://localhost:8000/docs

### Local development (without Docker)

```bash
createdb ild_xr
cd backend-api
python -m venv venv
.\venv\Scripts\Activate.ps1            # Windows
pip install -r ../requirements.txt
# create backend-api/.env with DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/ild_xr
uvicorn main:app --host 0.0.0.0 --port 8000 --env-file .env
```

```bash
cd frontend
npm install
npm run dev
```

Workflow: sign up, upload a DICOM study, wait for analysis, review in 2D / 3D / WebXR.

## Configuration

Key variables (see [.env.example](.env.example) for all):

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL URL (required for local runs) |
| `ILD_JWT_SECRET` | JWT signing key (production) |
| `NEXT_PUBLIC_API_BASE_URL` | Frontend to API URL |
| `AI_FORCE_CPU` | Force CPU inference |

**WebXR (Quest):** bind `0.0.0.0`, point `NEXT_PUBLIC_API_BASE_URL` at your LAN IP, same Wi-Fi.

## Layout & Docs

```
ILD-XR/
├── frontend/       # Next.js UI + WebXR
├── backend-api/    # FastAPI server + inference services
├── backend-ai/     # Model code (encoder, preprocessing, config)
├── shared/         # Shared model metadata
└── Notebooks/      # Training and ablation notebooks
```

Weights details: [backend-api/weights/README.md](backend-api/weights/README.md) · Contributing: [CONTRIBUTING.md](CONTRIBUTING.md)

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Backend won't start | Check Postgres and `DATABASE_URL` |
| Inference fails | Both `.pth` files in `backend-api/weights/`? |
| Frontend can't reach API | Match `NEXT_PUBLIC_API_BASE_URL` |
| CUDA / TDR errors | `AI_FORCE_CPU=true` or lower `LUNGMASK_BATCH_SIZE` |

## License

Apache License 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).

The WebXR hospital background is third-party [CC BY-NC 4.0](http://creativecommons.org/licenses/by-nc/4.0/) (non-commercial demo): `frontend/public/xr/backgrounds/hospital/license.txt`.

**HUG ILD Database (MedGIFT):** Depeursinge et al., CMIG, 2012.
