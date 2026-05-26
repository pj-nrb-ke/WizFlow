from datetime import datetime, timezone

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser, require_company
from app.db.models import DevicePushToken, User
from app.db.session import get_db
from app.schemas.phase1 import NotificationPreferences, NotificationPreferencesUpdate
from app.schemas.request import PushTokenRegister
from app.services.company_settings import DEFAULT_NOTIFICATION_PREFERENCES, user_notification_preferences

router = APIRouter(prefix="/users", tags=["Users"])


@router.patch("/me/preferences", response_model=NotificationPreferences)
def update_notification_preferences(
    body: NotificationPreferencesUpdate,
    user: CurrentUser = Depends(require_company),
    db: Session = Depends(get_db),
) -> NotificationPreferences:
    db_user = db.get(User, user.id)
    prefs = user_notification_preferences(db_user) if db_user else dict(DEFAULT_NOTIFICATION_PREFERENCES)
    if body.email is not None:
        prefs["email"] = body.email
    if body.in_app is not None:
        prefs["in_app"] = body.in_app
    if body.push is not None:
        prefs["push"] = body.push
    if body.whatsapp is not None:
        prefs["whatsapp"] = body.whatsapp
    if db_user:
        db_user.notification_preferences = prefs
        db.commit()
    return NotificationPreferences(**prefs)


@router.post("/push-token", status_code=status.HTTP_204_NO_CONTENT)
def register_push_token(
    body: PushTokenRegister,
    user: CurrentUser = Depends(require_company),
    db: Session = Depends(get_db),
) -> None:
    existing = db.scalar(select(DevicePushToken).where(DevicePushToken.token == body.token))
    now = datetime.now(timezone.utc)
    if existing:
        existing.user_id = user.id
        existing.company_id = user.company_id
        existing.platform = body.platform
        existing.updated_at = now
    else:
        db.add(
            DevicePushToken(
                user_id=user.id,
                company_id=user.company_id,
                token=body.token.strip(),
                platform=body.platform,
            )
        )
    db.commit()
