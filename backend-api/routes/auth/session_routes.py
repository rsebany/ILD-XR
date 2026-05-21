from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from auth import create_access_token, get_current_user, hash_password, verify_password, _generate_medical_id
from models.db import get_session
from models.models import UserORM, ROLE_RADIOLOGIST
from schemas import AuthResponse, LoginRequest, SignupRequest, UserResponse
from .common import user_to_response, token_data

router = APIRouter()


# --- Endpoint: POST /auth/login
@router.post(
    "/login",
    response_model=AuthResponse,
    summary="Login (JWT)",
    name="auth_login",
)
def login(body: LoginRequest):
    """
    **Login** — email + password; returns access token and user.
    """
    with get_session() as session:
        user = session.query(UserORM).filter(UserORM.email == body.email).first()
        if not user or not verify_password(body.password, user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password",
            )
        token = create_access_token(token_data(user))
        return AuthResponse(access_token=token, token_type="bearer", user=user_to_response(user))


# --- Endpoint: POST /auth/signup
@router.post(
    "/signup",
    response_model=AuthResponse,
    summary="Sign up (JWT)",
    name="auth_signup",
)
def signup(body: SignupRequest):
    """
    **Sign up** — new practitioner account; returns access token and user.
    """
    with get_session() as session:
        if session.query(UserORM).filter(UserORM.email == body.email).first():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered",
            )
        user = UserORM(
            medical_id=_generate_medical_id(),
            full_name=body.full_name,
            email=body.email,
            password_hash=hash_password(body.password),
            role=body.role or ROLE_RADIOLOGIST,
        )
        session.add(user)
        session.flush()
        token = create_access_token(token_data(user))
        return AuthResponse(access_token=token, token_type="bearer", user=user_to_response(user))


# --- Endpoint: GET /auth/me
@router.get(
    "/me",
    response_model=UserResponse,
    summary="Current user profile",
    name="auth_me",
)
def me(current_user=Depends(get_current_user)):
    """
    **Me** — return user claims from the bearer JWT.
    """
    return UserResponse(
        id=int(current_user.sub),
        medical_id=current_user.medical_id,
        full_name=current_user.full_name,
        email=current_user.email,
        role=current_user.role,
    )
