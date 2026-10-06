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
    # Provider: "openai" (any OpenAI-compatible /chat/completions endpoint — OpenAI,
    # Azure, Groq, Together, OpenRouter, Ollama, vLLM, DeepSeek, ...) or "anthropic".
    # Leave ai_base_url blank to use the provider's default host.
    ai_provider: str = "openai"
    ai_base_url: str = ""
    # AI control plane (D1). ai_enabled is the global emergency kill switch — off
    # disables every LLM call platform-wide (callers fall back gracefully). Per-company
    # kill switch, budgets and per-feature toggles live in the ai_governance table.
    # ai_strong_model is the model used for reasoning-heavy tasks (requirements→app,
    # process improvement, workflow drafting); blank falls back to ai_model.
    ai_enabled: bool = True
    ai_strong_model: str = ""
    # Embeddings (D3 knowledge/RAG). OpenAI-compatible /embeddings; blank provider or
    # "openai" supports it. Grounding degrades off when embeddings are unavailable.
    ai_embed_model: str = "text-embedding-3-small"
    expo_push_enabled: bool = True
    expo_push_access_token: str = ""
    # Voice-note transcription (self-hosted faster-whisper, CPU). Model downloads on
    # first use; point whisper_model_dir at a persistent volume so it survives rebuilds.
    whisper_model: str = "base"
    whisper_device: str = "cpu"
    whisper_compute_type: str = "int8"
    whisper_model_dir: str = ""
    # Background automation loop (SLA alerts, escalations, scheduled reports,
    # recurring workflow triggers). Disabled in tests.
    scheduler_enabled: bool = True
    scheduler_interval_seconds: int = 300
    # Account lockout: lock an account after this many failed logins within the window
    # (per-email, across IPs — complements the IP rate limiter).
    login_lockout_threshold: int = 8
    login_lockout_minutes: int = 15


settings = Settings()
