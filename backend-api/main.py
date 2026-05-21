from __future__ import annotations
import json
import logging
import os
import socket
import sys
from pathlib import Path

# 1. Environment and Path Configuration
BASE_DIR = Path(__file__).resolve().parent
_load_env = BASE_DIR / ".env"
if _load_env.exists():
    from dotenv import load_dotenv
    load_dotenv(_load_env)

# Host/port: bind 0.0.0.0 (default) so the API is reachable on your LAN (Quest / headset browser
# to this PC’s IP). In frontend .env: NEXT_PUBLIC_API_BASE_URL=http://<PC_LAN_IP>:<API_PORT>
API_HOST = os.environ.get("API_HOST", "0.0.0.0")
# Use API_PORT only (not PORT — Next.js often sets PORT=3000 and would clash).
API_PORT = int(os.environ.get("API_PORT", "8000"))


def _lan_api_base_url() -> str:
    """Best-effort http://<this-machine-LAN-IP>:port for WebXR/headset clients on Wi‑Fi."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(0.3)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
    except OSError:
        ip = "127.0.0.1"
    return f"http://{ip}:{API_PORT}"

# Ensure this app's package root is first so "models" and "routes" resolve to backend-api
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

# Ensure the AI backend is accessible for inference services
_backend_ai = BASE_DIR.parents[0] / "backend-ai"
if _backend_ai.exists() and str(_backend_ai) not in sys.path:
    sys.path.append(str(_backend_ai))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from models.db import init_db
from routes.auth import router as auth_router
from routes.patients import router as patients_router
from routes.analytics import router as analytics_router
from routes.studies import router as studies_router
from routes.settings import router as settings_router
from routes.notifications import router as notifications_router
from routes.segmentation_sync import router as segmentation_sync_router

# 2. Directory initialization (BASE_DIR set above for sys.path)
SHARED_DIR = BASE_DIR.parents[0] / "shared"
STATIC_DIR = BASE_DIR / "static"
DATA_DIR = BASE_DIR / "data"

# Auto-create essential clinical data directories
(STATIC_DIR / "meshes").mkdir(parents=True, exist_ok=True)
(DATA_DIR / "dicom").mkdir(parents=True, exist_ok=True)
(DATA_DIR / "masks").mkdir(parents=True, exist_ok=True)

# 3. FastAPI App Setup for Swagger documentation
app = FastAPI(
    title="ILD-XR Backend API",
    description=(
        "Clinical AI platform for lung segmentation and WebXR 3D visualization. "
        "**3D Slicer:** push edited labelmaps via `POST /studies/{study_id}/segmentation-revisions` "
        "(see `scripts/slicer_bridge.py`, OpenAPI tag **segmentation-sync**). "
        "Mask shape/spacing must match the study DICOM on disk."
    ),
    version="1.0.0",
)

@app.on_event("startup")
def startup_event():
    """Initializes database and ensures logging is ready."""
    init_db()
    logging.info("Database tables verified/initialized.")
    if API_HOST in ("0.0.0.0", ""):
        base = _lan_api_base_url()
        logging.info(
            "API reachable on LAN (headset: same Wi-Fi). Set NEXT_PUBLIC_API_BASE_URL=%s",
            base,
        )
        logging.info(
            "3D Slicer: use scripts/slicer_bridge.py with --api-base %s "
            "or set ILD_API_BASE_URL; push to POST .../studies/{id}/segmentation-revisions",
            base,
        )

# 4. Middleware & Static Files
# Mount /static so frontend can access generated .glb files
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

# Enable CORS for development (Replace "*" with frontend URL for production)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Mask-Shape"],
)

# 5. Route Registration
app.include_router(auth_router)
app.include_router(patients_router)
app.include_router(analytics_router)
app.include_router(studies_router)
app.include_router(settings_router)
app.include_router(notifications_router)
app.include_router(segmentation_sync_router)

@app.get("/health")
async def health_check():
    """System status and AI model metadata."""
    model_meta_path = SHARED_DIR / "config" / "model-metadata.json"
    ai_model_name = "unknown"
    if model_meta_path.exists():
        try:
            with model_meta_path.open("r", encoding="utf-8") as f:
                meta = json.load(f)
            ai_model_name = meta.get("model_name", ai_model_name)
        except Exception:
            logging.exception("Failed to read model-metadata.json")

    return {
        "status": "online",
        "infrastructure": "ready",
        "ai_model": ai_model_name,
        "storage": "connected",
        "xr": {
            "api_bind": f"{API_HOST}:{API_PORT}",
            "api_base_url_for_headset": _lan_api_base_url(),
            "hint": "On Quest, point NEXT_PUBLIC_API_BASE_URL (and your dev server URL) to this PC’s LAN address; keep phone and PC on the same network.",
        },
        "slicer": {
            "api_base": _lan_api_base_url(),
            "segmentation_sync_status": "/studies/{study_id}/segmentation-sync/status",
            "push_revision": "POST /studies/{study_id}/segmentation-revisions",
            "study_events_sse": "GET /studies/{study_id}/events",
            "download_revision_mask": "GET /studies/{study_id}/segmentation-revisions/{revision_id}/mask",
            "bridge_cli": "python scripts/slicer_bridge.py --api-base <URL> --study-id ST-... --mask-npy <path>",
            "env": "ILD_API_BASE_URL (optional default for the bridge script)",
            "hint": "Export a uint8 [Z,Y,X] labelmap matching the study DICOM; use real spacing z,y,x (mm) from the volume. Same machine: http://127.0.0.1:PORT; remote Slicer: use this PC's LAN URL as --api-base.",
        },
    }

if __name__ == "__main__":
    import uvicorn

    # 0.0.0.0: listen on all interfaces so devices on the same Wi‑Fi (e.g. Quest) can call this API.
    # Optional: API_HOST=127.0.0.1 API_RELOAD=0  for local-only.
    _reload = os.environ.get("API_RELOAD", "1").lower() in ("1", "true", "yes")
    uvicorn.run("main:app", host=API_HOST, port=API_PORT, reload=_reload)