"""Apply Alembic migrations safely from a serverless cold start.

Vercel Functions do not run a container entrypoint, so there is nowhere to put
``alembic upgrade head``. This module runs the upgrade lazily on startup using a
PostgreSQL advisory lock, which keeps concurrent cold starts from racing each
other. Other hosts (Docker/Render) can keep running the migration explicitly;
this is then a no-op because Alembic sees the current revision.
"""
from __future__ import annotations

from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.core.db import normalize_database_url

# Stable, arbitrary 64-bit key. Must be the same on every invocation.
_MIGRATION_LOCK_KEY = 7_305_221_947


class MigrationError(RuntimeError):
    pass


def _backend_dir() -> Path:
    return Path(__file__).resolve().parents[2]


def upgrade_database() -> None:
    """Upgrade the configured database to the latest Alembic revision.

    Only PostgreSQL is handled. SQLite development/test databases are created
    by the test fixtures, and running Alembic there adds no value.
    """
    url = normalize_database_url(settings.migration_database_url)
    if not url.startswith(("postgresql://", "postgresql+psycopg://")):
        return

    backend_dir = _backend_dir()
    ini_path = backend_dir / "alembic.ini"
    if not ini_path.is_file():
        raise MigrationError(f"Alembic config not found at {ini_path}")

    cfg = Config(str(ini_path))
    cfg.set_main_option("script_location", str(backend_dir / "migrations"))
    cfg.set_main_option("sqlalchemy.url", url.replace("%", "%%"))

    engine = create_engine(url, poolclass=NullPool, future=True)
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT pg_advisory_lock(:key)"), {"key": _MIGRATION_LOCK_KEY})
            try:
                cfg.attributes["connection"] = connection
                command.upgrade(cfg, "head")
                connection.commit()
            finally:
                try:
                    connection.rollback()
                except Exception:
                    pass
                connection.execute(
                    text("SELECT pg_advisory_unlock(:key)"), {"key": _MIGRATION_LOCK_KEY}
                )
                connection.commit()
    finally:
        engine.dispose()
