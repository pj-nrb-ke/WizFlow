from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "WizFlow API"
    api_version: str = "0.3.0"
    database_url: str = "postgresql://wizflow:wizflow@localhost:5433/wizflow_dev"
    redis_url: str = "redis://localhost:6380/0"
    jwt_secret: str = "change-me-in-production"
    jwt_expire_minutes: int = 60
    jwt_refresh_expire_days: int = 7
    cors_origins: str = "http://localhost:5200,http://localhost:8090"
    file_storage_path: str = "./uploads/dev"
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_pass: str = ""
    app_url: str = "http://localhost:5200"


settings = Settings()
