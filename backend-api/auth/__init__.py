"""
Auth package: passwords, JWT / reset tokens, role matrix, and FastAPI dependencies.
Import from the ``auth`` package as before, e.g. ``from auth import get_current_user``.
"""
from __future__ import annotations

from auth.config import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    ALGORITHM,
    RESET_TOKEN_EXPIRE_HOURS,
    SECRET_KEY,
)
from auth.identifiers import _generate_medical_id
from auth.passwords import hash_password, verify_password
from auth.tokens import (
    TokenPayload,
    create_access_token,
    create_password_reset_token,
    decode_token,
    get_token_payload,
    hash_reset_token,
    verify_reset_token,
)
from auth.roles import ROLES, has_permission
from auth.dependencies import (
    bearer_scheme,
    get_current_user,
    get_current_user_optional,
    require_role,
)

__all__ = [
    "ACCESS_TOKEN_EXPIRE_MINUTES",
    "ALGORITHM",
    "RESET_TOKEN_EXPIRE_HOURS",
    "ROLES",
    "SECRET_KEY",
    "TokenPayload",
    "_generate_medical_id",
    "bearer_scheme",
    "create_access_token",
    "create_password_reset_token",
    "decode_token",
    "get_current_user",
    "get_current_user_optional",
    "get_token_payload",
    "has_permission",
    "hash_password",
    "hash_reset_token",
    "require_role",
    "verify_password",
    "verify_reset_token",
]
