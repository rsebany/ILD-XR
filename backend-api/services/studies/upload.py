from __future__ import annotations

import json
import logging
import math
import shutil
import uuid
import zipfile
from datetime import date
from pathlib import Path
from typing import Annotated, Any

import numpy as np
from fastapi import Depends, File, Form, HTTPException, UploadFile
from pydantic import ValidationError
from sqlalchemy.exc import IntegrityError

from auth import get_current_user_optional, TokenPayload
from models.db import get_session
from models.models import PatientORM, SegmentationResultORM, StudyORM, XRViewORM
from schemas import Patient, SegmentationResult, Study, UploadStudyResponse, XRView
from services.patients.ids import generate_patient_external_id
from services.ai.inference import (
    DicomInputError,
    compute_class_metrics,
    compute_dice_against_ground_truth,
    estimate_zonal_distribution,
    generate_mesh_glb,
    process_dicom_zip_dir,
)
from services.dicom.series_read import read_sorted_dicom_slices


def _save_mask_to_disk(mask_storage: Path, study_ext_id: str, mask: np.ndarray) -> str:
    mask_storage.mkdir(parents=True, exist_ok=True)
    file_path = mask_storage / f"{study_ext_id}.npy"
    np.save(file_path, mask.astype("uint8"))
    return str(file_path)


def _safe_float(
    value: Any,
    *,
    default: float = 0.0,
    minimum: float = 0.0,
    maximum: float | None = None,
) -> float:
    """Finite, JSON- and Pydantic-friendly floats for API / DB persistence."""
    try:
        v = float(value)
    except (TypeError, ValueError):
        return default
    if not math.isfinite(v):
        return default
    if v < minimum:
        return default
    if maximum is not None and v > maximum:
        return maximum
    return v


def _sanitize_class_metrics(raw: dict[str, Any]) -> dict[str, float]:
    """Coerce segmentation metrics so ORM + ``SegmentationResult`` validators never see NaN/inf."""
    m = {**raw}
    for key in (
        "total_ild_volume_ml",
        "lung_volume_ml",
        "ggo_volume_ml",
        "reticulation_volume_ml",
        "consolidation_volume_ml",
    ):
        m[key] = _safe_float(m.get(key), default=0.0, minimum=0.0)
    for key in ("ggo_burden", "reticulation_burden", "consolidation_burden", "ild_burden"):
        m[key] = _safe_float(m.get(key), default=0.0, minimum=0.0, maximum=1.0)
    return m  # type: ignore[return-value]


def _sanitize_zonal(raw: dict[str, Any]) -> dict[str, float]:
    out: dict[str, float] = {}
    for key in ("Upper", "Middle", "Lower"):
        out[key] = _safe_float(raw.get(key), default=0.0, minimum=0.0, maximum=100.0)
    return out


_PLACEHOLDER_PATIENT_NAMES = frozenset(
    {
        "unknown",
        "unknown patient",
        "patient-unknown",
        "anonymous",
        "anonymized",
        "anonymised",
    }
)


def _is_placeholder_patient_name(value: str | None) -> bool:
    normalized = (value or "").strip().lower()
    return normalized in _PLACEHOLDER_PATIENT_NAMES


def _is_meaningful_patient_name(value: str | None) -> bool:
    return bool((value or "").strip()) and not _is_placeholder_patient_name(value)


def _format_dicom_person_name(value: Any) -> str:
    raw = str(value or "").strip()
    if not raw:
        return ""
    if "^" not in raw:
        return raw
    parts = [part.strip() for part in raw.split("^") if part.strip()]
    if not parts:
        return ""
    # PersonName is commonly Family^Given^Middle^Prefix^Suffix; display human-friendly.
    return " ".join(parts[1:] + parts[:1]).strip()


def _format_dicom_birth_date(value: Any) -> str:
    raw = str(value or "").strip()
    if len(raw) == 8 and raw.isdigit():
        return f"{raw[0:4]}-{raw[4:6]}-{raw[6:8]}"
    return ""


def _registry_patient_display_name(external_id: str | None) -> str | None:
    """Return the name stored for a registry patient when linking by external_id (not from DICOM)."""
    eid = (external_id or "").strip()
    if not eid or eid == "patient-unknown":
        return None
    try:
        with get_session() as session:
            row = session.query(PatientORM).filter(PatientORM.external_id == eid).first()
            if row is None:
                return None
            candidate = (row.name or "").strip()
            if candidate and not _is_placeholder_patient_name(candidate):
                return candidate
    except Exception:
        return None
    return None


def _extract_patient_metadata_from_dicom(temp_dir: Path) -> dict[str, str]:
    try:
        slices = read_sorted_dicom_slices(temp_dir, include_dicom_ext=True)
    except Exception:
        return {}
    if not slices:
        return {}

    first = slices[0]
    patient_id = str(getattr(first, "PatientID", "") or "").strip()
    patient_name = _format_dicom_person_name(getattr(first, "PatientName", ""))
    birth_date = _format_dicom_birth_date(getattr(first, "PatientBirthDate", ""))
    sex = str(getattr(first, "PatientSex", "") or "").strip().upper()[:1]

    payload: dict[str, str] = {}
    if patient_id:
        payload["id"] = patient_id
    if patient_name and not _is_placeholder_patient_name(patient_name):
        payload["name"] = patient_name
    if birth_date:
        payload["dob"] = birth_date
    if sex:
        payload["sex"] = sex
    return payload


def _normalize_dicom_upload(
    file: UploadFile | None,
    files: list[UploadFile] | None,
) -> tuple[UploadFile | None, list[UploadFile] | None]:
    """
    Single source of truth for DICOM input: one .zip *or* multiple DICOMs.

    * **ZIP** — one archive (series often distributed as a single .zip).
    * **Files / "folder"** — browsers have no true folder upload; a directory is sent as
      many `files` parts (e.g. multi-select or `webkitdirectory`). We accept only
      .dcm/.dicom and disambiguate names in the write loop.
    """
    dicom_files = [f for f in (files or []) if f and (f.filename or "").strip()]
    has_zip = file is not None and bool((file.filename or "").strip())
    if has_zip and dicom_files:
        raise HTTPException(
            status_code=400,
            detail="Provide either a .zip in `file` or multiple DICOMs in `files`, not both.",
        )
    if not has_zip and not dicom_files:
        raise HTTPException(
            status_code=400,
            detail="No imaging data. Upload a .zip of DICOMs or multiple .dcm/.dicom files (folder = multi-file).",
        )
    if has_zip and not (file.filename or "").lower().endswith(".zip"):
        raise HTTPException(
            status_code=400,
            detail="Field `file` must be a .zip containing the DICOM series when used.",
        )
    if has_zip:
        return (file, None)
    return (None, dicom_files)


async def upload_study_impl(
    *,
    base_dir: Path,
    static_mesh_dir: Path,
    weights_path: Path,
    mask_storage: Path,
    dicom_storage: Path,
    log_prefix: str,
    patient: Annotated[str, Form(description="JSON: {id, name, dob, sex}")],
    file: Annotated[
        UploadFile | None, File(description="ZIP file containing DICOM slices")
    ] = None,
    files: Annotated[
        list[UploadFile] | None, File(description="Multiple DICOM files (.dcm/.dicom)")
    ] = None,
    study_description: Annotated[str | None, Form()] = None,
    current_user: TokenPayload = Depends(get_current_user_optional),
) -> UploadStudyResponse:
    """Persist a CT study + AI segmentation outputs (ZIP, multiple slices, or folder as multi-file)."""
    if not current_user:
        raise HTTPException(status_code=401, detail="Authentication required to save data.")

    if not weights_path.is_file():
        raise HTTPException(
            status_code=503,
            detail=(
                "AI model weights are not installed on the server. "
                f"Expected file at {weights_path}."
            ),
        )

    file, files = _normalize_dicom_upload(file, files)

    session_id = str(uuid.uuid4())
    request_id = f"upload-{session_id[:8]}"
    temp_dir = base_dir / "tmp" / session_id
    zip_path = base_dir / "tmp" / f"{session_id}.zip"

    try:
        temp_dir.mkdir(parents=True, exist_ok=True)
        if file is not None:
            with zip_path.open("wb") as buffer:
                shutil.copyfileobj(file.file, buffer)

            try:
                with zipfile.ZipFile(zip_path, "r") as zip_ref:
                    zip_ref.extractall(temp_dir)
            except zipfile.BadZipFile:
                raise HTTPException(
                    status_code=400,
                    detail="The uploaded file is not a valid ZIP archive. Please upload a .zip containing a DICOM series.",
                )
        else:
            assert files is not None
            for i, f in enumerate(files):
                raw = f.filename or ""
                leaf = Path(str(raw).replace("\\", "/")).name
                if not leaf.lower().endswith((".dcm", ".dicom")):
                    label = raw or f"file[{i}]"
                    raise HTTPException(
                        status_code=400,
                        detail=f"Unsupported type for {label!r}. Use .dcm or .dicom (folder upload uses multiple parts).",
                    )
                # Prefix with index so folder uploads (same basename in subdirs) do not clobber.
                dest_path = temp_dir / f"{i:04d}_{leaf}"
                with dest_path.open("wb") as out_f:
                    shutil.copyfileobj(f.file, out_f)

        try:
            mask, spacing, volume_hu, lung_mask = process_dicom_zip_dir(temp_dir, weights_path)
        except DicomInputError as e:
            logging.exception(
                "DICOM validation error in %s/upload [request_id=%s]",
                log_prefix,
                request_id,
            )
            raise HTTPException(status_code=400, detail=str(e)) from e
        except ValueError as e:
            logging.exception(
                "DICOM / volume value error in %s/upload [request_id=%s]",
                log_prefix,
                request_id,
            )
            raise HTTPException(
                status_code=400,
                detail=str(e) or "Invalid imaging data for analysis.",
            ) from e
        except Exception:
            logging.exception(
                "Unhandled DICOM processing error in %s/upload [request_id=%s]",
                log_prefix,
                request_id,
            )
            raise HTTPException(
                status_code=500,
                detail=(
                    "Internal DICOM processing error. "
                    f"Please retry or contact support with request_id={request_id}."
                ),
            ) from None

        try:
            class_metrics = compute_class_metrics(mask, spacing, lung_mask=lung_mask)
        except Exception as e:
            logging.exception("compute_class_metrics failed in %s/upload", log_prefix)
            class_metrics = {
                "total_ild_volume_ml": 0.0,
                "lung_volume_ml": 0.0,
                "ggo_volume_ml": 0.0,
                "reticulation_volume_ml": 0.0,
                "consolidation_volume_ml": 0.0,
                "ggo_burden": 0.0,
                "reticulation_burden": 0.0,
                "consolidation_burden": 0.0,
                "ild_burden": 0.0,
            }
            logging.error("Falling back to zero metrics: %s: %s", type(e).__name__, e)

        try:
            zonal_dist = estimate_zonal_distribution(mask)
        except Exception as e:
            logging.exception("estimate_zonal_distribution failed in %s/upload", log_prefix)
            zonal_dist = {"Upper": 0.0, "Middle": 0.0, "Lower": 0.0}
            logging.error("Falling back to empty zonal distribution: %s: %s", type(e).__name__, e)

        try:
            mesh_url = generate_mesh_glb(
                mask, static_mesh_dir, spacing, volume_hu=volume_hu, lung_mask=lung_mask
            )
        except Exception as e:
            logging.exception("generate_mesh_glb failed in %s/upload", log_prefix)
            mesh_url = ""
            logging.error("Falling back to empty mesh_url: %s: %s", type(e).__name__, e)

        class_metrics = _sanitize_class_metrics(class_metrics)
        zonal_dist = _sanitize_zonal(zonal_dist)
        total_vol = float(class_metrics.get("total_ild_volume_ml", 0.0) or 0.0)

        study_ext_id = f"ST-{uuid.uuid4().hex[:8]}"
        dice_score = compute_dice_against_ground_truth(study_ext_id, mask)

        try:
            payload = json.loads(patient)
        except json.JSONDecodeError as e:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid 'patient' JSON payload: {e.msg}",
            ) from e

        dicom_patient = _extract_patient_metadata_from_dicom(temp_dir)
        explicit_patient_id = str(payload.get("id") or "").strip()
        form_incoming_name = str(payload.get("name") or "").strip()
        incoming_dob = str(payload.get("dob") or "").strip()
        incoming_sex = str(payload.get("sex") or "").strip().upper()[:1]

        # Link only when the client sent a registry id (patient picker).
        # New-patient intake must not reuse DICOM PatientID — that would attach
        # the study to whoever already owns that id in the database.
        is_registry_link = bool(
            explicit_patient_id and explicit_patient_id != "patient-unknown"
        )
        if is_registry_link:
            payload["id"] = explicit_patient_id
        else:
            payload["id"] = generate_patient_external_id()

        resolved_id = str(payload.get("id") or "").strip()

        if _is_meaningful_patient_name(form_incoming_name):
            payload["name"] = form_incoming_name
        else:
            registry_link_id = explicit_patient_id if is_registry_link else ""
            registry_name = (
                _registry_patient_display_name(registry_link_id) if registry_link_id else None
            )
            if registry_name:
                payload["name"] = registry_name
            else:
                dicom_name = str(dicom_patient.get("name", "") or "").strip()
                if dicom_name and not _is_placeholder_patient_name(dicom_name):
                    payload["name"] = dicom_name
                else:
                    payload["name"] = resolved_id or "Unknown"
        if not incoming_dob:
            payload["dob"] = dicom_patient.get("dob", "")
        if not incoming_sex:
            payload["sex"] = dicom_patient.get("sex", "U")

        mask_path = _save_mask_to_disk(mask_storage, study_ext_id, mask)

        study_dicom_dir = dicom_storage / study_ext_id
        try:
            shutil.copytree(temp_dir, study_dicom_dir, dirs_exist_ok=True)
        except OSError as exc:
            logging.exception("copytree failed in %s/upload [request_id=%s]", log_prefix, request_id)
            raise HTTPException(
                status_code=500,
                detail=f"Could not persist DICOM files to storage: {exc}",
            ) from exc

        try:
            user_db_id = int(str(current_user.sub).strip())
        except (TypeError, ValueError) as exc:
            raise HTTPException(
                status_code=401,
                detail="Invalid session subject; please sign in again.",
            ) from exc

        try:
            with get_session() as session:
                p_ext_id = payload.get("id") or generate_patient_external_id()
                patient_orm = (
                    session.query(PatientORM).filter(PatientORM.external_id == p_ext_id).first()
                )
                if not patient_orm:
                    dob_value = payload.get("dob")
                    parsed_dob = date(1900, 1, 1)
                    if dob_value:
                        try:
                            parsed_dob = date.fromisoformat(dob_value)
                        except (TypeError, ValueError):
                            parsed_dob = date(1900, 1, 1)

                    patient_orm = PatientORM(
                        external_id=p_ext_id,
                        name=payload.get("name", "Unknown"),
                        date_of_birth=parsed_dob,
                        sex=payload.get("sex", "U"),
                    )
                    session.add(patient_orm)
                    session.flush()
                else:
                    merged_display_name = str(payload.get("name") or "").strip()
                    if _is_meaningful_patient_name(form_incoming_name):
                        patient_orm.name = form_incoming_name
                    elif _is_placeholder_patient_name(patient_orm.name) and _is_meaningful_patient_name(
                        merged_display_name
                    ):
                        patient_orm.name = merged_display_name

                    incoming_dob = str(payload.get("dob") or "").strip()
                    if patient_orm.date_of_birth == date(1900, 1, 1) and incoming_dob:
                        try:
                            patient_orm.date_of_birth = date.fromisoformat(incoming_dob)
                        except (TypeError, ValueError):
                            pass

                    incoming_sex = str(payload.get("sex") or "").strip().upper()[:1]
                    if patient_orm.sex in {"", "U"} and incoming_sex in {"M", "F", "O"}:
                        patient_orm.sex = incoming_sex

                study_orm = StudyORM(
                    external_id=study_ext_id,
                    description=study_description or "AI Analysis",
                    volume_path=str(study_dicom_dir),
                    modality="ct",
                    patient_id=patient_orm.id,
                    user_id=user_db_id,
                )
                session.add(study_orm)
                session.flush()

                ild_burden = float(class_metrics.get("ild_burden", 0.0) or 0.0)
                seg_orm = SegmentationResultORM(
                    external_id=f"SEG-{study_ext_id}",
                    total_ild_volume_ml=total_vol,
                    ild_fraction=ild_burden,
                    lung_volume_ml=class_metrics["lung_volume_ml"],
                    ggo_volume_ml=class_metrics["ggo_volume_ml"],
                    reticulation_volume_ml=class_metrics["reticulation_volume_ml"],
                    consolidation_volume_ml=class_metrics["consolidation_volume_ml"],
                    ggo_burden=class_metrics["ggo_burden"],
                    reticulation_burden=class_metrics["reticulation_burden"],
                    consolidation_burden=class_metrics["consolidation_burden"],
                    zonal_distribution=zonal_dist,
                    mesh_url=mesh_url or "",
                    mask_path=mask_path,
                    study_id=study_orm.id,
                    dice_score=dice_score,
                )
                session.add(seg_orm)
                session.flush()

                xr_orm = XRViewORM(
                    external_id=f"XR-{study_ext_id}",
                    segmentation_id=seg_orm.id,
                )
                session.add(xr_orm)
                session.commit()

                dice_out = (
                    _safe_float(dice_score, default=0.0, minimum=0.0, maximum=100.0)
                    if dice_score is not None
                    else None
                )
                xr_view = XRView(
                    id=xr_orm.external_id,
                    mesh_url=mesh_url or "",
                    clipping_enabled=xr_orm.clipping_enabled,
                )
                seg_model = SegmentationResult(
                    id=seg_orm.external_id,
                    total_ild_volume_ml=_safe_float(seg_orm.total_ild_volume_ml, minimum=0.0),
                    lung_volume_ml=_safe_float(seg_orm.lung_volume_ml, minimum=0.0)
                    if seg_orm.lung_volume_ml is not None
                    else None,
                    ild_burden=_safe_float(seg_orm.ild_fraction, minimum=0.0, maximum=1.0)
                    if seg_orm.ild_fraction is not None
                    else None,
                    ggo_volume_ml=_safe_float(seg_orm.ggo_volume_ml, minimum=0.0)
                    if seg_orm.ggo_volume_ml is not None
                    else None,
                    reticulation_volume_ml=_safe_float(seg_orm.reticulation_volume_ml, minimum=0.0)
                    if seg_orm.reticulation_volume_ml is not None
                    else None,
                    consolidation_volume_ml=_safe_float(
                        seg_orm.consolidation_volume_ml, minimum=0.0
                    )
                    if seg_orm.consolidation_volume_ml is not None
                    else None,
                    ggo_burden=_safe_float(seg_orm.ggo_burden, minimum=0.0, maximum=1.0)
                    if seg_orm.ggo_burden is not None
                    else None,
                    reticulation_burden=_safe_float(
                        seg_orm.reticulation_burden, minimum=0.0, maximum=1.0
                    )
                    if seg_orm.reticulation_burden is not None
                    else None,
                    consolidation_burden=_safe_float(
                        seg_orm.consolidation_burden, minimum=0.0, maximum=1.0
                    )
                    if seg_orm.consolidation_burden is not None
                    else None,
                    zonal_distribution=_sanitize_zonal(seg_orm.zonal_distribution or {}),
                    mesh_url=seg_orm.mesh_url or "",
                    xr_view=xr_view,
                    dice_score=dice_out,
                )
                study_model = Study(
                    id=study_orm.external_id,
                    description=study_orm.description,
                    created_at=study_orm.created_at,
                    modality=study_orm.modality,
                    segmentation=seg_model,
                )
                patient_model = Patient(
                    id=patient_orm.external_id,
                    name=patient_orm.name,
                    dateOfBirth=patient_orm.date_of_birth,
                    notes=patient_orm.notes,
                    studies=[study_model],
                )

            return UploadStudyResponse(study_id=study_ext_id, patient=patient_model)
        except IntegrityError as exc:
            logging.exception(
                "Study persist conflict in %s/upload [request_id=%s]",
                log_prefix,
                request_id,
            )
            raise HTTPException(
                status_code=409,
                detail=(
                    "Could not save this study (duplicate or conflicting data). "
                    "Try another patient identifier or retry."
                ),
            ) from exc
        except ValidationError:
            logging.exception(
                "Response validation failed in %s/upload [request_id=%s]",
                log_prefix,
                request_id,
            )
            raise HTTPException(
                status_code=500,
                detail=(
                    "Analysis finished but the server could not serialize the response. "
                    f"request_id={request_id}"
                ),
            ) from None
    finally:
        # Never let cleanup failures mask a successful response or a raised HTTPException
        # (Windows often raises PermissionError if a handle is still open on temp_dir).
        try:
            if zip_path.exists():
                zip_path.unlink(missing_ok=True)
        except OSError:
            logging.warning(
                "upload temp zip cleanup failed [request_id=%s] path=%s",
                request_id,
                zip_path,
                exc_info=True,
            )
        try:
            if temp_dir.exists():
                shutil.rmtree(temp_dir, ignore_errors=True)
        except OSError:
            logging.warning(
                "upload temp dir cleanup failed [request_id=%s] path=%s",
                request_id,
                temp_dir,
                exc_info=True,
            )
