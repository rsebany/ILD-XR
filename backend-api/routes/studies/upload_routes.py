from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, UploadFile

from auth import get_current_user, TokenPayload
from schemas import ExpertMaskCompareResponse, UploadStudyResponse
from services.studies.expert_mask_compare import run_expert_mask_compare_from_upload
from services.studies.upload import upload_study_impl
from services.studies.analysis_state import MASK_STORAGE

from .common import (
    BASE_DIR,
    DICOM_STORAGE,
    STATIC_MESH_DIR,
    WEIGHTS_PATH,
    _legacy_patient_json,
)

router = APIRouter(prefix="/studies", tags=["studies"])


@router.post(
    "/upload/expert-mask-compare",
    response_model=ExpertMaskCompareResponse,
    name="studies_upload_expert_mask_compare",
    summary="Compare expert mask DICOMs to stored AI prediction",
    description=(
        "Upload a ZIP or multiple DICOM slices of an **expert / reference label map** (0–3 per voxel, "
        "same convention as AI: 0=background, 1=GGO, 2=reticulation, 3=consolidation). "
        "Slices are sorted by ``ImagePositionPatient`` like the CT series. "
        "The volume must match the shape of the prediction mask already stored for ``study_id``."
    ),
)
async def compare_expert_mask_to_prediction(
    study_id: Annotated[str, Form(description="Existing study id, e.g. ST-abc12345")],
    file: UploadFile | None = File(
        default=None,
        description="ZIP of expert mask DICOMs (omit if sending `files`)",
    ),
    files: list[UploadFile] | None = File(
        default=None,
        description="Multiple expert mask .dcm/.dicom files",
    ),
    _: TokenPayload = Depends(get_current_user),
) -> ExpertMaskCompareResponse:
    try:
        payload = await run_expert_mask_compare_from_upload(
            study_id=study_id,
            mask_storage=MASK_STORAGE,
            base_tmp=BASE_DIR,
            file=file,
            files=files,
        )
        return ExpertMaskCompareResponse.model_validate(payload)
    finally:
        if file is not None:
            try:
                await file.close()
            except Exception:
                logging.getLogger(__name__).debug(
                    "expert-mask-compare file.close failed", exc_info=True
                )
        if files:
            for part in files:
                try:
                    await part.close()
                except Exception:
                    logging.getLogger(__name__).debug(
                        "expert-mask-compare part.close failed", exc_info=True
                    )


@router.post(
    "/upload",
    response_model=UploadStudyResponse,
    name="studies_upload_dicom",
    summary="Ingest DICOM, run ILD analysis, persist study",
    description=(
        "One endpoint for all DICOM intakes. Send **either** a single `file` (`.zip` of a series) "
        "**or** multiple `files` (`.dcm` / `.dicom`). A browser “folder” is the same as multiple `files`."
    ),
)
async def upload_study(
    file: UploadFile | None = File(
        default=None,
        description="A single .zip of the DICOM series (omit if sending `files`)",
    ),
    files: list[UploadFile] | None = File(
        default=None,
        description="Any number of DICOM files — multi-select, folder, or one-by-one (omit if sending a .zip in `file`)",
    ),
    patient_id: Annotated[str | None, Form()] = None,
    patient_name: Annotated[str | None, Form()] = None,
    date_of_birth: Annotated[str | None, Form()] = None,
    study_description: Annotated[str | None, Form()] = None,
    clinical_notes: Annotated[str | None, Form()] = None,
    modality: Annotated[str | None, Form()] = None,
    current_user: TokenPayload = Depends(get_current_user),
) -> UploadStudyResponse:
    patient = _legacy_patient_json(
        patient_id=patient_id,
        patient_name=patient_name,
        date_of_birth=date_of_birth,
        clinical_notes=clinical_notes,
    )

    description = study_description
    if modality:
        description = (description or "").strip()
        modality_txt = modality.strip()
        description = f"{description} [{modality_txt}]".strip() if description else f"[{modality_txt}]"

    try:
        return await upload_study_impl(
            base_dir=BASE_DIR,
            static_mesh_dir=STATIC_MESH_DIR,
            weights_path=WEIGHTS_PATH,
            mask_storage=MASK_STORAGE,
            dicom_storage=DICOM_STORAGE,
            log_prefix="/studies/upload",
            patient=patient,
            file=file,
            files=files,
            study_description=description,
            current_user=current_user,
        )
    finally:
        # Release multipart spool handles (reduces Windows file-lock issues during temp cleanup).
        if file is not None:
            try:
                await file.close()
            except Exception:
                logging.getLogger(__name__).debug("upload file.close failed", exc_info=True)
        if files:
            for part in files:
                try:
                    await part.close()
                except Exception:
                    logging.getLogger(__name__).debug("upload part.close failed", exc_info=True)
