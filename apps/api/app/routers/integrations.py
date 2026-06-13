"""Admin: API keys, webhooks, security audit logs."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser, require_roles
from app.db.models import ApiKey, WebhookDelivery, WebhookEndpoint
from app.db.session import get_db
from app.schemas.integrations import (
    ApiKeyCreate,
    ApiKeyCreated,
    ApiKeyOut,
    SecurityAuditOut,
    WebhookCreate,
    WebhookCreated,
    WebhookDeliveryOut,
    WebhookOut,
)
from app.services import api_keys as api_key_service
from app.services.security_audit import list_security_logs, log_security_event
from app.services.webhooks import WEBHOOK_EVENTS, generate_webhook_secret, send_test_event

router = APIRouter(prefix="/admin/integrations", tags=["Integrations"])

ADMIN_ONLY = ("company_admin",)


@router.get("/api-keys", response_model=list[ApiKeyOut])
def list_api_keys(
    user: CurrentUser = Depends(require_roles(*ADMIN_ONLY)),
    db: Session = Depends(get_db),
) -> list[ApiKey]:
    return list(
        db.scalars(
            select(ApiKey).where(ApiKey.company_id == user.company_id).order_by(ApiKey.created_at.desc())
        )
    )


@router.post("/api-keys", response_model=ApiKeyCreated, status_code=status.HTTP_201_CREATED)
def create_api_key(
    body: ApiKeyCreate,
    user: CurrentUser = Depends(require_roles(*ADMIN_ONLY)),
    db: Session = Depends(get_db),
) -> ApiKeyCreated:
    try:
        row, full = api_key_service.create_api_key(
            db,
            company_id=user.company_id,
            name=body.name,
            service_user_id=body.service_user_id,
            created_by=user.id,
            scopes=body.scopes,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    log_security_event(
        db,
        action="api_key.created",
        company_id=user.company_id,
        actor_user_id=user.id,
        resource_type="api_key",
        resource_id=str(row.id),
        detail={"name": row.name, "prefix": row.key_prefix},
    )
    db.commit()
    db.refresh(row)
    return ApiKeyCreated(
        id=row.id,
        name=row.name,
        key_prefix=row.key_prefix,
        scopes=list(row.scopes or []),
        service_user_id=row.service_user_id,
        is_active=row.is_active,
        created_at=row.created_at,
        last_used_at=row.last_used_at,
        api_key=full,
    )


@router.delete("/api-keys/{key_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_api_key(
    key_id: UUID,
    user: CurrentUser = Depends(require_roles(*ADMIN_ONLY)),
    db: Session = Depends(get_db),
) -> None:
    row = db.get(ApiKey, key_id)
    if not row or row.company_id != user.company_id:
        raise HTTPException(status_code=404, detail="API key not found")
    row.is_active = False
    log_security_event(
        db,
        action="api_key.revoked",
        company_id=user.company_id,
        actor_user_id=user.id,
        resource_type="api_key",
        resource_id=str(key_id),
    )
    db.commit()


@router.get("/webhooks", response_model=list[WebhookOut])
def list_webhooks(
    user: CurrentUser = Depends(require_roles(*ADMIN_ONLY)),
    db: Session = Depends(get_db),
) -> list[WebhookEndpoint]:
    return list(
        db.scalars(
            select(WebhookEndpoint)
            .where(WebhookEndpoint.company_id == user.company_id)
            .order_by(WebhookEndpoint.created_at.desc())
        )
    )


@router.get("/webhook-events")
def list_webhook_event_types(
    user: CurrentUser = Depends(require_roles(*ADMIN_ONLY)),
) -> dict:
    return {"events": list(WEBHOOK_EVENTS)}


@router.post("/webhooks", response_model=WebhookCreated, status_code=status.HTTP_201_CREATED)
def create_webhook(
    body: WebhookCreate,
    user: CurrentUser = Depends(require_roles(*ADMIN_ONLY)),
    db: Session = Depends(get_db),
) -> WebhookCreated:
    secret = generate_webhook_secret()
    row = WebhookEndpoint(
        company_id=user.company_id,
        name=body.name.strip()[:120],
        url=body.url.strip()[:500],
        secret=secret,
        events=body.events,
        created_by=user.id,
        is_active=True,
    )
    db.add(row)
    db.flush()
    log_security_event(
        db,
        action="webhook.created",
        company_id=user.company_id,
        actor_user_id=user.id,
        resource_type="webhook",
        resource_id=str(row.id),
        detail={"name": row.name, "url": row.url},
    )
    db.commit()
    db.refresh(row)
    return WebhookCreated(
        id=row.id,
        name=row.name,
        url=row.url,
        events=list(row.events or []),
        is_active=row.is_active,
        created_at=row.created_at,
        signing_secret=secret,
    )


@router.delete("/webhooks/{webhook_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_webhook(
    webhook_id: UUID,
    user: CurrentUser = Depends(require_roles(*ADMIN_ONLY)),
    db: Session = Depends(get_db),
) -> None:
    row = db.get(WebhookEndpoint, webhook_id)
    if not row or row.company_id != user.company_id:
        raise HTTPException(status_code=404, detail="Webhook not found")
    db.delete(row)
    db.commit()


@router.post("/webhooks/{webhook_id}/test", response_model=WebhookDeliveryOut)
def test_webhook(
    webhook_id: UUID,
    user: CurrentUser = Depends(require_roles(*ADMIN_ONLY)),
    db: Session = Depends(get_db),
) -> WebhookDelivery:
    hook = db.get(WebhookEndpoint, webhook_id)
    if not hook or hook.company_id != user.company_id:
        raise HTTPException(status_code=404, detail="Webhook not found")
    delivery = send_test_event(db, hook)
    log_security_event(
        db,
        action="webhook.tested",
        company_id=user.company_id,
        actor_user_id=user.id,
        resource_type="webhook",
        resource_id=str(webhook_id),
    )
    db.commit()
    db.refresh(delivery)
    return delivery


@router.get("/webhooks/{webhook_id}/deliveries", response_model=list[WebhookDeliveryOut])
def list_deliveries(
    webhook_id: UUID,
    user: CurrentUser = Depends(require_roles(*ADMIN_ONLY)),
    db: Session = Depends(get_db),
) -> list[WebhookDelivery]:
    hook = db.get(WebhookEndpoint, webhook_id)
    if not hook or hook.company_id != user.company_id:
        raise HTTPException(status_code=404, detail="Webhook not found")
    return list(
        db.scalars(
            select(WebhookDelivery)
            .where(WebhookDelivery.webhook_id == webhook_id)
            .order_by(WebhookDelivery.created_at.desc())
            .limit(50)
        )
    )


@router.get("/security-logs", response_model=list[SecurityAuditOut])
def security_logs(
    limit: int = 100,
    user: CurrentUser = Depends(require_roles(*ADMIN_ONLY)),
    db: Session = Depends(get_db),
) -> list[SecurityAuditOut]:
    return list_security_logs(db, user.company_id, limit=limit)
