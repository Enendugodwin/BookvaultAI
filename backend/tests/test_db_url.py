from __future__ import annotations

from app.core.db import normalize_database_url


def test_plain_postgres_urls_use_the_psycopg_driver():
    assert (
        normalize_database_url("postgresql://user:pass@db:5432/bookvault")
        == "postgresql+psycopg://user:pass@db:5432/bookvault"
    )
    assert (
        normalize_database_url("postgres://user:pass@db:5432/bookvault")
        == "postgresql+psycopg://user:pass@db:5432/bookvault"
    )


def test_explicit_dialects_and_sqlite_are_left_untouched():
    for url in (
        "postgresql+psycopg://user:pass@db:5432/bookvault",
        "sqlite:///./bookvault.db",
        "sqlite://",
    ):
        assert normalize_database_url(url) == url
