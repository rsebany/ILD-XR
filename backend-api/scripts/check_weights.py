import sys
from pathlib import Path

import torch


def main() -> None:
    """
    Quick sanity-check for backend-ai UNet3DResidual checkpoint.

    - Verifies that weights file exists.
    - Loads state dict with the same key remapping as services.ai.inference.
    - Prints any missing/unexpected keys when loading into UNet3DResidual.
    - Runs a random forward pass and reports output stats.
    """
    script_dir = Path(__file__).resolve().parent
    # script_dir -> .../backend-api/scripts, parent -> .../backend-api, parent -> .../ILD-XR
    project_root = script_dir.parent.parent

    backend_ai_dir = project_root / "backend-ai"
    weights_path = project_root / "backend-api" / "weights" / "best_multiclass_model.pth"

    if not backend_ai_dir.exists():
        print(f"[ERROR] backend-ai directory not found at {backend_ai_dir}")
        sys.exit(1)

    if not weights_path.exists():
        print(f"[ERROR] Weights file not found at {weights_path}")
        sys.exit(1)

    # Make backend-ai importable
    sys.path.append(str(backend_ai_dir))
    try:
        from models.unet3d import UNet3DResidual  # type: ignore
    except Exception as exc:  # pragma: no cover
        print(f"[ERROR] Failed to import UNet3DResidual from backend-ai: {exc}")
        sys.exit(1)

    print(f"[INFO] Using weights: {weights_path}")

    # Load raw checkpoint (PyTorch 2.6+ defaults weights_only=True; checkpoints need False)
    try:
        state = torch.load(weights_path, map_location="cpu", weights_only=False)
    except TypeError:
        state = torch.load(weights_path, map_location="cpu")
    if isinstance(state, dict) and "state_dict" in state:
        state = state["state_dict"]

    # Apply same remapping logic as backend-api/services/inference.py
    remapped = {}
    for k, v in state.items():
        name = k.replace("module.", "")  # strip DataParallel wrapper
        name = name.replace("final_conv.", "final.")
        remapped[name] = v

    model = UNet3DResidual(in_channels=1, num_classes=4)

    load_result = model.load_state_dict(remapped, strict=False)
    missing = list(load_result.missing_keys)
    unexpected = list(load_result.unexpected_keys)

    print(f"[INFO] Missing keys count: {len(missing)}")
    if missing:
        for k in missing:
            print(f"  MISSING: {k}")

    print(f"[INFO] Unexpected keys count: {len(unexpected)}")
    if unexpected:
        for k in unexpected:
            print(f"  UNEXPECTED: {k}")

    # Simple forward on random tensor to verify model runs
    model.eval()
    x = torch.randn(1, 1, 32, 128, 128)
    with torch.no_grad():
        y = model(x)

    print(f"[INFO] Forward pass OK. Output shape: {tuple(y.shape)}")
    print(f"[INFO] Output stats: min={float(y.min()):.4f}, max={float(y.max()):.4f}")


if __name__ == "__main__":
    main()





