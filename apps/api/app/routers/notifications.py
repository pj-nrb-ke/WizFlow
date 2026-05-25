from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser, require_company
from app.db.models import Notification
from app.db.session import get_db
from app.db.models import WorkflowInstance
from app.schemas.request import NotificationCountOut, NotificationOut
from app.services.assignees import user_can_see_inbox

router = APIRouter(prefix="/notifications", tags=["Notifications"])


@router.get("/unread-count", response_model=NotificationCountOut)
def unread_count(
    user: CurrentUser = Depends(require_company),
    db: Session = Depends(get_db),
) -> NotificationCountOut:
    unread = db.scalar(
        select(func.count())
        .select_from(Notification)
        .where(
            Notification.user_id == user.id,
            Notification.company_id == user.company_id,
            Notification.read.is_(False),
        )
    ) or 0
    inbox = 0
    rows = db.scalars(
        select(WorkflowInstance).where(
            WorkflowInstance.company_id == user.company_id,
            WorkflowInstance.status == "in_progress",
        )
    )
    for inst in rows:
        if user_can_see_inbox(inst, user.id):
            inbox += 1
    return NotificationCountOut(unread=unread, inbox=inbox)


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
