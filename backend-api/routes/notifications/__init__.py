"""
In-app notification CRUD. Programmatic create: `services.notifications.service.create_notification_sync`.
"""
from __future__ import annotations

from . import crud
from services.notifications.service import create_notification_sync

router = crud.router

__all__ = ["router", "create_notification_sync"]
