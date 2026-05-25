# ILD-XR

Clinical workflow platform for **interstitial lung disease (ILD)** on chest CT: DICOM upload, 3D lung segmentation (PyTorch U-Net), quantitative review, and immersive visualization—including **WebXR** on supported headsets.

## Features

- Patient and study management with role-based access (practitioner / admin)
- Automated 3D segmentation and mesh export for 2D and XR viewers
- Expert mask comparison and segmentation revision sync (3D Slicer bridge)
- Dashboard analytics and DICOM export

## Architecture

| Layer | Stack |
|-------|--------|
| Web | Next.js (App Router), React, TypeScript, Tailwind |
| API | FastAPI, SQLAlchemy, PostgreSQL |
| AI | PyTorch 3D U-Net (`backend-ai/`); inference invoked from `backend-api/` |

| Path | Role |
|------|------|
| `frontend/` | Web UI (dashboard, patients, studies, upload, 2D/XR viewers) |
| `backend-api/` | REST API, DICOM pipeline, auth, static meshes, clinical data |
| `backend-ai/` | Model, preprocessing, training/inference utilities |
| `shared/` | Cross-service config (e.g. `config/model-metadata.json`) |

## Requirements

- Python **3.11** or **3.12**
- Node.js **20+**
- **PostgreSQL** (required; SQLite is not supported)
- NVIDIA GPU optional (CUDA used when available)

## Quick start

### Database

Create a database (e.g. `ild_db`) and note credentials for `DATABASE_URL`.

### Backend

```bash
cd backend-api
python -m venv venv
# Windows: .\venv\Scripts\Activate.ps1  |  macOS/Linux: source venv/bin/activate
pip install -r ../requirements.txt
```

Create `backend-api/.env`:

```env
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/ild_db
```

Place model weights at `backend-api/weights/best_80_final.pth`. Verify with:

```bash
python scripts/ai/check_weights.py
```

Start the API:

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000 --env-file .env
```

Optional env vars: `ILD_JWT_SECRET`, `FRONTEND_BASE_URL`, `TORCH_NUM_THREADS`, `ILD_PROB_THRESHOLD`. See OpenAPI at `/docs` after startup.

### Frontend

```bash
cd frontend
npm install
```

Optional `frontend/.env.local`:

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

```bash
npm run dev
```

- App: http://localhost:3000  
- API docs: http://localhost:8000/docs  
- Health: http://localhost:8000/health  

Sign up or log in from the UI. For admin accounts, use the CLI under `backend-api/scripts/auth/` (details in [`backend-api/scripts/README.md`](backend-api/scripts/README.md)).

### PyTorch note

`requirements.txt` targets the CUDA 12.6 PyTorch index. For CPU-only installs, follow [pytorch.org](https://pytorch.org/get-started/locally/) and adjust `torch` lines in `requirements.txt` as needed.

## Extended setup

**WebXR (Quest / browser)** — The headset loads the Next.js app, not FastAPI directly. Bind both services on `0.0.0.0`, set `NEXT_PUBLIC_API_BASE_URL` to your PC’s **LAN IP** (not `localhost`), and open `http://<LAN-IP>:3000` on the headset. `GET /health` returns `xr.api_base_url_for_headset` and hints. Production WebXR often requires HTTPS.

**LAN / tunnel** — To expose only the frontend (e.g. ngrok), proxy API calls via Next.js (`/api` → `http://127.0.0.1:8000`) and set `NEXT_PUBLIC_API_BASE_URL=/api` in `.env.local`.

**3D Slicer** — Push revised masks with `backend-api/scripts/integrations/slicer_bridge.py`. Masks must be `uint8`, shape `[Z, Y, X]`, with spacing `z,y,x` in mm matching server DICOM. See Swagger tag **segmentation-sync** and [`backend-api/scripts/README.md`](backend-api/scripts/README.md).

## Production

- Set a strong `ILD_JWT_SECRET` and restrict CORS in `backend-api/main.py` to your frontend origin.
- Deploy Next with `npm run build` / `npm run start` behind HTTPS.
- Use TLS or network policies for remote PostgreSQL.

Password reset in development returns a `reset_url` in JSON; configure email for production.

## Troubleshooting

| Issue | Check |
|-------|--------|
| Startup fails | `DATABASE_URL` set and Postgres reachable |
| Inference fails | `best_80_final.pth` present under `backend-api/weights/` |
| API errors from browser | `NEXT_PUBLIC_API_BASE_URL` matches uvicorn host/port |
| Headset cannot load data | LAN IP in env, not `localhost`; Next bound with `--hostname 0.0.0.0` |
| Slicer 422 | Mask shape/spacing matches study DICOM on server |

## Credits & acknowledgments

### Project

**ILD-XR** — developed by **Romualdo SEBANY** ([romualdosebany@gmail.com](mailto:romualdosebany@gmail.com) · [LinkedIn](https://www.linkedin.com/in/romualdo-sebany/)).

### HUG ILD database

This project is informed by the multimedia ILD collection built at the **University Hospitals of Geneva (HUG)**: HRCT series with 3D annotations of pathological lung tissue and clinical parameters for **128 patients** across **13 histological ILD diagnoses** (108 series; 99 clinical parameters). The database is available for **research on request** under a **license agreement**.

- Description: Depeursinge *et al.*, [*Building a reference multimedia database for interstitial lung diseases*](https://www.sciencedirect.com/science/article/abs/pii/S0895611111001017), *Computerized Medical Imaging and Graphics*, 2012  
- Access: [ILD database information page](https://medgift.hevs.ch/wordpress/databases/ild-database)

### Training data (example)

The notebook [`notebook/ild-segmentation.ipynb`](notebook/ild-segmentation.ipynb) may reference the Kaggle dataset [Interstitial Lung Disease](https://www.kaggle.com/datasets/romualdosebany/intertitial-lung-disease). That mirror is separate from the HUG database; comply with **Kaggle terms** and the dataset license on the page you use.

### 3D environment (WebXR)

**Hospital operating room** (`frontend/public/xr/backgrounds/hospital/`) — Based on [“Charité University Hospital - Operating Room”](https://sketchfab.com/3d-models/charite-university-hospital-operating-room-9ec46c4d615a4581a235eebfb162f574) by [ChrisRE](https://sketchfab.com/ChrisRE), [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/). Author must be credited; no commercial use. Full text: `license.txt` in that folder.

### Other assets

Project UI rasters (`frontend/public/assets/`) and additional XR assets follow the licenses in their respective folders. Retain attributions when redistributing the app or bundled assets.
