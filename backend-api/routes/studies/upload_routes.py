"""Study upload endpoints."""

from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, UploadFile

from auth import TokenPayload, get_current_user, get_owned_study_or_404
from models.db import get_session
from schemas import UploadJobStatus, UploadStudyResponse
from services.studies.analysis_state import MASK_STORAGE
# from services.studies.expert_mask_compare import run_expert_mask_compare_from_upload
from services.studies.upload import get_upload_job_status, upload_study_impl

from .common import (
    BASE_DIR,
    DICOM_STORAGE,
    STATIC_MESH_DIR,
    WEIGHTS_PATH,
    _legacy_patient_json,
)

from services.core.paths import (
    ENCODER_WEIGHTS,
    HIERARCHICAL_WEIGHTS,
    MED3D_WEIGHTS,
    SOFTMAX_WEIGHTS,
    USE_HIERARCHICAL,
)

# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------

router = APIRouter(prefix="/studies", tags=["studies"])
_log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _close_upload_parts(
    file: UploadFile | None,
    files: list[UploadFile] | None,
    *,
    log_label: str,
) -> None:
    if file is not None:
        try:
            await file.close()
        except Exception:
            _log.debug("%s file.close failed", log_label, exc_info=True)
    if files:
        for part in files:
            try:
                await part.close()
            except Exception:
                _log.debug("%s part.close failed", log_label, exc_info=True)


def _build_study_description(
    study_description: str | None,
    modality: str | None,
) -> str | None:
    if not modality:
        return study_description
    description = (study_description or "").strip()
    modality_txt = modality.strip()
    return f"{description} [{modality_txt}]".strip() if description else f"[{modality_txt}]"


# ---------------------------------------------------------------------------
# Expert-mask-compare endpoint — DISABLED (label normalization issues)
# ---------------------------------------------------------------------------
#
# @router.post(
#     "/upload/expert-mask-compare",
#     response_model=ExpertMaskCompareResponse,
#     name="studies_upload_expert_mask_compare",
#     summary="Compare expert mask DICOMs to stored AI prediction",
#     description=(
#         "Upload a ZIP or multiple DICOM slices of an expert label map (0-3 per voxel). "
#         "Volume must match the stored prediction mask shape for ``study_id``."
#     ),
# )
# async def compare_expert_mask_to_prediction(
#     study_id: Annotated[str, Form(description="Existing study id, e.g. ST-abc12345")],
#     file: UploadFile | None = File(
#         default=None,
#         description="ZIP of expert mask DICOMs (omit if sending `files`)",
#     ),
#     files: list[UploadFile] | None = File(
#         default=None,
#         description="Multiple expert mask .dcm/.dicom files",
#     ),
#     current_user: TokenPayload = Depends(get_current_user),
# ) -> ExpertMaskCompareResponse:
#     with get_session() as session:
#         get_owned_study_or_404(session, study_id, current_user)
#
#     try:
#         payload = await run_expert_mask_compare_from_upload(
#             study_id=study_id,
#             mask_storage=MASK_STORAGE,
#             base_tmp=BASE_DIR,
#             file=file,
#             files=files,
#         )
#         return ExpertMaskCompareResponse.model_validate(payload)
#     finally:
#         await _close_upload_parts(file, files, log_label="expert-mask-compare")


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post(
    "/upload",
    response_model=None,
    name="studies_upload_dicom",
    summary="Ingest DICOM, run ILD analysis, persist study",
    description=(
        "Send either a single `file` (.zip) or multiple `files` (.dcm / .dicom). "
        "By default Softmax runs in a background job (`async_analysis=true`) so the "
        "HTTP request returns quickly; poll `GET /studies/upload/jobs/{job_id}`."
    ),
)
async def upload_study(
    file: UploadFile | None = File(
        default=None,
        description="A single .zip of the DICOM series",
    ),
    files: list[UploadFile] | None = File(
        default=None,
        description="DICOM files — multi-select or folder upload",
    ),
    patient_id: Annotated[str | None, Form()] = None,
    patient_name: Annotated[str | None, Form()] = None,
    date_of_birth: Annotated[str | None, Form()] = None,
    study_description: Annotated[str | None, Form()] = None,
    clinical_notes: Annotated[str | None, Form()] = None,
    modality: Annotated[str | None, Form()] = None,
    async_analysis: Annotated[
        bool,
        Form(
            description=(
                "If true (default), return a job_id immediately and run Softmax in the "
                "background. Set false only for short smoke tests."
            )
        ),
    ] = True,
    current_user: TokenPayload = Depends(get_current_user),
) -> UploadStudyResponse | UploadJobStatus:
    patient = _legacy_patient_json(
        patient_id=patient_id,
        patient_name=patient_name,
        date_of_birth=date_of_birth,
        clinical_notes=clinical_notes,
    )
    try:
        return await upload_study_impl(
            base_dir=BASE_DIR,
            static_mesh_dir=STATIC_MESH_DIR,
            weights_path=WEIGHTS_PATH,
            encoder_weights=ENCODER_WEIGHTS,
            softmax_weights=SOFTMAX_WEIGHTS,
            med3d_weights=MED3D_WEIGHTS,
            hierarchical_ckpt=HIERARCHICAL_WEIGHTS if USE_HIERARCHICAL else None,
            mask_storage=MASK_STORAGE,
            dicom_storage=DICOM_STORAGE,
            log_prefix="/studies/upload",
            patient=patient,
            file=file,
            files=files,
            study_description=_build_study_description(study_description, modality),
            async_analysis=async_analysis,
            current_user=current_user,
        )
    finally:
        await _close_upload_parts(file, files, log_label="upload")


@router.get(
    "/upload/jobs/{job_id}",
    response_model=UploadJobStatus,
    name="studies_upload_job_status",
    summary="Poll async DICOM upload / AI analysis job",
)
async def upload_job_status(
    job_id: str,
    current_user: TokenPayload = Depends(get_current_user),
) -> UploadJobStatus:
    _ = current_user
    return get_upload_job_status(job_id)
