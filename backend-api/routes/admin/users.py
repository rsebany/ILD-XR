"""Admin user directory (read-only; passwords via CLI scripts)."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from auth import require_role
from auth.tokens import TokenPayload
from models.db import get_session
from models.models import UserORM
from schemas import AdminUserListItem

router = APIRouter()


@router.get(
    "/users",
    response_model=list[AdminUserListItem],
    summary="List practitioner accounts",
    name="admin_list_users",
)
def list_users(
    _admin: TokenPayload = Depends(require_role("user_management")),
) -> list[AdminUserListItem]:
    """Accounts without password hashes — for the admin dashboard."""
    with get_session() as session:
        rows = (
            session.query(UserORM)
            .order_by(UserORM.created_at.desc(), UserORM.id.desc())
            .all()
        )
        return [
            AdminUserListItem(
                id=u.id,
                medical_id=u.medical_id,
                full_name=u.full_name,
                email=u.email,
                role=u.role,
                created_at=u.created_at,
            )
            for u in rows
        ]
