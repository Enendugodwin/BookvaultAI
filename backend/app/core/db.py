"""Database engine, session factory, and declarative base."""
from __future__ import annotations

from collections.abc import Generator

from sqlalchemy import create_engine, event
from sqlalchemy.engine import make_url
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.pool import NullPool, StaticPool

from app.core.config import settings


class Base(DeclarativeBase):
    pass


def normalize_database_url(url: str) -> str:
    """Use the installed psycopg (v3) driver for plain Postgres URLs.

    Managed providers (Render, Railway, Heroku) hand out ``postgresql://`` or
    ``postgres://`` URLs. SQLAlchemy would look for psycopg2 for those, so point
    them at the psycopg 3 dialect we actually ship.
    """
    if url.startswith("postgresql://"):
        return "postgresql+psycopg://" + url[len("postgresql://"):]
    if url.startswith("postgres://"):
        return "postgresql+psycopg://" + url[len("postgres://"):]
    return url


def _make_engine(url: str):
    url = normalize_database_url(url)
    kwargs: dict = {"pool_pre_ping": True, "future": True}
    if url.startswith("sqlite"):
        kwargs["connect_args"] = {"check_same_thread": False}
        # In-memory SQLite must share one connection across threads.
        if not make_url(url).database or make_url(url).database == ":memory:":
            kwargs["poolclass"] = StaticPool
    elif settings.is_vercel:
        # Serverless invocations are short-lived; do not hold a local pool of
        # connections open. Neon's pooled endpoint handles server-side pooling.
        kwargs.update({"poolclass": NullPool, "connect_args": {"prepare_threshold": None}})
    else:
        kwargs.update({"pool_size": 5, "max_overflow": 10, "pool_recycle": 1800})
    eng = create_engine(url, **kwargs)

    if url.startswith("sqlite"):
        @event.listens_for(eng, "connect")
        def _fk_on(dbapi_conn, _record):  # pragma: no cover - trivial
            cur = dbapi_conn.cursor()
            cur.execute("PRAGMA foreign_keys=ON")
            cur.close()

    return eng


engine = _make_engine(settings.resolved_database_url)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
