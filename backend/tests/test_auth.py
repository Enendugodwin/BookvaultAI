from __future__ import annotations

from conftest import PASSWORD, register_user


def test_health_and_readiness(client):
    r = client.get("/api/v1/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"
    r = client.get("/api/v1/health/ready")
    assert r.status_code == 200
    assert r.json()["checks"]["database"] is True


def test_register_sets_cookie_and_returns_csrf(client):
    r = client.post("/api/v1/auth/register", json={
        "email": "New@Example.com", "password": PASSWORD, "display_name": "New Reader",
    })
    assert r.status_code == 201
    user = r.json()["user"]
    assert user["email"] == "new@example.com"
    assert user["csrf_token"]
    assert "bv_session" in r.cookies or "bv_session" in client.cookies
    me = client.get("/api/v1/auth/me")
    assert me.status_code == 200
    assert me.json()["user"]["id"] == user["id"]


def test_weak_password_and_duplicate_email_rejected(client):
    r = client.post("/api/v1/auth/register", json={
        "email": "a@example.com", "password": "short", "display_name": "A",
    })
    assert r.status_code == 422
    r = client.post("/api/v1/auth/register", json={
        "email": "a@example.com", "password": "all letters no digits", "display_name": "A",
    })
    assert r.status_code == 422
    register_user(client, "b@example.com")
    r = client.post("/api/v1/auth/register", json={
        "email": "b@example.com", "password": PASSWORD, "display_name": "B",
    })
    assert r.status_code == 409


def test_login_logout_and_csrf(client):
    register_user(client, "login@example.com")
    r = client.post("/api/v1/auth/logout", headers={"X-CSRF-Token": "wrong"})
    assert r.status_code == 401
    client.cookies.clear()
    r = client.post("/api/v1/auth/login", json={"email": "login@example.com", "password": PASSWORD})
    assert r.status_code == 200
    headers = {"X-CSRF-Token": r.json()["user"]["csrf_token"]}
    assert client.get("/api/v1/auth/me").status_code == 200
    r = client.post("/api/v1/auth/logout", headers=headers)
    assert r.status_code == 200
    assert client.get("/api/v1/auth/me").status_code == 401


def test_bearer_token_auth_and_csrf_exemption(client):
    user = register_user(client, "bearer@example.com")
    # obtain a bearer token via password login in a fresh session
    token = None
    raw = client.cookies.get("bv_session")
    token = raw
    client.cookies.clear()
    r = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    # Bearer clients do not need the CSRF header
    r = client.post("/api/v1/notes", headers={"Authorization": f"Bearer {token}"}, json={
        "title": "Bearer note", "content": "Works without CSRF.",
    })
    assert r.status_code == 201, r.text


def test_password_reset_flow(client):
    register_user(client, "reset@example.com")
    r = client.post("/api/v1/auth/password/forgot", json={"email": "reset@example.com"})
    assert r.status_code == 202
    token = r.json()["reset_token"]
    r = client.post("/api/v1/auth/password/reset", json={"token": token, "new_password": "brand new pass 77"})
    assert r.status_code == 200
    # token cannot be reused
    r = client.post("/api/v1/auth/password/reset", json={"token": token, "new_password": "brand new pass 78"})
    assert r.status_code == 400
    client.cookies.clear()
    r = client.post("/api/v1/auth/login", json={"email": "reset@example.com", "password": "brand new pass 77"})
    assert r.status_code == 200


def test_password_reset_for_unknown_email_is_generic(client):
    r = client.post("/api/v1/auth/password/forgot", json={"email": "nobody@example.com"})
    assert r.status_code == 202
    assert "reset_token" not in r.json()


def test_change_password_revokes_other_sessions(client):
    from fastapi.testclient import TestClient

    from app.main import app

    user = register_user(client, "change@example.com")
    headers = {"X-CSRF-Token": user["csrf_token"]}
    with TestClient(app) as second_browser:
        other = second_browser.post("/api/v1/auth/login", json={
            "email": "change@example.com", "password": PASSWORD,
        })
        assert other.status_code == 200
        other_headers = {"X-CSRF-Token": other.json()["user"]["csrf_token"]}
        r = client.post("/api/v1/auth/password/change", headers=headers, json={
            "current_password": PASSWORD, "new_password": "another strong 88",
        })
        assert r.status_code == 200
        # the client's own session survives
        assert client.get("/api/v1/auth/me").status_code == 200
        r = second_browser.post("/api/v1/auth/logout", headers=other_headers)
        assert r.status_code == 401


def test_onboarding_creates_annual_goal_once(client):
    user = register_user(client, "onboard@example.com")
    headers = {"X-CSRF-Token": user["csrf_token"]}
    payload = {"annual_goal": 24, "genres": ["History", "Science"], "notify_email": False}
    r = client.post("/api/v1/auth/onboarding", headers=headers, json=payload)
    assert r.status_code == 200
    assert r.json()["user"]["settings"]["onboarded"] is True
    r = client.post("/api/v1/auth/onboarding", headers=headers, json=payload)
    assert r.status_code == 200
    goals = client.get("/api/v1/goals", headers=headers).json()["items"]
    assert len([g for g in goals if g["goal_type"] == "books"]) == 1


def test_settings_and_profile_update(client):
    user = register_user(client, "settings@example.com")
    headers = {"X-CSRF-Token": user["csrf_token"]}
    r = client.patch("/api/v1/auth/settings", headers=headers, json={
        "timezone": "Europe/Vienna", "theme": "dark", "page_size": 48, "reminder_days": [0, 2, 4],
    })
    assert r.status_code == 200
    assert r.json()["user"]["settings"]["timezone"] == "Europe/Vienna"
    r = client.patch("/api/v1/auth/profile", headers=headers, json={"display_name": "New Name"})
    assert r.status_code == 200
    assert r.json()["user"]["display_name"] == "New Name"


def test_account_deletion_requires_password(client):
    user = register_user(client, "delete@example.com")
    headers = {"X-CSRF-Token": user["csrf_token"]}
    r = client.request("DELETE", "/api/v1/auth/account", headers=headers, json={"password": "wrong"})
    assert r.status_code == 400
    r = client.request("DELETE", "/api/v1/auth/account", headers=headers, json={"password": PASSWORD})
    assert r.status_code == 200
    assert client.get("/api/v1/auth/me").status_code == 401


def test_unauthenticated_access_is_rejected(client):
    for path in ("/api/v1/books", "/api/v1/analytics/summary", "/api/v1/notes", "/api/v1/goals"):
        assert client.get(path).status_code == 401
