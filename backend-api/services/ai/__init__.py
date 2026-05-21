"""3D ILD classification pipeline (DICOM → U-Net → metrics / mesh).

Prefer importing the stable facade :mod:`services.ai.inference`, or a submodule
(``dicom_pipeline``, ``metrics``, ``sliding_window``, etc.) for new code.
"""
from __future__ import annotations
