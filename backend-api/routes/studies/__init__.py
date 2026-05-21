"""
Study-related HTTP routes split by area; combined under prefix `/studies`.
"""
from __future__ import annotations

from fastapi import APIRouter

from . import dicom_export, list_and_metrics, outputs, slice_viewer, upload_routes

# Each sub-router already uses prefix "/studies"; merge without an extra parent prefix.
router = APIRouter()
for _mod in (
    upload_routes,
    list_and_metrics,
    dicom_export,
    outputs,
    slice_viewer,
):
    router.include_router(_mod.router)

__all__ = ["router"]
