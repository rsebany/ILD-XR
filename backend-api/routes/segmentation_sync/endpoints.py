from __future__ import annotations

import json
from pathlib import Path
from time import perf_counter

import numpy as np
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from models.db import get_session
from models.models import SegmentationResultORM, StudyORM
from services.studies.analysis_state import MASK_STORAGE, _analysis_cache
from services.core.paths import STATIC_MESH_DIR, SYNC_STORAGE
from services.ai.inference import (
    compute_class_metrics,
    estimate_zonal_distribution,
    generate_mesh_glb,
)
from services.sync.events import study_event_hub
from services.sync.segmentation import append_revision, decode_mask, load_manifest
from schemas import (
    SegmentationRevisionCreate,
    SegmentationSyncStatus,
    SegmentationUpdateResponse,
)
from .helpers import as_revision_info, load_dicom_volume_and_spacing, now_utc

router = APIRouter()


# --- Endpoint: GET /studies/{study_id}/segmentation-sync/status
@router.get(
    "/{study_id}/segmentation-sync/status",
    response_model=SegmentationSyncStatus,
    summary="Segmentation sync: latest revision",
    name="seg_sync_status",
)
async def get_segmentation_sync_status(study_id: str) -> SegmentationSyncStatus:
    """
    **Slicer sync status** — manifest: current revision, latest entry metadata.
    """
    manifest = load_manifest(SYNC_STORAGE, study_id)
    revisions = manifest.get("revisions", [])
    latest = as_revision_info(study_id, revisions[-1]) if revisions else None
    return SegmentationSyncStatus(
        study_id=study_id,
        current_revision_id=int(manifest.get("current_revision_id", 0)),
        latest=latest,
    )


# --- Endpoint: POST /studies/{study_id}/segmentation-revisions
@router.post(
    "/{study_id}/segmentation-revisions",
    response_model=SegmentationUpdateResponse,
    summary="Segmentation sync: push new mask revision",
    name="seg_sync_post_revision",
)
async def post_segmentation_revision(
    study_id: str, payload: SegmentationRevisionCreate
) -> SegmentationUpdateResponse:
    """
    **Push Slicer/bridge revision** — validates geometry vs DICOM, updates DB + cache, emits SSE.
    """
    started = perf_counter()
    with get_session() as session:
        exists = session.query(StudyORM).filter(StudyORM.external_id == study_id).first()
    if not exists:
        raise HTTPException(status_code=404, detail="Unknown study_id.")

    shape_zyx = tuple(int(v) for v in payload.geometry.shape_zyx)
    spacing_zyx_mm = tuple(float(v) for v in payload.geometry.spacing_zyx_mm)
    orientation = payload.geometry.orientation.lower().strip()
    if orientation != "zyx":
        raise HTTPException(status_code=422, detail="Only 'zyx' orientation is currently supported.")

    volume_hu, dicom_spacing = load_dicom_volume_and_spacing(study_id)
    if shape_zyx != tuple(int(v) for v in volume_hu.shape):
        raise HTTPException(
            status_code=422,
            detail=f"Mask shape {shape_zyx} does not match DICOM shape {tuple(int(v) for v in volume_hu.shape)}.",
        )
    for requested, actual in zip(spacing_zyx_mm, dicom_spacing):
        if abs(requested - actual) > 0.2:
            raise HTTPException(
                status_code=422,
                detail=f"Spacing mismatch. Received {spacing_zyx_mm}, expected approx {dicom_spacing}.",
            )

    labels = dict(payload.labels)
    required = {"background", "ggo", "reticulation", "consolidation"}
    if set(labels.keys()) != required:
        raise HTTPException(status_code=422, detail=f"labels must contain exactly {sorted(required)}.")

    try:
        mask = decode_mask(payload.mask_b64, shape_zyx)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    manifest = load_manifest(SYNC_STORAGE, study_id)
    latest = manifest.get("revisions", [])[-1] if manifest.get("revisions") else None
    if latest and latest.get("mask_path"):
        latest_mask_path = Path(str(latest["mask_path"]))
        if latest_mask_path.exists():
            previous = np.load(latest_mask_path).astype(np.uint8)
            if previous.shape == mask.shape and np.array_equal(previous, mask):
                raise HTTPException(status_code=409, detail="Revision ignored: mask content is unchanged.")

    revision = append_revision(
        SYNC_STORAGE,
        study_id,
        source=payload.source,
        revision_note=payload.revision_note,
        shape_zyx=shape_zyx,
        spacing_zyx_mm=spacing_zyx_mm,
        orientation=orientation,
        labels=labels,
        mask=mask,
    )

    MASK_STORAGE.mkdir(parents=True, exist_ok=True)
    mask_disk_path = MASK_STORAGE / f"{study_id}.npy"
    np.save(mask_disk_path, mask.astype("uint8"))

    class_metrics = compute_class_metrics(
        mask, dicom_spacing, lung_mask=(mask > 0).astype(np.uint8)
    )
    zonal = estimate_zonal_distribution(mask)
    mesh_url = generate_mesh_glb(
        mask,
        STATIC_MESH_DIR,
        dicom_spacing,
        volume_hu=volume_hu,
        lung_mask=(mask > 0).astype(np.uint8),
    )

    _analysis_cache[study_id] = {
        "mask": mask,
        "mesh_url": mesh_url,
        "volume_total_mm3": float(class_metrics["total_ild_volume_ml"] * 1000.0),
        "ild_fraction": float(class_metrics["ild_burden"]),
        "ild_burden": float(class_metrics["ild_burden"]),
        "zonal_distribution": zonal,
        "lung_volume_ml": class_metrics["lung_volume_ml"],
        "ggo_volume_ml": class_metrics["ggo_volume_ml"],
        "reticulation_volume_ml": class_metrics["reticulation_volume_ml"],
        "consolidation_volume_ml": class_metrics["consolidation_volume_ml"],
        "ggo_burden": class_metrics["ggo_burden"],
        "reticulation_burden": class_metrics["reticulation_burden"],
        "consolidation_burden": class_metrics["consolidation_burden"],
    }

    with get_session() as session:
        study = session.query(StudyORM).filter(StudyORM.external_id == study_id).first()
        if study and study.segmentation:
            seg: SegmentationResultORM = study.segmentation
            seg.total_ild_volume_ml = class_metrics["total_ild_volume_ml"]
            seg.ild_fraction = class_metrics["ild_burden"]
            seg.lung_volume_ml = class_metrics["lung_volume_ml"]
            seg.ggo_volume_ml = class_metrics["ggo_volume_ml"]
            seg.reticulation_volume_ml = class_metrics["reticulation_volume_ml"]
            seg.consolidation_volume_ml = class_metrics["consolidation_volume_ml"]
            seg.ggo_burden = class_metrics["ggo_burden"]
            seg.reticulation_burden = class_metrics["reticulation_burden"]
            seg.consolidation_burden = class_metrics["consolidation_burden"]
            seg.zonal_distribution = zonal
            seg.mesh_url = mesh_url
            seg.mask_path = str(mask_disk_path)
            seg.mask_shape = ",".join(str(v) for v in mask.shape)
            seg.mask_bytes = None
            meta: dict = {"segmentation_sync_revision_id": revision.revision_id}
            if payload.revision_note:
                meta["revision_note"] = payload.revision_note
            if hasattr(seg, "description"):
                seg.description = json.dumps(meta) if meta else None

    manifest = load_manifest(SYNC_STORAGE, study_id)
    if manifest.get("revisions"):
        manifest["revisions"][-1]["mesh_url"] = mesh_url
        with (SYNC_STORAGE / study_id / "manifest.json").open("w", encoding="utf-8") as f:
            json.dump(manifest, f, indent=2)

    event_base = {
        "study_id": study_id,
        "revision_id": revision.revision_id,
        "mesh_url": mesh_url,
        "metrics": class_metrics,
        "zonal_distribution": zonal,
        "ts": now_utc().isoformat(),
        "processing_ms": round((perf_counter() - started) * 1000.0, 2),
    }
    await study_event_hub.publish(study_id, {"event": "segmentation.updated", **event_base})
    await study_event_hub.publish(study_id, {"event": "mesh.updated", **event_base})
    await study_event_hub.publish(study_id, {"event": "metrics.updated", **event_base})

    return SegmentationUpdateResponse(
        study_id=study_id,
        revision_id=revision.revision_id,
        accepted_at=now_utc(),
        mesh_url=mesh_url,
        metrics={k: float(v) for k, v in class_metrics.items()},
    )


# --- Endpoint: GET /studies/{study_id}/segmentation-revisions/{revision_id}/mask
@router.get(
    "/{study_id}/segmentation-revisions/{revision_id}/mask",
    summary="Download revision mask (raw bytes, X-Mask-Shape)",
    name="seg_sync_revision_mask",
)
async def get_segmentation_revision_mask(study_id: str, revision_id: int):
    """
    **Revision mask** — from sync manifest, not the live `.../mask` study route.
    """
    manifest = load_manifest(SYNC_STORAGE, study_id)
    revisions = manifest.get("revisions", [])
    match = next((r for r in revisions if int(r.get("revision_id", 0)) == int(revision_id)), None)
    if not match:
        raise HTTPException(status_code=404, detail="Revision not found.")
    mask_path = Path(str(match.get("mask_path", "")))
    if not mask_path.exists():
        raise HTTPException(status_code=404, detail="Revision mask file missing.")
    arr = np.load(mask_path).astype(np.uint8)
    return StreamingResponse(
        iter([arr.tobytes()]),
        media_type="application/octet-stream",
        headers={"X-Mask-Shape": ",".join(str(int(v)) for v in arr.shape)},
    )


# --- Endpoint: GET /studies/{study_id}/events
@router.get(
    "/{study_id}/events",
    summary="Server-Sent Events: segmentation + mesh + metrics for study",
    name="seg_sync_events_stream",
)
async def stream_study_events(study_id: str):
    """
    **SSE stream** — study-scoped; seed with `segmentation.status` then `study_event_hub` events.
    """

    async def _event_stream():
        status = await get_segmentation_sync_status(study_id)
        yield f"event: segmentation.status\ndata: {status.model_dump_json()}\n\n"
        async for event in study_event_hub.subscribe(study_id):
            yield f"event: {event.get('event', 'message')}\ndata: {json.dumps(event)}\n\n"

    return StreamingResponse(
        _event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )
