"""End-to-end API smoke test against an in-memory/test database.

Run from repo root:
    set PYTHONPATH=backend
    python backend/scripts/smoke.py
"""
from __future__ import annotations

import os
import tempfile
from datetime import datetime, timedelta, timezone

os.environ.setdefault("ENVIRONMENT", "test")
os.environ.setdefault("DATABASE_URL", "sqlite:///./bookvault-smoke.db")
os.environ.setdefault("EXPOSE_RESET_TOKEN", "true")

from fastapi.testclient import TestClient  # noqa: E402

import app.models  # noqa: F401,E402  (registers every mapper before create_all)
from app.core.db import Base, engine  # noqa: E402
from app.main import app  # noqa: E402

Base.metadata.drop_all(engine)
Base.metadata.create_all(engine)

client = TestClient(app)
failures = []


def check(label, condition, detail=""):
    if condition:
        print(f"  ok  {label}")
    else:
        failures.append(label)
        print(f" FAIL {label} {detail}")


def main():
    r = client.get("/api/v1/health")
    check("health", r.status_code == 200 and r.json()["status"] == "ok", r.text)

    r = client.post("/api/v1/auth/register", json={
        "email": "reader@example.com", "password": "correct horse 42", "display_name": "Reader One",
    })
    check("register", r.status_code == 201, r.text)
    csrf = r.json()["user"]["csrf_token"]
    headers = {"X-CSRF-Token": csrf}

    r = client.get("/api/v1/auth/me")
    check("me", r.status_code == 200, r.text)

    r = client.post("/api/v1/auth/login", json={"email": "reader@example.com", "password": "correct horse 42"})
    check("login", r.status_code == 200, r.text)
    csrf = r.json()["user"]["csrf_token"]
    headers = {"X-CSRF-Token": csrf}

    r = client.get("/api/v1/auth/me")
    check("csrf token returned", bool(r.json()["user"].get("csrf_token")), r.text)

    r = client.post("/api/v1/auth/login", json={"email": "reader@example.com", "password": "wrong"})
    check("bad login rejected", r.status_code == 401, r.text)

    # book
    r = client.post("/api/v1/books", headers=headers, json={
        "title": "The Practice", "authors": ["Seth Godin"], "page_count": 200,
        "isbn13": "9781234567897", "genre": "Business", "status": "reading",
        "current_page": 10, "tags": ["craft"],
    })
    check("add book", r.status_code == 201, r.text)
    ub = r.json()
    book_id = ub["id"]

    r = client.post("/api/v1/books", headers=headers, json={"title": "The Practice", "authors": ["Seth Godin"]})
    check("duplicate book conflict", r.status_code == 409, r.text)

    r = client.get("/api/v1/books", headers=headers)
    check("list books", r.status_code == 200 and r.json()["total"] == 1, r.text)
    check("progress computed", r.json()["items"][0]["progress_percent"] == 5.0, r.text)

    r = client.patch(f"/api/v1/books/{book_id}", headers=headers, json={"rating": 4.5, "status": "paused"})
    check("patch book", r.status_code == 200 and r.json()["rating"] == 4.5, r.text)

    # session
    now = datetime.now(timezone.utc)
    payload = {
        "started_at": (now - timedelta(minutes=40)).isoformat(),
        "ended_at": now.isoformat(),
        "paused_seconds": 300,
        "start_page": 10, "end_page": 45, "notes": "Solid chapter on shipping",
    }
    r = client.post(f"/api/v1/books/{book_id}/sessions", headers={**headers, "Idempotency-Key": "smoke-1"}, json=payload)
    check("create session", r.status_code == 201, r.text)
    session = r.json()
    check("duration excludes pause", session["duration_seconds"] == 2100, r.text)
    check("pages read", session["pages_read"] == 35, r.text)

    r = client.post(f"/api/v1/books/{book_id}/sessions", headers={**headers, "Idempotency-Key": "smoke-1"}, json=payload)
    check("session idempotent", r.status_code == 201 and r.json()["id"] == session["id"], r.text)

    r = client.post(f"/api/v1/books/{book_id}/sessions", headers=headers, json={**payload, "ended_at": payload["started_at"]})
    check("invalid session rejected", r.status_code == 422, r.text)

    r = client.post(f"/api/v1/books/{book_id}/complete", headers=headers, json={"rating": 5})
    check("complete book", r.status_code == 200 and r.json()["book"]["status"] == "completed", r.text)
    check("completed at set", bool(r.json()["book"]["completed_at"]), r.text)

    r = client.get("/api/v1/analytics/summary", headers=headers)
    check("summary", r.status_code == 200 and r.json()["total_books"] == 1, r.text)
    check("streak computed", r.json()["current_streak"] >= 1, r.text)

    r = client.get("/api/v1/analytics/overview?preset=30d", headers=headers)
    check("overview", r.status_code == 200 and r.json()["totals"]["pages"] == 35, r.text)

    r = client.get("/api/v1/analytics/heatmap", headers=headers)
    check("heatmap", r.status_code == 200 and len(r.json()["days"]) == 365, r.text)

    # goals
    today = datetime.now(timezone.utc).date()
    r = client.post("/api/v1/goals", headers=headers, json={
        "name": "Read 12 books", "goal_type": "books", "period": "year", "target_value": 12,
        "start_date": str(today.replace(month=1, day=1)), "end_date": str(today.replace(month=12, day=31)),
    })
    check("create goal", r.status_code == 201, r.text)
    goal_id = r.json()["id"]
    r = client.get("/api/v1/goals", headers=headers)
    check("goal progress", r.status_code == 200 and r.json()["items"][0]["current_value"] == 1, r.text)

    # timer
    r = client.post("/api/v1/timer/start", headers=headers, json={"user_book_id": book_id})
    check("timer start", r.status_code == 201, r.text)
    r = client.post("/api/v1/timer/pause", headers=headers)
    check("timer pause", r.status_code == 200 and r.json()["timer"]["running"] is False, r.text)
    r = client.post("/api/v1/timer/resume", headers=headers)
    check("timer resume", r.status_code == 200 and r.json()["timer"]["running"] is True, r.text)
    r = client.delete("/api/v1/timer", headers=headers)
    check("timer cancel", r.status_code == 204, r.text)

    # notes, highlight, journal
    r = client.post("/api/v1/notes", headers=headers, json={
        "title": "Small bets", "content": "Ship small things often.", "user_book_id": book_id,
        "tags": ["practice"], "is_important": True,
    })
    check("create note", r.status_code == 201, r.text)
    note_id = r.json()["id"]

    r = client.post("/api/v1/highlights", headers=headers, json={
        "text": "The practice is the point.", "user_book_id": book_id, "page_ref": "42", "tags": ["practice"],
    })
    check("create highlight", r.status_code == 201, r.text)

    r = client.post("/api/v1/journal", headers=headers, json={
        "entry_date": str(today), "title": "Today", "reflections": "Read well.",
    })
    check("create journal", r.status_code == 201, r.text)

    r = client.get("/api/v1/knowledge/overview", headers=headers)
    check("knowledge overview", r.status_code == 200 and r.json()["counts"]["notes"] == 1, r.text)

    r = client.get("/api/v1/knowledge/search?q=small", headers=headers)
    check("knowledge search", r.status_code == 200 and len(r.json()["notes"]) == 1, r.text)

    # AI disabled
    r = client.get("/api/v1/ai/status", headers=headers)
    check("ai status disabled", r.status_code == 200 and r.json()["configured"] is False, r.text)
    r = client.post("/api/v1/ai/summaries", headers=headers, json={"user_book_id": book_id})
    check("ai unavailable", r.status_code == 503, r.text)

    # import preview + commit (job queued; execute worker handler inline)
    csv = "title,authors,status,page_count\nDeep Work,Cal Newport,want_to_read,300\n"
    r = client.post("/api/v1/imports", headers=headers, files={"file": ("books.csv", csv, "text/csv")})
    check("import preview", r.status_code == 201 and r.json()["preview"][0]["status"] == "ready", r.text)
    import_id = r.json()["id"]
    r = client.post(f"/api/v1/imports/{import_id}/commit", headers=headers)
    check("import commit queued", r.status_code == 202, r.text)
    from app.core.db import SessionLocal
    from app.models.ops import BackgroundJob
    from app.tasks.handlers import handle_import
    import asyncio

    db = SessionLocal()
    bg = db.get(BackgroundJob, r.json()["job_id"])
    asyncio.run(handle_import(db, bg))
    db.commit()
    db.close()
    r = client.get(f"/api/v1/imports/{import_id}", headers=headers)
    check("import completed", r.json()["imported_rows"] == 1, r.text)

    # exports
    r = client.post("/api/v1/exports", headers=headers, json={"format": "library_csv"})
    check("export queued", r.status_code == 202, r.text)
    export_id = r.json()["id"]
    from app.models.ops import ExportJob
    from app.tasks.handlers import handle_export

    db = SessionLocal()
    bg = db.get(BackgroundJob, r.json()["job_id"])
    asyncio.run(handle_export(db, bg))
    db.commit()
    db.close()
    r = client.get(f"/api/v1/exports/{export_id}/download", headers=headers)
    check("export download", r.status_code == 200 and b"Deep Work" in r.content, r.text[:200])

    r = client.post("/api/v1/exports", headers=headers, json={"format": "archive_zip"})
    db = SessionLocal()
    bg = db.get(BackgroundJob, r.json()["job_id"])
    asyncio.run(handle_export(db, bg))
    db.commit()
    db.close()
    r = client.get(f"/api/v1/exports/{r.json()['id']}/download", headers=headers)
    check("archive zip", r.status_code == 200 and r.content[:2] == b"PK", r.text[:200])

    # notifications
    r = client.get("/api/v1/notifications", headers=headers)
    check("notifications list", r.status_code == 200, r.text)

    # CSRF enforcement
    r = client.post("/api/v1/notes", json={"title": "x", "content": "y"})
    check("csrf enforced", r.status_code == 401, r.text)

    # cross-user isolation
    r = client.post("/api/v1/auth/register", json={
        "email": "other@example.com", "password": "another pass 99", "display_name": "Other",
    })
    other_headers = {"X-CSRF-Token": r.json()["user"]["csrf_token"]}
    r2 = client.get(f"/api/v1/books/{book_id}", headers=other_headers)
    check("cross-user book hidden", r2.status_code == 404, r2.text)
    r2 = client.get(f"/api/v1/notes", headers=other_headers)
    check("cross-user notes empty", r2.status_code == 200 and r2.json()["total"] == 0, r2.text)

    # delete account
    r = client.post("/api/v1/auth/login", json={"email": "other@example.com", "password": "another pass 99"})
    other_headers = {"X-CSRF-Token": r.json()["user"]["csrf_token"]}
    r = client.request("DELETE", "/api/v1/auth/account", headers=other_headers, json={"password": "another pass 99"})
    check("delete account", r.status_code == 200, r.text)

    print()
    if failures:
        print(f"FAILURES: {len(failures)} -> {failures}")
        raise SystemExit(1)
    print("ALL SMOKE CHECKS PASSED")


if __name__ == "__main__":
    main()
