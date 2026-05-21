from __future__ import annotations

from models.models import UserORM, ROLE_RADIOLOGIST
from schemas import UserResponse

RESET_TOKEN_EXPIRE_HOURS = 1


def user_to_response(u: UserORM) -> UserResponse:
    return UserResponse(
        id=u.id,
        medical_id=u.medical_id,
        full_name=u.full_name,
        email=u.email,
        role=u.role or ROLE_RADIOLOGIST,
    )


def token_data(u: UserORM) -> dict:
    return {
        "sub": str(u.id),
        "email": u.email,
        "role": u.role or ROLE_RADIOLOGIST,
        "medical_id": u.medical_id,
        "full_name": u.full_name,
    }
