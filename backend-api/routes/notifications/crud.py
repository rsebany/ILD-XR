from __future__ import annotations
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from auth import get_current_user_optional, TokenPayload
from models.db import get_session
from models.models import NotificationORM
from schemas import Notification, NotificationListResponse, NotificationCreate
from services.notifications.service import orm_to_notification

router = APIRouter(prefix="/notifications", tags=["notifications"])


# --- Endpoint: GET /notifications
@router.get(
    "",
    response_model=NotificationListResponse,
    summary="List notifications",
    name="notifications_list",
)
async def list_notifications(
    limit: int = 20,
    unread_only: bool = False,
    current_user: Optional[TokenPayload] = Depends(get_current_user_optional),
) -> NotificationListResponse:
    """
    **List notifications** — for the current user.
    """
    if not current_user:
        return NotificationListResponse(unread_count=0, notifications=[])

    user_id = int(current_user.sub)

    with get_session() as session:
        query = session.query(NotificationORM).filter(NotificationORM.user_id == user_id)

        unread_count = query.filter(NotificationORM.read_at.is_(None)).count()

        if unread_only:
            query = query.filter(NotificationORM.read_at.is_(None))

        rows = query.order_by(NotificationORM.created_at.desc()).limit(limit).all()
        return NotificationListResponse(
            unread_count=unread_count,
            notifications=[orm_to_notification(r) for r in rows]
        )


# --- Endpoint: PATCH /notifications/{notification_id}/read
@router.patch(
    "/{notification_id}/read",
    summary="Mark notification read",
    name="notifications_mark_read",
)
async def mark_notification_read(
    notification_id: int,
    current_user: Optional[TokenPayload] = Depends(get_current_user_optional),
) -> dict:
    """
    **Mark read** — only own rows.
    """
    from datetime import datetime

    if not current_user:
        raise HTTPException(status_code=401, detail="Authentication required")

    user_id = int(current_user.sub)

    with get_session() as session:
        row = session.query(NotificationORM).filter(NotificationORM.id == notification_id).first()

        if not row:
            raise HTTPException(status_code=404, detail="Notification not found")

        if row.user_id != user_id:
            raise HTTPException(status_code=403, detail="Access denied")

        row.read_at = datetime.utcnow()
        session.commit()

    return {"ok": True}


# --- Endpoint: POST /notifications
@router.post(
    "",
    response_model=Notification,
    status_code=201,
    summary="Create notification for current user",
    name="notifications_create",
)
async def create_notification(
    payload: NotificationCreate,
    current_user: Optional[TokenPayload] = Depends(get_current_user_optional),
) -> Notification:
    """
    **Create** — notification for the authenticated user.
    """
    if not current_user:
        raise HTTPException(status_code=401, detail="Authentication required")

    user_id = int(current_user.sub)

    with get_session() as session:
        n = NotificationORM(
            user_id=user_id,
            title=payload.title,
            message=payload.message or "",
            type=payload.type or "info",
        )
        session.add(n)
        session.commit()
        session.refresh(n)
        return orm_to_notification(n)


# --- Endpoint: DELETE /notifications/{notification_id}
@router.delete(
    "/{notification_id}",
    summary="Delete one notification",
    name="notifications_delete_one",
)
async def delete_notification(
    notification_id: int,
    current_user: Optional[TokenPayload] = Depends(get_current_user_optional),
) -> dict:
    """
    **Delete one** — must belong to the authenticated user.
    """
    if not current_user:
        raise HTTPException(status_code=401, detail="Authentication required")

    user_id = int(current_user.sub)

    with get_session() as session:
        row = (
            session.query(NotificationORM)
            .filter(NotificationORM.id == notification_id)
            .first()
        )
        if not row:
            raise HTTPException(status_code=404, detail="Notification not found")

        if row.user_id != user_id:
            raise HTTPException(status_code=403, detail="Access denied")

        session.delete(row)
        session.commit()

    return {"ok": True}


# --- Endpoint: DELETE /notifications (clear)
@router.delete(
    "",
    summary="Clear all my notifications",
    name="notifications_clear",
)
async def clear_notifications(
    current_user: Optional[TokenPayload] = Depends(get_current_user_optional),
) -> dict:
    """
    **Clear** — all notifications for the current user.
    """
    if not current_user:
        raise HTTPException(status_code=401, detail="Authentication required")

    user_id = int(current_user.sub)

    with get_session() as session:
        deleted = (
            session.query(NotificationORM)
            .filter(NotificationORM.user_id == user_id)
            .delete(synchronize_session=False)
        )
        session.commit()

    return {"ok": True, "deleted": deleted}
