"""FastAPI dependencies: Bearer extraction and permission checks."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from auth.roles import has_permission
from auth.tokens import TokenPayload, get_token_payload

# ---------------------------------------------------------------------------
# Security scheme
# ---------------------------------------------------------------------------

bearer_scheme = HTTPBearer(auto_error=False)


# ---------------------------------------------------------------------------
# Current user
# ---------------------------------------------------------------------------


async def get_current_user_optional(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> TokenPayload | None:
    return get_token_payload(credentials)


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> TokenPayload:
    payload = get_token_payload(credentials)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return payload


# ---------------------------------------------------------------------------
# Permission gate
# ---------------------------------------------------------------------------


def require_role(permission: str):
    """Dependency factory: require ``permission`` for the authenticated user."""

    async def _check(
        current_user: Annotated[TokenPayload, Depends(get_current_user)],
    ) -> TokenPayload:
        if not has_permission(current_user.role, permission):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Insufficient permissions: {permission} required",
            )
        return current_user

    return _check


__all__ = [
    "bearer_scheme",
    "get_current_user",
    "get_current_user_optional",
    "require_role",
]
