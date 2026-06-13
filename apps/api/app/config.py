from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "WizFlow API"
    api_version: str = "0.4.0"
    environment: str = "development"
    database_url: str = "postgresql://wizflow:wizflow@localhost:5433/wizflow_dev"
    redis_url: str = "redis://localhost:6380/0"
    jwt_secret: str = "change-me-in-production"
    auth_cookie_secure: bool = False
    max_request_body_bytes: int = 1_048_576
    jwt_expire_minutes: int = 60
    jwt_refresh_expire_days: int = 7
    cors_origins: str = "http://localhost:5200,http://localhost:8090"
    file_storage_path: str = "./uploads/dev"
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_pass: str = ""
    app_url: str = "http://localhost:5200"
    # Accept either AI_API_KEY / AI_MODEL or OPENAI_API_KEY / OPENAI_MODEL so a
    # server provisioned with the OpenAI-style names still enables live drafting.
    ai_api_key: str = Field(
        default="", validation_alias=AliasChoices("ai_api_key", "openai_api_key")
    )
    ai_model: str = Field(
        default="gpt-4o-mini", validation_alias=AliasChoices("ai_model", "openai_model")
    )
    expo_push_enabled: bool = True
    expo_push_access_token: str = ""
    # Background automation loop (SLA alerts, escalations, scheduled reports,
    # recurring workflow triggers). Disabled in tests.
    scheduler_enabled: bool = True
    scheduler_interval_seconds: int = 300


settings = Settings()
