"""Environment-driven application configuration with production safety checks."""
from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"), env_file_encoding="utf-8", extra="ignore"
    )

    app_name: str = "YVO's Book Vault"
    environment: Literal["development", "test", "production"] = "development"
    api_prefix: str = "/api/v1"
    secret_key: str = "dev-only-insecure-secret-change-me"
    database_url: str = "sqlite:///./bookvault.db"

    frontend_url: str = "http://localhost:5173"
    allowed_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    cookie_name: str = "bv_session"
    cookie_secure: bool = False
    cookie_samesite: Literal["lax", "strict", "none"] = "lax"
    session_ttl_hours: int = 720
    expose_reset_token: bool = True

    google_books_api_key: str = ""
    catalogue_timeout_seconds: float = 10.0
    catalogue_cache_minutes: int = 720

    ai_provider: Literal["disabled", "openai", "ollama"] = "disabled"
    ai_base_url: str = "https://api.openai.com/v1"
    ai_api_key: str = ""
    ai_model: str = "gpt-4o-mini"
    ai_timeout_seconds: float = 45.0
    ai_daily_requests_per_user: int = 25
    ai_max_input_chars: int = 24000

    email_provider: Literal["disabled", "resend"] = "disabled"
    resend_api_key: str = ""
    email_from: str = "YVO's Book Vault <no-reply@example.com>"

    storage_backend: Literal["local", "s3"] = "local"
    storage_local_dir: str = "./storage"
    s3_endpoint_url: str = ""
    s3_bucket: str = ""
    s3_access_key_id: str = ""
    s3_secret_access_key: str = ""
    s3_region: str = "auto"
    # Optional. Leave empty for R2 (it encrypts at rest automatically) or when
    # the bucket already enforces default encryption. AWS S3 users can set AES256.
    s3_server_side_encryption: str = ""

    max_upload_mb: int = 20
    max_import_rows: int = 5000
    log_level: str = "INFO"
    sentry_dsn: str = ""

    # Optional: serve a built frontend from the API process (single-container deploys).
    frontend_dist_dir: str = ""

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    @property
    def origins(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]

    @property
    def ai_enabled(self) -> bool:
        return self.ai_provider != "disabled"

    @property
    def email_enabled(self) -> bool:
        return self.email_provider != "disabled"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()


class ConfigurationError(RuntimeError):
    """Raised when production configuration is unsafe or incomplete."""


def validate_runtime_config(cfg: Settings | None = None) -> list[str]:
    """Return human-safe configuration problems. Fail fast in production."""
    cfg = cfg or settings
    problems: list[str] = []
    if cfg.is_production:
        if cfg.secret_key.startswith("dev-") or len(cfg.secret_key) < 32:
            problems.append("SECRET_KEY must be a random value of at least 32 characters.")
        if not cfg.database_url.startswith(
            ("postgresql://", "postgresql+psycopg://", "postgres://")
        ):
            problems.append("DATABASE_URL must point at managed PostgreSQL in production.")
        if not cfg.cookie_secure:
            problems.append("COOKIE_SECURE must be true in production.")
        if cfg.expose_reset_token:
            problems.append("EXPOSE_RESET_TOKEN must be false in production.")
        if cfg.ai_provider != "disabled" and not cfg.ai_base_url:
            problems.append("AI_BASE_URL is required when an AI provider is enabled.")
        if cfg.ai_provider == "openai" and not cfg.ai_api_key:
            problems.append("AI_API_KEY is required for the openai provider.")
        if cfg.email_provider == "resend" and not cfg.resend_api_key:
            problems.append("RESEND_API_KEY is required when EMAIL_PROVIDER=resend.")
        if cfg.storage_backend == "s3" and not (cfg.s3_bucket and cfg.s3_access_key_id):
            problems.append("S3_BUCKET and S3_ACCESS_KEY_ID are required for s3 storage.")
    return problems
