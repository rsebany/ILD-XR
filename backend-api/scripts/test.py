import os
import sys
from pathlib import Path

import requests

# Path(__file__) is .../backend-api/scripts/test.py
SCRIPT_DIR = Path(__file__).resolve().parent
BACKEND_API_PATH = SCRIPT_DIR.parent

# POST /studies/upload — same handler for ZIP or multiple DICOMs (requires auth).
API_URL = "http://127.0.0.1:8000/studies/upload"

# Zip you mentioned: backend-api/tmp/118/scan_118_download.zip
ZIP_PATH = BACKEND_API_PATH / "tmp" / "118" / "scan_118_download.zip"


def main() -> None:
    if not ZIP_PATH.exists():
        print(f"ZIP not found at {ZIP_PATH}")
        sys.exit(1)

    token = os.environ.get("BEARER_TOKEN", "").strip()
    if not token:
        print("Set BEARER_TOKEN to a valid JWT (same as the browser session) to call /studies/upload.")
        sys.exit(1)

    headers = {"Authorization": f"Bearer {token}"}
    print(f"Sending {ZIP_PATH} to {API_URL} ...")

    with ZIP_PATH.open("rb") as f:
        files = {"file": ("scan_118_download.zip", f, "application/zip")}
        try:
            resp = requests.post(
                API_URL, files=files, headers=headers, timeout=600
            )
        except Exception as e:
            print(f"Request failed: {e}")
            sys.exit(1)

    print(f"Status: {resp.status_code}")
    try:
        print("JSON response:")
        print(resp.json())
    except Exception:
        print("Non-JSON response body:")
        print(resp.text)


if __name__ == "__main__":
    main()
