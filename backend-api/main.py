"""FastAPI application entry: env bootstrap, static mounts, route registration, health."""
from __future__ import annotations

import json
import logging
import os
import socket
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# Environment & paths
# ---------------------------------------------------------------------------

BASE_DIR = Path(__file__).resolve().parent
_load_env = BASE_DIR / ".env"
if _load_env.exists():
    from dotenv import load_dotenv

    load_dotenv(_load_env)

# Bind 0.0.0.0 by default so LAN clients (Quest / headset) can reach the API.
# Frontend: NEXT_PUBLIC_API_BASE_URL=http://<PC_LAN_IP>:<API_PORT>
API_HOST = os.environ.get("API_HOST", "0.0.0.0")
API_PORT = int(os.environ.get("API_PORT", "8000"))


def _lan_api_base_url() -> str:
    """Best-effort ``http://<LAN-IP>:port`` for WebXR / Slicer on Wi‑Fi."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(0.3)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
    except OSError:
        ip = "127.0.0.1"
    return f"http://{ip}:{API_PORT}"


# ---------------------------------------------------------------------------
# Import path (backend-api + optional backend-ai)
# ---------------------------------------------------------------------------

if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

_backend_ai = BASE_DIR.parents[0] / "backend-ai"
if _backend_ai.exists() and str(_backend_ai) not in sys.path:
    sys.path.append(str(_backend_ai))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from models.db import init_db
from routes.admin import router as admin_router
from routes.analytics import router as analytics_router
from routes.auth import router as auth_router
from routes.notifications import router as notifications_router
from routes.patients import router as patients_router
from routes.segmentation_sync import router as segmentation_sync_router
from routes.settings import router as settings_router
from routes.studies import router as studies_router

# ---------------------------------------------------------------------------
# Data directories
# ---------------------------------------------------------------------------

SHARED_DIR = BASE_DIR.parents[0] / "shared"
STATIC_DIR = BASE_DIR / "static"
DATA_DIR = BASE_DIR / "data"

(STATIC_DIR / "meshes").mkdir(parents=True, exist_ok=True)
(DATA_DIR / "dicom").mkdir(parents=True, exist_ok=True)
(DATA_DIR / "masks").mkdir(parents=True, exist_ok=True)

# ---------------------------------------------------------------------------
# Application
# ---------------------------------------------------------------------------

app = FastAPI(
    title="ILD-XR Backend API",
    description=(
        "Clinical AI platform for lung segmentation and WebXR 3D visualization. "
        "**3D Slicer:** push edited labelmaps via "
        "`POST /studies/{study_id}/segmentation-revisions` "
        "(see `scripts/integrations/slicer_bridge.py`, OpenAPI tag **segmentation-sync**). "
        "Mask shape/spacing must match the study DICOM on disk."
    ),
    version="1.0.0",
)


@app.on_event("startup")
def startup_event() -> None:
    """Initialize DB and log LAN / Slicer hints for local development."""
    init_db()
    logging.info("Database tables verified/initialized.")
    if API_HOST in ("0.0.0.0", ""):
        base = _lan_api_base_url()
        logging.info(
            "API reachable on LAN (headset: same Wi-Fi). Set NEXT_PUBLIC_API_BASE_URL=%s",
            base,
        )
        logging.info(
            "3D Slicer: use scripts/integrations/slicer_bridge.py with --api-base %s "
            "or set ILD_API_BASE_URL; push to POST .../studies/{id}/segmentation-revisions",
            base,
        )


# ---------------------------------------------------------------------------
# Static files & CORS
# ---------------------------------------------------------------------------

app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Mask-Shape"],
)

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------

app.include_router(auth_router)
app.include_router(admin_router)
app.include_router(patients_router)
app.include_router(analytics_router)
app.include_router(studies_router)
app.include_router(settings_router)
app.include_router(notifications_router)
app.include_router(segmentation_sync_router)

# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------


@app.get("/health")
async def health_check() -> dict:
    """System status, AI model metadata, XR and Slicer integration hints."""
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
            "hint": (
                "On Quest, point NEXT_PUBLIC_API_BASE_URL to this PC’s LAN address; "
                "keep phone and PC on the same network."
            ),
        },
        "slicer": {
            "api_base": _lan_api_base_url(),
            "segmentation_sync_status": "/studies/{study_id}/segmentation-sync/status",
            "push_revision": "POST /studies/{study_id}/segmentation-revisions",
            "study_events_sse": "GET /studies/{study_id}/events",
            "download_revision_mask": (
                "GET /studies/{study_id}/segmentation-revisions/{revision_id}/mask"
            ),
            "bridge_cli": (
                "python scripts/integrations/slicer_bridge.py "
                "--api-base <URL> --study-id ST-... --mask-npy <path>"
            ),
            "env": "ILD_API_BASE_URL (optional default for the bridge script)",
            "hint": (
                "Export uint8 [Z,Y,X] matching study DICOM; spacing z,y,x in mm. "
                "Same machine: http://127.0.0.1:PORT; remote Slicer: LAN URL as --api-base."
            ),
        },
    }


# ---------------------------------------------------------------------------
# Dev server
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn

    _reload = os.environ.get("API_RELOAD", "1").lower() in ("1", "true", "yes")
    uvicorn.run("main:app", host=API_HOST, port=API_PORT, reload=_reload)
