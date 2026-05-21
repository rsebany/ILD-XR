from __future__ import annotations

import argparse
import base64
import json
import time

import numpy as np
import requests


def make_mask(shape: tuple[int, int, int]) -> np.ndarray:
    z, y, x = shape
    arr = np.zeros(shape, dtype=np.uint8)
    arr[z // 4 : z // 2, y // 4 : y // 2, x // 4 : x // 2] = 1
    arr[z // 2 : (3 * z) // 4, y // 3 : (2 * y) // 3, x // 3 : (2 * x) // 3] = 2
    return arr


def main() -> None:
    parser = argparse.ArgumentParser(description="Smoke test Slicer sync endpoint latency.")
    parser.add_argument("--api-base", default="http://localhost:8000")
    parser.add_argument("--study-id", required=True)
    parser.add_argument("--shape", default="32,128,128", help="z,y,x")
    parser.add_argument("--spacing", default="1,1,1", help="z,y,x mm")
    args = parser.parse_args()

    shape = tuple(int(v.strip()) for v in args.shape.split(","))
    spacing = [float(v.strip()) for v in args.spacing.split(",")]
    mask = make_mask(shape)

    payload = {
        "source": "manual",
        "revision_note": "sync smoke test",
        "geometry": {
            "shape_zyx": list(shape),
            "spacing_zyx_mm": spacing,
            "orientation": "zyx",
        },
        "labels": {
            "background": 0,
            "ggo": 1,
            "reticulation": 2,
            "consolidation": 3,
        },
        "mask_b64": base64.b64encode(mask.tobytes()).decode("ascii"),
    }

    url = f"{args.api_base.rstrip('/')}/studies/{args.study_id}/segmentation-revisions"
    t0 = time.perf_counter()
    res = requests.post(url, json=payload, timeout=180)
    elapsed_ms = round((time.perf_counter() - t0) * 1000.0, 2)
    print(f"HTTP {res.status_code} in {elapsed_ms} ms")
    try:
        print(json.dumps(res.json(), indent=2))
    except Exception:
        print(res.text)


if __name__ == "__main__":
    main()

