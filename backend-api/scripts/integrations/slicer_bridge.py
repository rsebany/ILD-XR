#!/usr/bin/env python3
"""
Lightweight 3D Slicer bridge client.

Pushes a uint8 labelmap in [Z, Y, X] order to the ILD-XR API (must match the study
DICOM volume shape and spacing on the server). Default API URL: env ``ILD_API_BASE_URL``,
else ``NEXT_PUBLIC_API_BASE_URL``, else ``http://127.0.0.1:8000``.

**3D Slicer workflow (typical)**
1. Load the same study DICOM the web app used (or ensure volume matches ``study_id`` on server).
2. Edit the segmentation labelmap; ensure labels 0–3 align with background / ggo / reticulation / consolidation.
3. Export the labelmap to a 3D numpy array, save as ``.npy`` with shape ``(Z, Y, X)`` in uint8.
4. Run:
   ``python scripts/integrations/slicer_bridge.py --study-id ST-... --mask-npy /path/mask.npy --spacing z,y,x``

**From Slicer's Python console (no ``requests``):** add ``backend-api`` to ``sys.path``, import
``push_revision_urllib`` / ``build_revision_payload``, then call with your ``study_id`` and mask array.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

import numpy as np
import requests

_SCRIPTS_ROOT = Path(__file__).resolve().parents[1]
if str(_SCRIPTS_ROOT) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_ROOT))

from common.paths import default_api_base
from common.segmentation_sync import build_revision_payload, parse_spacing_zyx


def read_mask(mask_path: Path) -> np.ndarray:
    arr = np.load(mask_path).astype(np.uint8)
    if arr.ndim != 3:
        raise ValueError("Mask must be a 3D uint8 array in [Z,Y,X].")
    return arr


def push_revision(
    api_base: str, study_id: str, payload: dict[str, Any], timeout_s: int = 120
) -> dict[str, Any]:
    url = f"{api_base.rstrip('/')}/studies/{study_id}/segmentation-revisions"
    resp = requests.post(url, json=payload, timeout=timeout_s)
    if not resp.ok:
        raise RuntimeError(f"Sync failed ({resp.status_code}): {resp.text}")
    return resp.json()


def push_revision_urllib(
    api_base: str, study_id: str, payload: dict[str, Any], timeout_s: int = 120
) -> dict[str, Any]:
    """Stdlib-only POST (for 3D Slicer embedded Python without ``requests``)."""
    url = f"{api_base.rstrip('/')}/studies/{study_id}/segmentation-revisions"
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json; charset=utf-8"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout_s) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            if not (200 <= resp.status < 300):
                raise RuntimeError(f"Sync failed ({resp.status}): {raw}")
            return json.loads(raw)
    except urllib.error.HTTPError as exc:
        err = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Sync failed ({exc.code}): {err}") from exc


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Push Slicer-edited segmentation to ILD-XR backend."
    )
    parser.add_argument(
        "--api-base",
        default=default_api_base(),
        help="ILD-XR API root (default: ILD_API_BASE_URL, else NEXT_PUBLIC_API_BASE_URL, else 127.0.0.1:8000)",
    )
    parser.add_argument(
        "--urllib",
        action="store_true",
        help="Use stdlib HTTP instead of requests (Slicer Python / minimal env).",
    )
    parser.add_argument("--study-id", required=True)
    parser.add_argument(
        "--mask-npy",
        required=True,
        help="Path to exported [Z,Y,X] uint8 labelmap .npy",
    )
    parser.add_argument("--spacing", default="1,1,1", help="Voxel spacing in mm as z,y,x")
    parser.add_argument("--note", default="slicer live edit")
    parser.add_argument(
        "--watch",
        action="store_true",
        help="Watch file changes and push revisions continuously.",
    )
    parser.add_argument("--debounce-ms", type=int, default=700)
    args = parser.parse_args()

    spacing = parse_spacing_zyx(args.spacing)
    mask_path = Path(args.mask_npy)
    if not mask_path.is_file():
        print(f"[ERROR] Mask not found: {mask_path}")
        return 1

    push = push_revision_urllib if args.urllib else push_revision

    if not args.watch:
        mask = read_mask(mask_path)
        payload = build_revision_payload(
            mask, spacing, source="slicer_bridge", revision_note=args.note
        )
        result = push(args.api_base, args.study_id, payload)
        print(json.dumps(result, indent=2))
        return 0

    print(f"[bridge] watching {mask_path} for changes...")
    last_mtime = 0.0
    while True:
        try:
            mtime = mask_path.stat().st_mtime
            if mtime > last_mtime:
                last_mtime = mtime
                time.sleep(max(args.debounce_ms, 100) / 1000.0)
                mask = read_mask(mask_path)
                payload = build_revision_payload(
                    mask, spacing, source="slicer_bridge", revision_note=args.note
                )
                result = push(args.api_base, args.study_id, payload)
                print(
                    f"[bridge] pushed revision={result.get('revision_id')} "
                    f"mesh={result.get('mesh_url')}"
                )
        except KeyboardInterrupt:
            print("[bridge] stopped")
            break
        except Exception as exc:  # noqa: BLE001
            print(f"[bridge] error: {exc}")
            time.sleep(1.0)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
