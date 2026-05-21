from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, status

from auth import create_password_reset_token, hash_reset_token, hash_password
from models.db import get_session
from models.models import UserORM, PasswordResetTokenORM
from schemas import ForgotPasswordRequest, ResetPasswordRequest
from .common import RESET_TOKEN_EXPIRE_HOURS

router = APIRouter()


# --- Endpoint: POST /auth/forgot-password
@router.post(
    "/forgot-password",
    summary="Request password reset",
    name="auth_forgot_password",
)
def forgot_password(body: ForgotPasswordRequest):
    """
    **Forgot password** — create reset token.
    """
    with get_session() as session:
        user = session.query(UserORM).filter(UserORM.email == body.email).first()
        if not user:
            return {"message": "If that email is registered, a reset link will be sent."}
        raw_token = create_password_reset_token()
        token_hash = hash_reset_token(raw_token)
        expires_at = datetime.now(timezone.utc) + timedelta(hours=RESET_TOKEN_EXPIRE_HOURS)
        rec = PasswordResetTokenORM(
            user_id=user.id,
            token_hash=token_hash,
            expires_at=expires_at,
        )
        session.add(rec)
    reset_url = f"/auth/reset-password?token={raw_token}"
    return {"message": "If that email is registered, a reset link will be sent.", "reset_url": reset_url}


# --- Endpoint: POST /auth/reset-password
@router.post(
    "/reset-password",
    summary="Complete password reset",
    name="auth_reset_password",
)
def reset_password(body: ResetPasswordRequest):
    """
    **Reset password** — set new password with one-time token.
    """
    with get_session() as session:
        token_hash = hash_reset_token(body.token)
        rec = (
            session.query(PasswordResetTokenORM)
            .filter(
                PasswordResetTokenORM.token_hash == token_hash,
                PasswordResetTokenORM.expires_at > datetime.now(timezone.utc),
            )
            .first()
        )
        if not rec:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid or expired reset token",
            )
        user = session.query(UserORM).filter(UserORM.id == rec.user_id).first()
        if not user:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User not found")
        user.password_hash = hash_password(body.new_password)
        session.delete(rec)
    return {"message": "Password has been reset."}
