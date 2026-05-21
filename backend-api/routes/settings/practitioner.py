from __future__ import annotations

from fastapi import APIRouter, Depends

from auth import get_current_user, TokenPayload
from models.db import get_session
from models.models import SettingsORM
from schemas import PractitionerSettings, PractitionerSettingsUpdate

router = APIRouter(prefix="/settings", tags=["settings"])


def _settings_to_response(row: SettingsORM) -> PractitionerSettings:
    return PractitionerSettings(
        email_on_analysis=row.email_on_analysis,
        in_app_alerts=row.in_app_alerts,
        default_view=row.default_view or "2d",
        unit_measurement=row.unit_measurement or "mm",
        pacs_api_key=row.pacs_api_key,
        pacs_endpoint=row.pacs_endpoint,
    )


# --- Endpoint: GET /settings
@router.get(
    "",
    response_model=PractitionerSettings,
    summary="Get practitioner settings",
    name="settings_get",
)
async def get_settings(
    current_user: TokenPayload = Depends(get_current_user),
) -> PractitionerSettings:
    """
    **Get settings** — create defaults for user on first access.
    """
    user_id = int(current_user.sub)
    with get_session() as session:
        row = session.query(SettingsORM).filter(SettingsORM.user_id == user_id).first()

        if not row:
            row = SettingsORM(
                user_id=user_id,
                email_on_analysis=True,
                in_app_alerts=True,
                default_view="2d",
                unit_measurement="mm",
            )
            session.add(row)
            session.commit()
            session.refresh(row)

    return _settings_to_response(row)


# --- Endpoint: PUT /settings
@router.put(
    "",
    response_model=PractitionerSettings,
    summary="Update practitioner settings",
    name="settings_update",
)
async def save_settings(
    payload: PractitionerSettingsUpdate,
    current_user: TokenPayload = Depends(get_current_user),
) -> PractitionerSettings:
    """
    **Update settings** — partial updates supported.
    """
    user_id = int(current_user.sub)
    with get_session() as session:
        row = session.query(SettingsORM).filter(SettingsORM.user_id == user_id).first()

        if not row:
            row = SettingsORM(user_id=user_id)
            session.add(row)

        update_data = getattr(
            payload, "model_dump", getattr(payload, "dict", lambda **kw: {}))(exclude_unset=True)
        for key, value in update_data.items():
            setattr(row, key, value)

        session.commit()
        session.refresh(row)
        return _settings_to_response(row)
