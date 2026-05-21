"""DB helpers for in-app notifications (reusable from jobs / future hooks)."""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from models.db import get_session
from models.models import NotificationORM, UserORM
from schemas import Notification


def create_notification_sync(
    title: str,
    message: str = "",
    notif_type: str = "info",
    user_id: Optional[int] = None,
) -> None:
    if user_id is None:
        raise ValueError("user_id is required to create a notification")

    with get_session() as session:
        user_exists = session.query(UserORM.id).filter(UserORM.id == user_id).scalar()
        if not user_exists:
            raise ValueError(f"User {user_id} not found")

        new_notif = NotificationORM(
            title=title,
            message=message,
            type=notif_type,
            user_id=user_id,
        )
        session.add(new_notif)
        session.commit()


def orm_to_notification(n: NotificationORM) -> Notification:
    return Notification(
        id=n.id,
        title=n.title,
        message=n.message or "",
        type=n.type or "info",
        read_at=n.read_at.isoformat() if n.read_at else None,
        created_at=n.created_at.isoformat() if n.created_at else datetime.utcnow().isoformat(),
    )
