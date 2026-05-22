from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import admin, ai, auth, health, inbox, notifications, requests, workflows

app = FastAPI(
    title=settings.app_name,
    version="0.4.0",
    description="WizFlow API — see packages/openapi/wizflow.yaml",
)

origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

v1 = APIRouter(prefix="/api/v1")
v1.include_router(health.router)
v1.include_router(auth.router)
v1.include_router(admin.router)
v1.include_router(workflows.router)
v1.include_router(ai.router)
v1.include_router(requests.router)
v1.include_router(inbox.router)
v1.include_router(notifications.router)
app.include_router(v1)


@app.get("/")
def root() -> dict:
    return {"service": settings.app_name, "version": settings.api_version, "docs": "/docs"}
