from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser, require_company
from app.db.models import Notification
from app.db.session import get_db
from app.schemas.request import NotificationOut

router = APIRouter(prefix="/notifications", tags=["Notifications"])


@router.get("", response_model=list[NotificationOut])
def list_notifications(
    user: CurrentUser = Depends(require_company),
    db: Session = Depends(get_db),
) -> list[Notification]:
    return list(
        db.scalars(
            select(Notification)
            .where(Notification.user_id == user.id, Notification.company_id == user.company_id)
            .order_by(Notification.created_at.desc())
            .limit(50)
        )
    )


@router.post("/{notification_id}/read", status_code=status.HTTP_204_NO_CONTENT)
def mark_read(
    notification_id: UUID,
    user: CurrentUser = Depends(require_company),
    db: Session = Depends(get_db),
) -> None:
    db.execute(
        update(Notification)
        .where(
            Notification.id == notification_id,
            Notification.user_id == user.id,
        )
        .values(read=True)
    )
    db.commit()
