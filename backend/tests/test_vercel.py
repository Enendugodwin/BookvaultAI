from __future__ import annotations

from types import SimpleNamespace

from fastapi.testclient import TestClient

from app.core.config import Settings, settings, validate_runtime_config
from app.services.storage import VercelBlobStorage, safe_key


def test_vercel_postgres_urls_are_preferred(monkeypatch):
    monkeypatch.setenv("VERCEL", "1")
    monkeypatch.setenv("POSTGRES_URL", "postgresql://pooled@example/db")
    monkeypatch.setenv("POSTGRES_URL_NON_POOLING", "postgresql://direct@example/db")
    cfg = Settings(database_url="sqlite:///./ignored.db")
    assert cfg.is_vercel is True
    assert cfg.resolved_database_url == "postgresql://pooled@example/db"
    assert cfg.migration_database_url == "postgresql://direct@example/db"


def test_non_vercel_keeps_database_url(monkeypatch):
    monkeypatch.delenv("VERCEL", raising=False)
    monkeypatch.delenv("VERCEL_ENV", raising=False)
    cfg = Settings(database_url="sqlite:///./local.db")
    assert cfg.resolved_database_url == "sqlite:///./local.db"
    assert cfg.run_jobs_inline is False


def test_production_vercel_rejects_ephemeral_local_storage(monkeypatch):
    monkeypatch.setenv("VERCEL", "1")
    monkeypatch.setenv("POSTGRES_URL", "postgresql://pooled@example/db")
    cfg = Settings(
        environment="production",
        secret_key="x" * 40,
        cookie_secure=True,
        expose_reset_token=False,
        storage_backend="local",
    )
    problems = validate_runtime_config(cfg)
    assert any("STORAGE_BACKEND" in p and "Vercel" in p for p in problems)


def test_production_accepts_vercel_postgres_without_database_url(monkeypatch):
    monkeypatch.setenv("VERCEL", "1")
    monkeypatch.setenv("POSTGRES_URL", "postgresql://pooled@example/db")
    monkeypatch.setenv("BLOB_STORE_ID", "store_test")
    cfg = Settings(
        environment="production",
        secret_key="x" * 40,
        cookie_secure=True,
        expose_reset_token=False,
        storage_backend="vercel_blob",
    )
    assert validate_runtime_config(cfg) == []


def test_vercel_blob_storage_uses_private_access(monkeypatch):
    calls: dict = {}

    def fake_put(pathname, body, **kwargs):
        calls["put"] = (pathname, body, kwargs)
        return SimpleNamespace(pathname=pathname)

    def fake_get(pathname, *, access):
        calls["get"] = (pathname, access)
        return SimpleNamespace(body=b"payload")

    def fake_delete(pathname):
        calls["delete"] = pathname

    import vercel.blob.sync as blob_sync

    monkeypatch.setattr(blob_sync, "put_blob", fake_put)
    monkeypatch.setattr(blob_sync, "get_blob", fake_get)
    monkeypatch.setattr(blob_sync, "delete_blob", fake_delete)

    store = VercelBlobStorage()
    store.save("exports/a b.csv", b"x", "text/csv")
    assert calls["put"][0] == safe_key("exports/a b.csv")
    assert calls["put"][2]["access"] == "private"
    assert store.read("exports/a.csv") == b"payload"
    store.delete("exports/a.csv")
    assert calls["get"] == ("exports/a.csv", "private")
    assert calls["delete"] == "exports/a.csv"


def test_cron_tick_requires_secret(client: TestClient, monkeypatch):
    monkeypatch.setattr(settings, "cron_secret", "cron-test-secret")
    assert client.get("/api/v1/internal/jobs/tick").status_code == 401
    assert client.get(
        "/api/v1/internal/jobs/tick", headers={"Authorization": "Bearer wrong"}
    ).status_code == 401
    ok = client.get(
        "/api/v1/internal/jobs/tick", headers={"Authorization": "Bearer cron-test-secret"}
    )
    assert ok.status_code == 200
    assert ok.json()["processed"] == 0


def test_cron_tick_disabled_without_secret(client: TestClient, monkeypatch):
    monkeypatch.setattr(settings, "cron_secret", "")
    r = client.get("/api/v1/internal/jobs/tick")
    assert r.status_code == 503
    assert r.json()["error"]["code"] == "cron_disabled"
