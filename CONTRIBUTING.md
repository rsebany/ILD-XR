# Contributing to ILD-XR

Thank you for your interest in contributing to **ILD-XR**, a clinical workflow
platform for interstitial lung disease (ILD) on chest CT.

## Before you start

- Read the [README](README.md) for architecture, setup, and credits.
- This project is released under the [CC BY-NC 4.0](LICENSE) license: **no
  commercial use** and **attribution to Romualdo SEBANY** is required when the
  software or derivatives are used or shared.
- Third-party assets (3D models, datasets, UI rasters) may have their own
  licenses — see [Credits & acknowledgments](README.md#credits--acknowledgments)
  in the README.

## Ways to contribute

- **Bug reports** — Describe steps to reproduce, expected vs. actual behavior,
  and your environment (OS, Python/Node versions, GPU if relevant).
- **Feature suggestions** — Open an issue explaining the clinical or technical
  need and how it fits the existing architecture.
- **Code changes** — Prefer small, focused pull requests tied to an issue when
  possible.

## Development setup

1. Follow [Quick start](README.md#quick-start) in the README.
2. Use **Python 3.11+**, **Node.js 20+**, and **PostgreSQL**.
3. Run backend and frontend locally before submitting changes.
4. For training notebooks under `Experimentations/`, set `ILD_MEDGIFT_ROOT`,
   `ILD_LUNG_MASK_BASE`, and `ILD_MODELS_DIR` (never commit patient data or
   machine-local path files).

## Pull request guidelines

1. **Scope** — One logical change per PR when practical.
2. **Style** — Match existing patterns in the touched area (`frontend/`,
   `backend-api/`, `backend-ai/`, `Experimentations/`).
3. **Tests** — Add or update tests when behavior changes (`backend-api/tests/`
   where applicable).
4. **Documentation** — Update the README or inline docs if setup, APIs, or
   user-facing behavior changes.
5. **Secrets** — Never commit `.env`, credentials, model weights (`.pth`), or
   patient data. Keep `venv/` local.

## Commit messages

Use clear, imperative subjects, for example:

- `fix: correct DICOM spacing in slicer bridge`
- `feat: add worklist filter by study date`

## Code of conduct

Be respectful and constructive. This project involves medical imaging software;
avoid sharing real patient data in issues, PRs, or public channels.

## Questions

For questions about the project or licensing, contact:

**Romualdo SEBANY** — [romualdosebany@gmail.com](mailto:romualdosebany@gmail.com)

## License of contributions

By contributing, you agree that your contributions will be licensed under the
same [CC BY-NC 4.0](LICENSE) terms as the rest of the project, with copyright
retained by you for your original work and the project maintaining attribution
to all contributors as appropriate.
