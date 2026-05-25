#!/usr/bin/env python3
"""Smoke test POST /studies/{id}/segmentation-revisions latency with a synthetic mask."""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import numpy as np
import requests

_SCRIPTS_ROOT = Path(__file__).resolve().parents[1]
if str(_SCRIPTS_ROOT) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_ROOT))

from common.paths import default_api_base
from common.segmentation_sync import build_revision_payload, parse_shape_zyx, parse_spacing_zyx


def make_mask(shape: tuple[int, int, int]) -> np.ndarray:
    z, y, x = shape
    arr = np.zeros(shape, dtype=np.uint8)
    arr[z // 4 : z // 2, y // 4 : y // 2, x // 4 : x // 2] = 1
    arr[z // 2 : (3 * z) // 4, y // 3 : (2 * y) // 3, x // 3 : (2 * x) // 3] = 2
    return arr


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Smoke test Slicer sync endpoint latency."
    )
    parser.add_argument("--api-base", default=default_api_base())
    parser.add_argument("--study-id", required=True)
    parser.add_argument("--shape", default="32,128,128", help="z,y,x")
    parser.add_argument("--spacing", default="1,1,1", help="z,y,x mm")
    args = parser.parse_args()

    shape = parse_shape_zyx(args.shape)
    spacing = parse_spacing_zyx(args.spacing)
    mask = make_mask(shape)
    payload = build_revision_payload(
        mask,
        spacing,
        source="manual",
        revision_note="sync smoke test",
    )

    url = f"{args.api_base.rstrip('/')}/studies/{args.study_id}/segmentation-revisions"
    t0 = time.perf_counter()
    res = requests.post(url, json=payload, timeout=180)
    elapsed_ms = round((time.perf_counter() - t0) * 1000.0, 2)
    print(f"HTTP {res.status_code} in {elapsed_ms} ms")
    try:
        print(json.dumps(res.json(), indent=2))
    except Exception:
        print(res.text)
    return 0 if res.ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
