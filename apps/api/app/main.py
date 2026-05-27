import logging

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.middleware.body_limit import MaxBodySizeMiddleware
from app.middleware.rate_limit import RateLimitMiddleware
from app.routers import (
    admin,
    ai,
    analytics,
    auth,
    delegations,
    documents,
    drafts,
    external_api,
    health,
    inbox,
    integrations,
    master_data,
    notifications,
    phase2,
    public_approval,
    reports,
    requests,
    saved_views,
    templates,
    user_groups,
    users,
    workflows,
)

app = FastAPI(
    title=settings.app_name,
    version="0.6.0",
    description="WizFlow API — see packages/openapi/wizflow.yaml",
)

origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
app.add_middleware(MaxBodySizeMiddleware)
app.add_middleware(RateLimitMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

logger = logging.getLogger(__name__)


@app.on_event("startup")
def validate_production_config() -> None:
    if settings.environment.lower() in ("production", "prod") and settings.jwt_secret == "change-me-in-production":
        raise RuntimeError("jwt_secret must be set to a strong value in production")

v1 = APIRouter(prefix="/api/v1")
v1.include_router(health.router)
v1.include_router(auth.router)
v1.include_router(admin.router)
v1.include_router(user_groups.router)
v1.include_router(workflows.router)
v1.include_router(ai.router)
v1.include_router(requests.router)
v1.include_router(inbox.router)
v1.include_router(notifications.router)
v1.include_router(public_approval.router)
v1.include_router(reports.router)
v1.include_router(analytics.router)
v1.include_router(templates.router)
v1.include_router(users.router)
v1.include_router(integrations.router)
v1.include_router(external_api.router)
v1.include_router(documents.router)
v1.include_router(master_data.router)
v1.include_router(drafts.router)
v1.include_router(saved_views.router)
v1.include_router(delegations.router)
v1.include_router(phase2.router)
app.include_router(v1)


@app.get("/")
def root() -> dict:
    return {"service": settings.app_name, "version": settings.api_version, "docs": "/docs"}
