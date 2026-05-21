# ILD-XR

Interstitial lung disease (ILD) analysis platform: upload chest CT (DICOM), run 3D lung segmentation, explore results in the web app (including WebXR-friendly 3D views).

## Stack

| Area | Technology |
|------|------------|
| Web app | Next.js (App Router), React, TypeScript, Tailwind |
| API | FastAPI, SQLAlchemy, PostgreSQL |
| AI | PyTorch 3D U-Net; preprocessing lives in `backend-ai/` and is loaded by the API |

## Repository layout

- **`frontend/`** — Next.js UI (dashboard, patients, studies, upload, 2D/XR viewer).
- **`backend-api/`** — FastAPI service, database models, routes, `services/dicom` (shared DICOM series I/O for viewer + Slicer sync + AI pipeline), static mesh assets under `static/meshes`, clinical data under `data/`. Git path is lowercase `backend-api/` (not `Backend-api/`).
- **`backend-ai/`** — Model definition (`models/unet3d.py`), CT preprocessing, training-related code used at inference time.
- **`shared/`** — Shared configuration (e.g. `config/model-metadata.json` referenced by `/health`).
- **`requirements.txt`** — Python dependencies for the API and inference (includes PyTorch).

## Prerequisites

- **Python** 3.11 or 3.12 (recommended; must match your PyTorch wheels).
- **Node.js** 20+ (for Next.js 16).
- **PostgreSQL** — SQLite is not supported; a running Postgres instance and a database URL are required.
- **GPU (optional)** — Inference uses CUDA when available; CPU works but is slower for full volumes.

## Installation

### 1. PostgreSQL

Create a database (example name: `ild_db`). Note the host, port, user, password, and database name for `DATABASE_URL`.

### 2. Backend API

From the repository root:

```bash
cd backend-api
python -m venv venv
```

Activate the virtual environment:

- **Windows (PowerShell):** `.\venv\Scripts\Activate.ps1`
- **Windows (cmd):** `venv\Scripts\activate.bat`
- **macOS / Linux:** `source venv/bin/activate`

Install dependencies:

```bash
pip install -r ../requirements.txt
```

**PyTorch and CUDA:** `requirements.txt` points to the CUDA 12.6 PyTorch index. If you do not have an NVIDIA GPU or the install fails, install a [CPU-only](https://pytorch.org/get-started/locally/) `torch` build first, then install the rest of the requirements (you may need to comment out or adjust the `--extra-index-url` and `torch*` lines in `requirements.txt` for your platform).

### 3. Environment variables (backend)

Create **`backend-api/.env`** (or export variables in your shell). Minimum:

```env
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/ild_db
```

Optional (recommended for production):

| Variable | Purpose |
|----------|---------|
| `ILD_JWT_SECRET` | Secret for signing JWTs (defaults to a dev value if unset). |
| `FRONTEND_BASE_URL` | Base URL of the web app (default `http://localhost:3000`), used when building links server-side. |
| `TORCH_NUM_THREADS` | CPU thread count for PyTorch (default `2`). |
| `ILD_PROB_THRESHOLD` | Segmentation probability threshold (default `0.3`). |
| `ILD_API_BASE_URL` | Default API root for `backend-api/scripts/slicer_bridge.py` (falls back to `NEXT_PUBLIC_API_BASE_URL`, then `http://127.0.0.1:8000`). |
| `API_HOST` / `API_PORT` | FastAPI bind address/port when using `python backend-api/main.py` (defaults `0.0.0.0` / `8000`). Use LAN IP + port from another machine. |

### 4. Model weights

Place the trained checkpoint at:

`backend-api/weights/best_80_final.pth`

Upload and analyze routes expect this path. You can sanity-check the file with:

```bash
cd backend-api
python scripts/check_weights.py
```

### 5. Frontend

```bash
cd frontend
npm install
```

Optional: create **`frontend/.env.local`** if the API is not on the default host:

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

(`NEXT_PUBLIC_BACKEND_URL` is also supported.) If unset, the app uses `http://localhost:8000`.

## Run (development)

Start **PostgreSQL**, then:

**Terminal 1 — API (from `backend-api/`):**

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000 --env-file .env
```

Using `--host 0.0.0.0` allows other devices on your LAN to reach the API (useful for WebXR on a headset).

On first startup, the API creates missing tables and ensures the configured database exists (when permissions allow).

**Terminal 2 — Frontend (from `frontend/`):**

```bash
npm run dev
```

- **App:** [http://localhost:3000](http://localhost:3000)
- **API docs (Swagger):** [http://localhost:8000/docs](http://localhost:8000/docs)
- **Health:** [http://localhost:8000/health](http://localhost:8000/health)

Sign up or log in from the UI to use the dashboard and clinical flows.

### Phone access via ngrok (single URL)

If your ngrok free plan allows only one endpoint, expose the frontend only and proxy API calls through Next.js.

1. In `frontend/.env.local`, use:

   ```env
   NEXT_PUBLIC_API_BASE_URL=/api
   ```

2. Ensure `frontend/next.config.ts` contains:

   ```ts
   { source: "/api/:path*", destination: "http://127.0.0.1:8000/:path*" }
   ```

3. Run backend locally on port `8000`, frontend on port `3000`, then:

   ```bash
   ngrok http 3000
   ```

4. Open the generated HTTPS URL on phone (current example):
   - [https://surreal-mystify-enrage.ngrok-free.dev](https://surreal-mystify-enrage.ngrok-free.dev)

This single URL supports both app pages and API requests (signup/login + viewer/AR).

### VR headset (Quest / browser WebXR)

The headset does not connect to FastAPI directly: it opens your **Next.js app** in the browser (e.g. Meta Quest Browser). The browser must reach **both** the frontend and the API on your PC’s **LAN IP** (same Wi‑Fi as the PC).

1. **API:** Run uvicorn with `--host 0.0.0.0 --port 8000`, or from `backend-api/` run `python main.py` (defaults to binding all interfaces on port `8000`).
2. **Frontend URL:** Start Next so the headset can open it by LAN IP, not only `localhost`:

   ```bash
   cd frontend
   npx next dev --hostname 0.0.0.0 --port 3000
   ```

3. **`frontend/.env.local`** — point the client at the API using your PC’s address (replace with your actual LAN IP):

   ```env
   NEXT_PUBLIC_API_BASE_URL=http://192.168.x.x:8000
   ```

4. On the headset, open **`http://192.168.x.x:3000`** (same IP as your dev machine).

5. **Discovery:** `GET http://<LAN-IP>:8000/health` returns JSON with **`xr.api_base_url_for_headset`** (suggested API base URL for this machine) and **`xr.hint`**.

In production, browsers often require **HTTPS** for immersive WebXR; local HTTP over LAN is fine for many dev setups.

### 3D Slicer bridge

The API accepts segmentation revisions from Slicer on **`POST /studies/{study_id}/segmentation-revisions`** (OpenAPI tag **segmentation-sync**). Related routes: sync status, SSE events, and downloading a revision mask—see Swagger at `/docs`.

**Requirements**

- A study must already exist on the server with the same **`study_id`** (e.g. `ST-xxxxxxxx`).
- Exported mask: **`uint8`** NumPy array with shape **`[Z, Y, X]`**, matching the study DICOM volume on disk.
- **`spacing`** as **`z,y,x`** in millimetres must match the loaded volume (the API checks against stored DICOM spacing).

**CLI (from repo root or `backend-api/`)**

```bash
cd backend-api
# Windows (cmd/PowerShell): set ILD_API_BASE_URL=http://127.0.0.1:8000
# macOS / Linux: export ILD_API_BASE_URL=http://127.0.0.1:8000
python scripts/slicer_bridge.py --study-id ST-xxxxxxxx --mask-npy C:/path/mask.npy --spacing 1.2,0.7,0.7
```

- Use **`--api-base http://<API_PC_LAN_IP>:8000`** when Slicer runs on another machine than the API.
- Use **`--urllib`** if the Python environment has no **`requests`** package (stdlib HTTP only).
- **`--watch`** re-pushes when the `.npy` file changes (debounced).

**Reference**

- **`GET /health`** → JSON **`slicer`** lists paths (templates), CLI hint, and **`ILD_API_BASE_URL`**.
- Script reference: **`backend-api/scripts/slicer_bridge.py`** (module docstring includes export/order notes).

## Production-style hints

- Set a strong `ILD_JWT_SECRET` and restrict `CORSMiddleware` `allow_origins` in `backend-api/main.py` to your real frontend origin instead of `*`.
- Serve the Next app with `npm run build` and `npm run start`, behind HTTPS as appropriate.
- Ensure `DATABASE_URL` uses TLS or valid network policies if the database is remote.

## Password reset (development)

The forgot-password flow returns a `reset_url` in the JSON response for local testing; configure email delivery separately if you need production behavior.

## Troubleshooting

- **`DATABASE_URL` missing or invalid** — The app exits on import if `DATABASE_URL` is not set or Postgres is unreachable.
- **Missing weights** — Upload/analyze that run inference will fail until `best_80_final.pth` is present.
- **CORS / wrong API host** — Align `NEXT_PUBLIC_API_BASE_URL` with where `uvicorn` is listening.
- **Headset loads empty API errors** — Use your PC’s LAN IP in `NEXT_PUBLIC_API_BASE_URL`, not `localhost`; bind Next with `--hostname 0.0.0.0`.
- **Slicer push 422** — Mask shape or spacing does not match DICOM on the server; re-export `[Z,Y,X]` and real voxel spacing `z,y,x` in mm.

## Credits

### Dataset description and availability

We used a multimedia collection of cases with interstitial lung diseases (ILDs) built at the **University Hospitals of Geneva (HUG)**. The dataset contains high-resolution computed tomography (HRCT) image series with three-dimensional annotated regions of pathological lung tissue along with clinical parameters from patients with pathologically proven diagnoses of ILDs. The library contains **128 patients** affected with one of the **13 histological diagnoses** of ILDs, **108 image series** with more than **41 liters** of annotated lung tissue patterns, and a comprehensive set of **99 clinical parameters** related to ILDs.

The database is **available for research on request** and after signature of a **license agreement**. A comprehensive description appears in [*Building a reference multimedia database for interstitial lung diseases*](https://www.sciencedirect.com/science/article/abs/pii/S0895611111001017) (Depeursinge *et al.*, *Computerized Medical Imaging and Graphics*, 2012). For access instructions and terms, see the **[ILD database information page](https://medgift.hevs.ch/wordpress/databases/ild-database)**.

### Training data

The example notebook [`notebook/ild-segmentation.ipynb`](notebook/ild-segmentation.ipynb) loads volumes from a convenience path on Kaggle: **[Interstitial Lung Disease](https://www.kaggle.com/datasets/romualdosebany/intertitial-lung-disease)**. If you use that mirror, follow **Kaggle’s terms** and the **dataset license** on the dataset page. It is separate from the HUG research database above; align your use with whichever source you actually obtain data from.

### 3D assets (WebXR / viewer)

These models are used under the terms in each folder’s `license.txt`. Keep the same attribution if you redistribute the app or those files.


**Hospital operating room background** (`frontend/public/xr/backgrounds/hospital/`)

This work is based on [“Charité University Hospital - Operating Room”](https://sketchfab.com/3d-models/charite-university-hospital-operating-room-9ec46c4d615a4581a235eebfb162f574) by [ChrisRE](https://sketchfab.com/ChrisRE), licensed under [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/) (non-commercial; author must be credited).

### Other UI assets

Raster files such as `frontend/public/assets/background.png` and `frontend/public/assets/logo.png` are project UI assets.#   I L D - X R  
 