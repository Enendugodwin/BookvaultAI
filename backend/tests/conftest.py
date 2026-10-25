from __future__ import annotations

import os

os.environ["ENVIRONMENT"] = "test"
os.environ["DATABASE_URL"] = "sqlite://"
os.environ["SECRET_KEY"] = "test-secret-key-not-for-production-0123456789"
os.environ["EXPOSE_RESET_TOKEN"] = "true"
os.environ["AI_PROVIDER"] = "disabled"
os.environ["EMAIL_PROVIDER"] = "disabled"
os.environ["STORAGE_BACKEND"] = "local"
os.environ["STORAGE_LOCAL_DIR"] = "./test-storage"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import app.models  # noqa: F401,E402
from app.core.db import Base, SessionLocal, engine  # noqa: E402
from app.core.ratelimit import reset as reset_rate_limits  # noqa: E402
from app.main import app  # noqa: E402

PASSWORD = "test password 42"


@pytest.fixture(autouse=True)
def fresh_database():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    reset_rate_limits()
    yield
    Base.metadata.drop_all(engine)


@pytest.fixture()
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture()
def db():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


def register_user(client: TestClient, email: str = "reader@example.com", name: str = "Reader") -> dict:
    r = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": PASSWORD, "display_name": name},
    )
    assert r.status_code == 201, r.text
    return r.json()["user"]


def auth_headers(client: TestClient, email: str = "reader@example.com") -> dict:
    user = register_user(client, email)
    return {"X-CSRF-Token": user["csrf_token"]}


@pytest.fixture()
def auth(client):
    user = register_user(client)
    return {"user": user, "headers": {"X-CSRF-Token": user["csrf_token"]}}


def add_book(client, headers, **overrides):
    payload = {
        "title": "The Practice",
        "authors": ["Seth Godin"],
        "page_count": 200,
        "isbn13": "9781234567897",
        "genre": "Business",
        "status": "reading",
        "current_page": 10,
    }
    payload.update(overrides)
    r = client.post("/api/v1/books", headers=headers, json=payload)
    assert r.status_code == 201, r.text
    return r.json()


def iso(dt) -> str:
    return dt.isoformat()
