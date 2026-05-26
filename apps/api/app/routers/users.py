from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser, require_company
from app.db.models import User
from app.db.session import get_db
from app.schemas.phase1 import NotificationPreferences, NotificationPreferencesUpdate
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
    if db_user:
        db_user.notification_preferences = prefs
        db.commit()
    return NotificationPreferences(**prefs)
