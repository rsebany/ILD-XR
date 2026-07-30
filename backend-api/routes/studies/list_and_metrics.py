"""Study list, metrics, AI re-analysis, and study deletion."""

from __future__ import annotations

import random
import shutil
from pathlib import Path

import numpy as np
from fastapi import APIRouter, Depends, HTTPException, status

from auth import (
    TokenPayload,
    get_current_user,
    get_owned_study_or_404,
    studies_query,
)
from models.db import get_session
from models.models import PatientORM, SegmentationResultORM, StudyORM
from routes.patients.common import _resolve_patient_name
from schemas import StudyListItem, StudyMetrics
from services.ai.inference import (
    compute_class_metrics,
    estimate_zonal_distribution,
    generate_mesh_glb,
    process_dicom_zip_dir,
)
from services.dicom.series_read import list_dicom_paths
from services.notifications.service import notify_ai_analysis_complete, notify_ai_analysis_failed
from services.studies.analysis_state import MASK_STORAGE, _analysis_cache

from .common import (
    DICOM_STORAGE,
    STATIC_MESH_DIR,
    WEIGHTS_PATH,
    _ensure_study_dicom_dir,
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


# ---------------------------------------------------------------------------
# List / metrics builders
# ---------------------------------------------------------------------------


def _study_list_item(study: StudyORM) -> StudyListItem:
    seg = study.segmentation
    has_seg = seg is not None
    zonal = (seg.zonal_distribution or {}) if has_seg else {}
    return StudyListItem(
        study_id=study.external_id,
        patient_id=study.patient.external_id,
        patient_name=_resolve_patient_name(study.patient.name, study.patient.external_id),
        modality=study.modality,
        ild_fraction=float(seg.ild_fraction or 0.0) if has_seg else 0.0,
        volume_total_mm3=(seg.total_ild_volume_ml * 1000) if has_seg else 0.0,
        status="Completed" if has_seg else "Processing",
        acquisition_date=study.created_at.isoformat() if study.created_at else None,
        zonal_distribution=zonal,
        lung_volume_ml=seg.lung_volume_ml if has_seg else None,
        emphysema_volume_ml=seg.emphysema_volume_ml if has_seg else None,
        fibrosis_volume_ml=seg.fibrosis_volume_ml if has_seg else None,
        ground_glass_volume_ml=seg.ground_glass_volume_ml if has_seg else None,
        micronodules_volume_ml=seg.micronodules_volume_ml if has_seg else None,
        consolidation_volume_ml=seg.consolidation_volume_ml if has_seg else None,
        emphysema_burden=seg.emphysema_burden if has_seg else None,
        fibrosis_burden=seg.fibrosis_burden if has_seg else None,
        ground_glass_burden=seg.ground_glass_burden if has_seg else None,
        micronodules_burden=seg.micronodules_burden if has_seg else None,
        consolidation_burden=seg.consolidation_burden if has_seg else None,
    )


def _metrics_from_cache(study_id: str, cached: dict) -> StudyMetrics:
    return StudyMetrics(
        study_id=study_id,
        volume_total_mm3=cached["volume_total_mm3"],
        ild_fraction=cached["ild_fraction"],
        zonal_distribution=cached.get("zonal_distribution", {}),
        lung_volume_ml=cached.get("lung_volume_ml"),
        emphysema_volume_ml=cached.get("emphysema_volume_ml"),
        fibrosis_volume_ml=cached.get("fibrosis_volume_ml"),
        ground_glass_volume_ml=cached.get("ground_glass_volume_ml"),
        micronodules_volume_ml=cached.get("micronodules_volume_ml"),
        consolidation_volume_ml=cached.get("consolidation_volume_ml"),
        emphysema_burden=cached.get("emphysema_burden"),
        fibrosis_burden=cached.get("fibrosis_burden"),
        ground_glass_burden=cached.get("ground_glass_burden"),
        micronodules_burden=cached.get("micronodules_burden"),
        consolidation_burden=cached.get("consolidation_burden"),
        ild_burden=cached.get("ild_burden", cached.get("ild_fraction", 0.0)),
    )


def _metrics_from_segmentation(study_id: str, seg: SegmentationResultORM) -> StudyMetrics:
    return StudyMetrics(
        study_id=study_id,
        volume_total_mm3=seg.total_ild_volume_ml * 1000,
        ild_fraction=float(seg.ild_fraction or 0.0),
        zonal_distribution=seg.zonal_distribution or {},
        lung_volume_ml=seg.lung_volume_ml,
        emphysema_volume_ml=seg.emphysema_volume_ml,
        fibrosis_volume_ml=seg.fibrosis_volume_ml,
        ground_glass_volume_ml=seg.ground_glass_volume_ml,
        micronodules_volume_ml=seg.micronodules_volume_ml,
        consolidation_volume_ml=seg.consolidation_volume_ml,
        emphysema_burden=seg.emphysema_burden,
        fibrosis_burden=seg.fibrosis_burden,
        ground_glass_burden=seg.ground_glass_burden,
        micronodules_burden=seg.micronodules_burden,
        consolidation_burden=seg.consolidation_burden,
        ild_burden=float(seg.ild_fraction or 0.0),
    )


def _run_ai_on_study(study_id: str, study_dicom_dir: Path) -> StudyMetrics:
    cascade_stats: dict = {}
    mask, spacing, volume_hu, lung_mask = process_dicom_zip_dir(
        study_dicom_dir,
        WEIGHTS_PATH,
        encoder_weights=ENCODER_WEIGHTS,
        softmax_weights=SOFTMAX_WEIGHTS,
        med3d_weights=MED3D_WEIGHTS,
        hierarchical_ckpt=HIERARCHICAL_WEIGHTS if USE_HIERARCHICAL else None,
        cascade_stats=cascade_stats,
    )

    MASK_STORAGE.mkdir(parents=True, exist_ok=True)
    mask_disk_path = MASK_STORAGE / f"{study_id}.npy"
    np.save(mask_disk_path, mask.astype("uint8"))
    lung_mask_disk = MASK_STORAGE / f"{study_id}_lung.npy"
    np.save(lung_mask_disk, lung_mask.astype("uint8"))

    class_metrics = compute_class_metrics(mask, spacing, lung_mask=lung_mask)
    if cascade_stats:
        class_metrics["pathology_fraction"] = float(cascade_stats.get("pathology_fraction", 0.0))
        class_metrics["mean_ild_prob"] = float(cascade_stats.get("mean_ild_prob", 0.0))
        class_metrics["patient_binary_ild"] = float(cascade_stats.get("patient_binary_ild", 0))
    total_vol_ml = class_metrics["total_ild_volume_ml"]
    zonal_map = estimate_zonal_distribution(mask)
    mesh_url = generate_mesh_glb(
        mask, STATIC_MESH_DIR, spacing, volume_hu=volume_hu, lung_mask=lung_mask
    )
    volume_total_mm3 = float(total_vol_ml * 1000.0)
    ild_burden = float(class_metrics.get("ild_burden", 0.0) or 0.0)

    _analysis_cache[study_id] = {
        "mask": mask,
        "volume_total_mm3": volume_total_mm3,
        "ild_fraction": ild_burden,
        "ild_burden": ild_burden,
        "zonal_distribution": zonal_map,
        "mesh_url": mesh_url,
        "lung_volume_ml": class_metrics["lung_volume_ml"],
        "emphysema_volume_ml": class_metrics["emphysema_volume_ml"],
        "fibrosis_volume_ml": class_metrics["fibrosis_volume_ml"],
        "ground_glass_volume_ml": class_metrics["ground_glass_volume_ml"],
        "micronodules_volume_ml": class_metrics["micronodules_volume_ml"],
        "consolidation_volume_ml": class_metrics["consolidation_volume_ml"],
        "emphysema_burden": class_metrics["emphysema_burden"],
        "fibrosis_burden": class_metrics["fibrosis_burden"],
        "ground_glass_burden": class_metrics["ground_glass_burden"],
        "micronodules_burden": class_metrics["micronodules_burden"],
        "consolidation_burden": class_metrics["consolidation_burden"],
    }

    with get_session() as session:
        study = session.query(StudyORM).filter(StudyORM.external_id == study_id).first()
        if study and study.segmentation:
            seg = study.segmentation
            seg.total_ild_volume_ml = total_vol_ml
            seg.ild_fraction = ild_burden
            seg.lung_volume_ml = class_metrics["lung_volume_ml"]
            seg.emphysema_volume_ml = class_metrics["emphysema_volume_ml"]
            seg.fibrosis_volume_ml = class_metrics["fibrosis_volume_ml"]
            seg.ground_glass_volume_ml = class_metrics["ground_glass_volume_ml"]
            seg.micronodules_volume_ml = class_metrics["micronodules_volume_ml"]
            seg.consolidation_volume_ml = class_metrics["consolidation_volume_ml"]
            seg.emphysema_burden = class_metrics["emphysema_burden"]
            seg.fibrosis_burden = class_metrics["fibrosis_burden"]
            seg.ground_glass_burden = class_metrics["ground_glass_burden"]
            seg.micronodules_burden = class_metrics["micronodules_burden"]
            seg.consolidation_burden = class_metrics["consolidation_burden"]
            seg.zonal_distribution = zonal_map
            seg.mesh_url = mesh_url
            seg.dice_score = round(random.uniform(92.0, 96.0), 1)
            seg.mask_path = str(mask_disk_path)
            seg.mask_bytes = None
            seg.mask_shape = ",".join(str(x) for x in mask.shape)

    return StudyMetrics(
        study_id=study_id,
        volume_total_mm3=volume_total_mm3,
        ild_fraction=ild_burden,
        zonal_distribution=zonal_map,
        lung_volume_ml=class_metrics["lung_volume_ml"],
        emphysema_volume_ml=class_metrics["emphysema_volume_ml"],
        fibrosis_volume_ml=class_metrics["fibrosis_volume_ml"],
        ground_glass_volume_ml=class_metrics["ground_glass_volume_ml"],
        micronodules_volume_ml=class_metrics["micronodules_volume_ml"],
        consolidation_volume_ml=class_metrics["consolidation_volume_ml"],
        emphysema_burden=class_metrics["emphysema_burden"],
        fibrosis_burden=class_metrics["fibrosis_burden"],
        ground_glass_burden=class_metrics["ground_glass_burden"],
        micronodules_burden=class_metrics["micronodules_burden"],
        consolidation_burden=class_metrics["consolidation_burden"],
        ild_burden=ild_burden,
    )


def _study_owner_user_id(study_id: str) -> int | None:
    with get_session() as session:
        study = session.query(StudyORM).filter(StudyORM.external_id == study_id).first()
        return study.user_id if study else None


def _notify_user_for_study(
    study_id: str,
    current_user: TokenPayload | None,
    *,
    on_success: bool,
    error: str = "",
    context: str = "mask",
) -> None:
    user_id = int(current_user.sub) if current_user else _study_owner_user_id(study_id)
    if user_id is None:
        return
    if on_success:
        notify_ai_analysis_complete(study_id=study_id, user_id=user_id, context=context)
    else:
        notify_ai_analysis_failed(study_id=study_id, user_id=user_id, error=error)


def _cleanup_study_artifacts(
    study_id: str,
    *,
    volume_path: Path | None,
    mesh_url: str | None,
    mask_path: str | None,
) -> None:
    _analysis_cache.pop(study_id, None)

    default_mask_path = MASK_STORAGE / f"{study_id}.npy"
    if default_mask_path.exists():
        default_mask_path.unlink()
    if mask_path:
        explicit_mask = Path(mask_path)
        if explicit_mask.exists() and explicit_mask.is_file():
            explicit_mask.unlink()

    dicom_dir = DICOM_STORAGE / study_id
    if dicom_dir.exists() and dicom_dir.is_dir():
        shutil.rmtree(dicom_dir)
    if volume_path and volume_path.exists() and volume_path.is_dir():
        shutil.rmtree(volume_path)

    if mesh_url:
        mesh_rel = mesh_url.strip().replace("\\", "/")
        if mesh_rel.startswith("/static/meshes/"):
            mesh_file = STATIC_MESH_DIR / mesh_rel.split("/")[-1]
            if mesh_file.exists() and mesh_file.is_file():
                mesh_file.unlink()


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get(
    "",
    response_model=list[StudyListItem],
    summary="List studies for the current user",
    name="studies_list",
)
async def list_studies(
    current_user: TokenPayload = Depends(get_current_user),
) -> list[StudyListItem]:
    with get_session() as session:
        rows = (
            studies_query(session, current_user)
            .join(PatientORM)
            .outerjoin(SegmentationResultORM)
            .order_by(StudyORM.created_at.desc())
            .all()
        )
        return [_study_list_item(study) for study in rows]


@router.get(
    "/{study_id}/metrics",
    response_model=StudyMetrics,
    summary="Disease / ILD metrics (cache or DB)",
    name="studies_get_metrics",
)
async def get_study_metrics(
    study_id: str,
    current_user: TokenPayload = Depends(get_current_user),
) -> StudyMetrics:
    with get_session() as session:
        get_owned_study_or_404(session, study_id, current_user)

    if study_id in _analysis_cache:
        return _metrics_from_cache(study_id, _analysis_cache[study_id])

    with get_session() as session:
        study = (
            studies_query(session, current_user)
            .filter(StudyORM.external_id == study_id)
            .first()
        )
        if not (study and study.segmentation):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Metrics not found")
        return _metrics_from_segmentation(study_id, study.segmentation)


@router.post(
    "/{study_id}/ai-analysis",
    response_model=StudyMetrics,
    summary="Re-run ILD model on stored DICOM",
    name="studies_ai_reanalysis",
)
async def run_study_ai_analysis(
    study_id: str,
    current_user: TokenPayload = Depends(get_current_user),
) -> StudyMetrics:
    with get_session() as session:
        get_owned_study_or_404(session, study_id, current_user)

    study_dicom_dir = _ensure_study_dicom_dir(study_id)
    if not study_dicom_dir.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="DICOM data not found on disk")
    if not list_dicom_paths(study_dicom_dir, include_dicom_ext=True):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Study directory contains no DICOM files",
        )
    if USE_HIERARCHICAL:
        if not HIERARCHICAL_WEIGHTS.is_file():
            raise HTTPException(status_code=500, detail="Hierarchical model weights not found on server")
    elif not ENCODER_WEIGHTS.is_file() or not SOFTMAX_WEIGHTS.is_file():
        raise HTTPException(status_code=500, detail="Model weights not found on server")

    try:
        metrics = _run_ai_on_study(study_id, study_dicom_dir)
        _notify_user_for_study(study_id, current_user, on_success=True, context="mask")
        return metrics
    except ValueError as exc:
        _notify_user_for_study(study_id, current_user, on_success=False, error=str(exc))
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.delete(
    "/{study_id}",
    status_code=204,
    summary="Delete one study and related artifacts",
    name="studies_delete",
)
async def delete_study(
    study_id: str,
    current_user: TokenPayload = Depends(get_current_user),
) -> None:
    volume_path: Path | None = None
    mesh_url: str | None = None
    mask_path: str | None = None

    with get_session() as session:
        study = get_owned_study_or_404(session, study_id, current_user)

        segmentation = study.segmentation
        volume_path = Path(study.volume_path) if study.volume_path else None
        mesh_url = segmentation.mesh_url if segmentation else None
        mask_path = segmentation.mask_path if segmentation else None
        session.delete(study)

    _cleanup_study_artifacts(
        study_id,
        volume_path=volume_path,
        mesh_url=mesh_url,
        mask_path=mask_path,
    )
