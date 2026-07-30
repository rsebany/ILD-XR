# ILD-XR

**ILD-XR** is a clinical workflow platform for **high-recall ILD triage/screening** on chest CT: DICOM upload, hierarchical AI classification, quantitative review, and WebXR visualization.

![ILD-XR platform](frontend/public/assets/platform.png)

## Features

- Hierarchical AI triage (lungmask R231 + HierarchicalEncoder3D, 3 Softmax heads)
- 2D / 3D viewers with pathology overlays and mesh reconstruction
- WebXR review on Meta Quest (WebXR Device API / Three.js)
- Patient/study workflow, role-based access, DICOM export, 3D Slicer bridge

## Architecture

```
Frontend (Next.js :3000) → Backend API (FastAPI :8000) → Postgres (:5432)
                                ↓
                         Backend AI (PyTorch)
```

| Component | Path | Stack |
|-----------|------|-------|
| Frontend | `frontend/` | Next.js, React, Three.js/WebXR |
| Backend API | `backend-api/` | FastAPI, SQLAlchemy, PostgreSQL |
| Backend AI | `backend-ai/` | HierarchicalEncoder3D, lungmask |
| Shared | `shared/` | Model metadata, metrics, figures |

## AI pipeline (summary)

- **Preprocess:** lungmask R231 → isotropic 1 mm HU volume + lung mask
- **Classify:** HierarchicalEncoder3D (Med3D ResNet-18 + SE), patches `(16,64,64)`, stride `(4,8,8)`
- **Heads:** binary (primary triage) · 3-class · 5-class pathology (biomarker maps, not standalone diagnosis)

| Checkpoint | Role |
|------------|------|
| `resnet_18.pth` | Med3D init (required) |
| `hierarchical_fold0.pth` | Default inference (all heads) |

Place weights in `backend-api/weights/` (not in git). Download from [GitHub Releases](https://github.com/rsebany/ILD-XR/releases) or your training export. See [backend-api/weights/README.md](backend-api/weights/README.md). Override with `ILD_INFER_FOLD` / `ILD_HIERARCHICAL_WEIGHTS`.

Upload runs Softmax in a **background job** by default (`async_analysis=true`): the browser POST returns a `job_id` after DICOM ingest, then polls `GET /studies/upload/jobs/{job_id}` until analysis finishes — so long Softmax no longer drops the upload connection.

Published metrics: `shared/config/evaluation-metrics.json` · `GET /health`.

## Requirements

- Python **3.11** or **3.12** · Node.js **20+** · **PostgreSQL**
- NVIDIA GPU optional (CPU fallback supported)

## Quick Start (Local)

```bash
# Database
createdb ild_xr

# Backend
cd backend-api
python -m venv venv
# Windows: .\venv\Scripts\Activate.ps1  |  macOS/Linux: source venv/bin/activate
pip install -r ../requirements.txt
```

Create `backend-api/.env`:

```env
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/ild_xr
```

Place weights in `backend-api/weights/`, then:

```bash
# No --reload during AI uploads: WatchFiles restart drops long Softmax POSTs ("Failed to fetch").
# Or: python main.py  (API_RELOAD defaults to 0; set API_RELOAD=1 only for non-AI iteration)
uvicorn main:app --host 0.0.0.0 --port 8000 --env-file .env

# Frontend (new terminal)
cd frontend
npm install
npm run dev
```

- App: http://localhost:3000 · API docs: http://localhost:8000/docs · Health: http://localhost:8000/health
- Do not save files under `backend-api/` while Softmax is running if you enabled reload.

## Docker

```bash
git clone https://github.com/rsebany/ILD-XR.git
cd ILD-XR
cp .env.example .env   # set ILD_JWT_SECRET for production
cp /path/to/resnet_18.pth /path/to/hierarchical_fold0.pth backend-api/weights/
docker compose up --build -d
curl http://localhost:8000/health
```

Services: frontend `:3000`, backend-api `:8000`, postgres `:5432`.  
Useful: `docker compose logs -f backend-api` · `docker compose down`

## Environment

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL URL |
| `ILD_JWT_SECRET` | Prod | JWT signing key |
| `ILD_HIERARCHICAL_WEIGHTS` | No | Hierarchical checkpoint path |
| `ILD_MED3D_WEIGHTS` | No | Med3D init path |
| `ILD_INFER_FOLD` | No | Fold index (default `0` → `hierarchical_fold0.pth`) |
| `ILD_INFER_MAX_PATCHES` | No | Softmax patch cap (default `8000` for published recall/precision; `400` smoke only) |
| `ILD_INFER_CLEANUP_EVERY` | No | `torch.cuda.empty_cache` every N Softmax patches (default `64`) |
| `API_RELOAD` | No | Uvicorn `--reload` when running `python main.py` (default `0`) |
| `AI_FORCE_CPU` | No | Force CPU inference |
| `NEXT_PUBLIC_API_BASE_URL` | No | Frontend → API URL (default `http://localhost:8000`) |

## Extended setup

- **WebXR (Quest):** bind on `0.0.0.0`, set `NEXT_PUBLIC_API_BASE_URL` to your LAN IP, open the app on the headset.
- **Phone AR:** needs HTTPS (`npm run dev:phone` in `frontend/` or an HTTPS tunnel). Android Chrome only.
- **3D Slicer:** `backend-api/scripts/integrations/slicer_bridge.py` — `uint8 [Z,Y,X]` mask matching study spacing.
- **Tunnel:** proxy `/api` → backend and set `NEXT_PUBLIC_API_BASE_URL=/api`.

## Evaluation

Notebooks under [`Experimentations/`](Experimentations/) (see that README for env vars):

- `01_hierarchical_ild.ipynb` — training + CV
- `02_phase2_finetune.ipynb` — Phase 2 fine-tuning
- `03_hierarchical_ablation.ipynb` — ablations

```bash
python backend-api/scripts/ai/check_weights.py
python backend-api/scripts/ai/regression_inference.py --dicom-dir path/to/dicoms
```

## Layout

```
ILD-XR/
├── Experimentations/   # Training / evaluation notebooks
├── frontend/           # Next.js app
├── backend-api/        # FastAPI + inference
├── backend-ai/         # Model definitions
├── shared/             # Config, metrics, figures
├── docker-compose.yml
└── requirements.txt
```

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Backend won't start | Check `DATABASE_URL` and Postgres |
| Inference fails | Weights present in `backend-api/weights/`? |
| Frontend can't reach API | Match `NEXT_PUBLIC_API_BASE_URL` to the API |
| WebXR fails | Use LAN IP (not localhost); same Wi-Fi |
| CUDA error | `AI_FORCE_CPU=true` |

## Citation

```bibtex
@misc{sebany2026ildxr,
  title={Patient-Level Hierarchical 3D Deep Learning for ILD Screening with Volumetric Biomarkers},
  author={Sebany, Romualdo and Benbelkacem, Samir and Ykhlef, Hadjer and Ykhlef, Faycal and Masmoudi, Mostefa},
  year={2026},
  note={Manuscript in preparation},
  howpublished={\url{https://github.com/rsebany/ILD-XR}}
}
```

## License

Apache License 2.0 — see [LICENSE](LICENSE) and [NOTICE](NOTICE).

The WebXR hospital OR background is a third-party [CC BY-NC 4.0](http://creativecommons.org/licenses/by-nc/4.0/) asset (non-commercial demo only): [`frontend/public/xr/backgrounds/hospital/license.txt`](frontend/public/xr/backgrounds/hospital/license.txt).

## Credits

**ILD-XR** — **Romualdo SEBANY** ([email](mailto:romualdosebany@gmail.com) · [LinkedIn](https://www.linkedin.com/in/romualdo-sebany/)).

**WebXR environment:** ["Charité University Hospital - Operating Room"](https://sketchfab.com/3d-models/charite-university-hospital-operating-room-9ec46c4d615a4581a235eebfb162f574) by [ChrisRE](https://sketchfab.com/ChrisRE), [CC BY-NC 4.0](http://creativecommons.org/licenses/by-nc/4.0/).

**HUG ILD Database (MedGIFT):** Depeursinge *et al.*, [*Building a reference multimedia database for interstitial lung diseases*](https://www.sciencedirect.com/science/article/abs/pii/S0895611111001017), *CMIG*, 2012. Access: [medgift.hevs.ch](https://medgift.hevs.ch/wordpress/databases/ild-database).
