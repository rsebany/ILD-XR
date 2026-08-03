# ILD-XR

**ILD-XR** is an open platform for **patient-level ILD screening** on chest CT: DICOM upload, hierarchical 3D AI, quantitative review, and browser WebXR.

## Requirements

- **Docker** (recommended), **or** Python **3.11/3.12** + Node.js **20+** + PostgreSQL  
- NVIDIA GPU optional (`AI_FORCE_CPU=true` for CPU)

## Model weights

Download from [GitHub Releases](https://github.com/rsebany/ILD-XR/releases) (or your training export) into `backend-api/weights/`:

| File | Role |
|------|------|
| `resnet_18.pth` | Med3D init (required) |
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

## Run locally

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

## First use

1. Open the app and sign up / log in  
2. Upload a DICOM study (ZIP or folder flow in the UI)  
3. Wait for analysis to finish (upload returns a job; the UI polls until done)  
4. Review **2D**, **3D**, and optional **WebXR**

## Environment

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

## Repo layout

```
ILD-XR/
├── frontend/          # Next.js UI + WebXR
├── backend-api/       # FastAPI + inference
├── backend-ai/        # Model code (loaded by API)
├── shared/            # Shared model metadata
├── Experimentations/  # Training notebooks (optional)
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

## Citation

```bibtex
@misc{sebany2026ildxr,
  title={Patient-Level Hierarchical 3D Deep Learning for ILD Screening with Volumetric Biomarkers},
  author={Sebany, Romualdo et al.},
  year={2026},
  note={Manuscript in preparation},
  howpublished={\url{https://github.com/rsebany/ILD-XR}}
}
```

## License

Apache License 2.0 — see [LICENSE](LICENSE) and [NOTICE](NOTICE).

WebXR hospital OR background is third-party [CC BY-NC 4.0](http://creativecommons.org/licenses/by-nc/4.0/) (non-commercial demo): `frontend/public/xr/backgrounds/hospital/license.txt`.

## Credits

**ILD-XR** — Romualdo SEBANY ([email](mailto:romualdosebany@gmail.com) · [LinkedIn](https://www.linkedin.com/in/romualdo-sebany/)).

**WebXR environment:** ["Charité University Hospital - Operating Room"](https://sketchfab.com/3d-models/charite-university-hospital-operating-room-9ec46c4d615a4581a235eebfb162f574) by [ChrisRE](https://sketchfab.com/ChrisRE), [CC BY-NC 4.0](http://creativecommons.org/licenses/by-nc/4.0/).

**HUG ILD Database (MedGIFT):** Depeursinge *et al.*, *CMIG*, 2012 — [medgift.hevs.ch](https://medgift.hevs.ch/wordpress/databases/ild-database).
