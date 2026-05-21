from __future__ import annotations

from fastapi import HTTPException, status
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def _normalize_password(plain: str) -> str:
    """
    Bcrypt only accepts passwords up to 72 bytes.
    Enforce a safe limit and return a helpful 400 instead of 500.
    """
    if len(plain.encode("utf-8")) > 72:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password is too long. Maximum length is 72 characters.",
        )
    return plain


def verify_password(plain: str, hashed: str) -> bool:
    normalized = _normalize_password(plain)
    return pwd_context.verify(normalized, hashed)


def hash_password(plain: str) -> str:
    normalized = _normalize_password(plain)
    return pwd_context.hash(normalized)
