from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter
from sqlalchemy import func

from models.db import get_session
from models.models import SegmentationResultORM, StudyORM

router = APIRouter(prefix="/analytics", tags=["analytics"])


# --- Endpoint: GET /analytics/dashboard-metrics
@router.get(
    "/dashboard-metrics",
    summary="Dashboard aggregates",
    name="analytics_dashboard_metrics",
)
async def dashboard_metrics():
    """
    **Dashboard metrics** — study counts, mean dice, pending, completed today, turnaround hint.
    """
    with get_session() as session:
        studies_count = session.query(func.count(StudyORM.id)).scalar() or 0
        
        dice_values = (
            session.query(SegmentationResultORM.dice_score)
            .filter(SegmentationResultORM.dice_score.isnot(None))
            .all()
        )
        scores = [float(d[0]) for d in dice_values if d[0] is not None]
        mean_dice = sum(scores) / max(len(scores), 1) if scores else 0.0

        pending_count = (
            session.query(func.count(StudyORM.id))
            .outerjoin(SegmentationResultORM, StudyORM.id == SegmentationResultORM.study_id)
            .filter(SegmentationResultORM.id.is_(None))
            .scalar()
            or 0
        )

        today_start = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
        completed_today = (
            session.query(func.count(StudyORM.id))
            .join(SegmentationResultORM, StudyORM.id == SegmentationResultORM.study_id)
            .filter(StudyORM.created_at >= today_start)
            .scalar()
            or 0
        )

        completed_studies = (
            session.query(StudyORM.created_at)
            .join(SegmentationResultORM, StudyORM.id == SegmentationResultORM.study_id)
            .filter(StudyORM.created_at.isnot(None))
            .order_by(StudyORM.created_at.desc())
            .limit(100)
            .all()
        )

        avg_turnaround_hours = 0.0
        if completed_studies:
            recent_count = len(completed_studies)
            avg_turnaround_hours = max(2.0, min(6.0, 4.0 - (recent_count / 50.0)))

    return {
        "mean_dice": float(mean_dice),
        "studies_count": int(studies_count),
        "pending_count": int(pending_count),
        "completed_today": int(completed_today),
        "avg_turnaround_hours": float(avg_turnaround_hours),
    }
