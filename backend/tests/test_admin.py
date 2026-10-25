from __future__ import annotations

from conftest import PASSWORD, register_user
from app.models.user import User


def _login(client, email: str) -> str:
    r = client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})
    assert r.status_code == 200, r.text
    return r.json()["user"]["csrf_token"]


def _make_admin(db, user_id: str) -> None:
    user = db.get(User, user_id)
    assert user
    user.is_admin = True
    db.commit()


def test_admin_endpoints_require_an_administrator(client, db):
    reader = register_user(client, "reader-admin-check@example.com", "Reader")
    assert client.get("/api/v1/admin/overview").status_code == 403
    assert client.get("/api/v1/admin/users").status_code == 403
    assert client.get("/api/v1/admin/activity").status_code == 403
    headers = {"X-CSRF-Token": reader["csrf_token"]}
    assert client.patch(
        f"/api/v1/admin/users/{reader['id']}", headers=headers, json={"is_active": False}
    ).status_code == 403


def test_admin_overview_users_and_account_actions(client, db):
    admin = register_user(client, "owner@example.com", "Owner")
    _make_admin(db, admin["id"])
    target = register_user(client, "member@example.com", "Member")
    admin_csrf = _login(client, "owner@example.com")
    headers = {"X-CSRF-Token": admin_csrf}

    overview = client.get("/api/v1/admin/overview")
    assert overview.status_code == 200
    data = overview.json()
    assert data["totals"]["users"] == 2
    assert data["totals"]["admins"] == 1
    assert len(data["recent_users"]) == 2
    assert "jobs" in data

    listing = client.get("/api/v1/admin/users", params={"q": "member"})
    assert listing.status_code == 200
    assert listing.json()["total"] == 1
    assert listing.json()["items"][0]["email"] == "member@example.com"
    assert listing.json()["items"][0]["book_count"] == 0

    promoted = client.patch(
        f"/api/v1/admin/users/{target['id']}", headers=headers, json={"is_admin": True}
    )
    assert promoted.status_code == 200
    assert promoted.json()["user"]["is_admin"] is True

    verified = client.patch(
        f"/api/v1/admin/users/{target['id']}", headers=headers, json={"email_verified": True}
    )
    assert verified.status_code == 200
    assert verified.json()["user"]["email_verified"] is True

    self_demote = client.patch(
        f"/api/v1/admin/users/{admin['id']}", headers=headers, json={"is_admin": False}
    )
    assert self_demote.status_code == 400
    assert self_demote.json()["error"]["code"] == "self_demote"
    self_suspend = client.patch(
        f"/api/v1/admin/users/{admin['id']}", headers=headers, json={"is_active": False}
    )
    assert self_suspend.status_code == 400

    revoked = client.post(f"/api/v1/admin/users/{target['id']}/revoke-sessions", headers=headers)
    assert revoked.status_code == 200
    assert revoked.json()["revoked"] >= 1

    suspended = client.patch(
        f"/api/v1/admin/users/{target['id']}", headers=headers, json={"is_active": False}
    )
    assert suspended.status_code == 200
    assert suspended.json()["user"]["is_active"] is False
    r = client.post("/api/v1/auth/login", json={"email": "member@example.com", "password": PASSWORD})
    assert r.status_code == 401

    activity = client.get("/api/v1/admin/activity")
    assert activity.status_code == 200
    actions = {item["action"] for item in activity.json()["items"]}
    assert "admin.user_updated" in actions
    assert "admin.sessions_revoked" in actions

    deleted = client.delete(f"/api/v1/admin/users/{target['id']}", headers=headers)
    assert deleted.status_code == 200
    assert db.get(User, target["id"]) is None
    assert client.delete(f"/api/v1/admin/users/{admin['id']}", headers=headers).status_code == 400


def test_admin_theme_choices_include_named_palettes(client):
    user = register_user(client, "themes@example.com", "Themes")
    headers = {"X-CSRF-Token": user["csrf_token"]}
    for theme in ("pink", "midnight", "purple", "forest", "sepia", "system", "light", "dark"):
        r = client.patch("/api/v1/auth/settings", headers=headers, json={"theme": theme})
        assert r.status_code == 200, (theme, r.text)
        assert r.json()["user"]["settings"]["theme"] == theme
    r = client.patch("/api/v1/auth/settings", headers=headers, json={"theme": "neon"})
    assert r.status_code == 422
