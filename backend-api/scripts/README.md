# Backend API scripts

Run from **`backend-api/`** with the project venv active.

```bash
# Verify weights load
python scripts/ai/check_weights.py

# Optional: DICOM → mask smoke test
python scripts/ai/regression_inference.py --dicom-dir path/to/dicoms

# Optional: create a user (needs DATABASE_URL)
python scripts/auth/create_user.py --email you@example.com --full-name "Name" --role radiologist
```

Other tools (`parity_check`, API smoke, Slicer bridge): `python scripts/<path> --help`.

Defaults: weights in `weights/`, API `http://127.0.0.1:8000`. See root [README](../../README.md) to run the platform.
