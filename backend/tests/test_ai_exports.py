from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone

import pytest
from conftest import auth_headers, register_user
from sqlalchemy import select

from app.core.config import settings
from app.core.db import SessionLocal
from app.models.ops import BackgroundJob
from app.models.user import User
from app.services.ai import service as ai_service
from app.services.ai.provider import AIResult
from app.tasks.handlers import handle_ai_summary, handle_export, handle_import


class FakeProvider:
    name = "fake"
    model = "fake-model"

    def __init__(self, reply: str = "A grounded summary. Coverage: metadata_only"):
        self.reply = reply

    async def chat(self, system, messages, max_tokens=900):
        return AIResult(content=self.reply, prompt_tokens=10, completion_tokens=20)


def enable_ai(monkeypatch, reply: str = "A grounded summary. Coverage: metadata_only"):
    monkeypatch.setattr(settings, "ai_provider", "openai")
    monkeypatch.setattr(settings, "ai_api_key", "test-key")
    monkeypatch.setattr(settings, "ai_base_url", "https://example.invalid/v1")
    fake = FakeProvider(reply)
    monkeypatch.setattr(ai_service, "get_provider", lambda user=None: fake)
    return fake


def consent(client, headers):
    r = client.patch("/api/v1/auth/settings", headers=headers, json={
        "ai_enabled": True, "ai_external_consent": True,
    })
    assert r.status_code == 200


def add_book(client, headers, title="The Practice", isbn="9781234567897"):
    r = client.post("/api/v1/books", headers=headers, json={
        "title": title, "authors": ["Seth Godin"], "page_count": 200, "isbn13": isbn,
        "genre": "Business",
    })
    assert r.status_code == 201, r.text
    return r.json()


def test_ai_disabled_when_not_configured(client, auth):
    r = client.get("/api/v1/ai/status", headers=auth["headers"])
    assert r.status_code == 200
    assert r.json()["configured"] is False
    book = add_book(client, auth["headers"])
    r = client.post("/api/v1/ai/summaries", headers=auth["headers"], json={"user_book_id": book["id"]})
    assert r.status_code == 503


def test_ai_requires_external_consent(client, auth, monkeypatch):
    enable_ai(monkeypatch)
    book = add_book(client, auth["headers"])
    r = client.post("/api/v1/ai/summaries", headers=auth["headers"], json={"user_book_id": book["id"]})
    assert r.status_code == 503
    assert "external ai" in r.json()["error"]["message"].lower()
    consent(client, auth["headers"])
    r = client.get("/api/v1/ai/status", headers=auth["headers"])
    assert r.status_code == 200
    assert r.json()["configured"] is True


def test_ai_summary_job_records_coverage_and_sources(client, auth, monkeypatch):
    enable_ai(monkeypatch)
    consent(client, auth["headers"])
    book = add_book(client, auth["headers"])
    client.post("/api/v1/notes", headers=auth["headers"], json={
        "title": "Key idea", "content": "Practice beats planning.", "user_book_id": book["id"],
    })
    r = client.post("/api/v1/ai/summaries", headers=auth["headers"], json={
        "user_book_id": book["id"], "kind": "short", "length": "medium",
    })
    assert r.status_code == 202, r.text
    job_id = r.json()["job_id"]
    db = SessionLocal()
    job = db.get(BackgroundJob, job_id)
    asyncio.run(handle_ai_summary(db, job))
    db.commit()
    db.close()

    r = client.get(f"/api/v1/ai/summaries?user_book_id={book['id']}", headers=auth["headers"])
    assert r.status_code == 200
    items = r.json()["items"]
    assert len(items) == 1
    assert items[0]["coverage"] == "notes_only"
    assert items[0]["provider"] == "fake"
    assert any(s["type"] == "note" for s in items[0]["sources"])
    assert items[0]["coverage_note"]


def test_ai_insights_requires_review_before_note(client, auth, monkeypatch):
    payload = json.dumps([
        {"kind": "lesson", "content": "Consistency compounds.", "source_note_indexes": []},
        {"kind": "action", "content": "Write 100 words daily.", "source_note_indexes": []},
    ])
    enable_ai(monkeypatch, payload)
    consent(client, auth["headers"])
    book = add_book(client, auth["headers"])
    for i in range(2):
        client.post("/api/v1/notes", headers=auth["headers"], json={
            "title": f"Note {i}", "content": f"Body {i}", "user_book_id": book["id"],
        })
    r = client.post("/api/v1/ai/insights", headers=auth["headers"], json={"user_book_id": book["id"]})
    assert r.status_code == 202
    db = SessionLocal()
    job = db.get(BackgroundJob, r.json()["job_id"])
    from app.tasks.handlers import handle_ai_insights
    asyncio.run(handle_ai_insights(db, job))
    db.commit()
    db.close()
    r = client.get("/api/v1/ai/insights", headers=auth["headers"])
    insights = r.json()["items"]
    assert len(insights) == 2
    # nothing is added to notes automatically
    assert client.get("/api/v1/notes", headers=auth["headers"]).json()["total"] == 2
    r = client.post(f"/api/v1/ai/insights/{insights[0]['id']}/accept", headers=auth["headers"])
    assert r.status_code == 201
    assert client.get("/api/v1/notes", headers=auth["headers"]).json()["total"] == 3
    r = client.post(f"/api/v1/ai/insights/{insights[1]['id']}/dismiss", headers=auth["headers"])
    assert r.status_code == 200


def test_ai_chat_persists_and_returns_citations(client, auth, monkeypatch):
    enable_ai(monkeypatch, "Practice is the point.")
    consent(client, auth["headers"])
    book = add_book(client, auth["headers"])
    client.post("/api/v1/notes", headers=auth["headers"], json={
        "title": "Practice", "content": "Do the work.", "user_book_id": book["id"],
    })
    r = client.post("/api/v1/ai/conversations", headers=auth["headers"], json={"user_book_id": book["id"]})
    conv_id = r.json()["id"]
    r = client.post(f"/api/v1/ai/conversations/{conv_id}/messages", headers=auth["headers"],
                    json={"content": "What is the core idea?"})
    assert r.status_code == 200, r.text
    assert r.json()["message"]["role"] == "assistant"
    r = client.get(f"/api/v1/ai/conversations/{conv_id}", headers=auth["headers"])
    messages = r.json()["messages"]
    assert [m["role"] for m in messages] == ["user", "assistant"]
    assert any(c["type"] == "note" for c in messages[-1]["citations"])


def test_recommendations_are_labeled_unverified(client, auth, monkeypatch):
    payload = json.dumps([{
        "title": "Linchpin", "authors": ["Seth Godin"], "reason": "Similar themes.",
        "genres": ["Business"],
    }])
    enable_ai(monkeypatch, payload)
    consent(client, auth["headers"])
    add_book(client, auth["headers"])
    r = client.post("/api/v1/ai/recommendations", headers=auth["headers"], json={"count": 3})
    assert r.status_code == 200, r.text
    item = r.json()["items"][0]
    assert item["metadata_verified"] is False
    assert item["ai_suggested"] is True


def test_import_preview_duplicate_detection_and_commit(client, auth):
    add_book(client, auth["headers"], title="Existing Book", isbn="9781234567890")
    csv = (
        "title,authors,status,page_count,isbn13,cover_url\n"
        "Existing Book,Seth Godin,want_to_read,100,9781234567890,\n"
        "=Malicious,Author,want_to_read,50,,\n"
        ",Missing Title,want_to_read,20,,\n"
        "Fresh Book,New Author,reading,300,,https://covers.openlibrary.org/b/isbn/9780306406157-L.jpg\n"
    )
    r = client.post("/api/v1/imports", headers=auth["headers"],
                    files={"file": ("books.csv", csv, "text/csv")})
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["total_rows"] == 4
    statuses = [row["status"] for row in body["preview"]]
    assert statuses.count("duplicate") == 1
    assert statuses.count("error") == 1
    r = client.post(f"/api/v1/imports/{body['id']}/commit", headers=auth["headers"])
    assert r.status_code == 202
    db = SessionLocal()
    job = db.get(BackgroundJob, r.json()["job_id"])
    asyncio.run(handle_import(db, job))
    db.commit()
    db.close()
    r = client.get(f"/api/v1/imports/{body['id']}", headers=auth["headers"])
    body = r.json()
    assert body["imported_rows"] == 2
    assert body["status"] == "completed"
    # title is preserved literally rather than interpreted as a formula in the UI
    r = client.get("/api/v1/books?q=Malicious", headers=auth["headers"])
    assert r.json()["total"] == 1
    r = client.get("/api/v1/books?q=Fresh Book", headers=auth["headers"])
    assert r.json()["items"][0]["book"]["cover_url"] == "https://covers.openlibrary.org/b/isbn/9780306406157-L.jpg"

    template = client.get("/api/v1/imports/template", headers=auth["headers"])
    assert template.status_code == 200
    assert "cover_url" in template.text


def test_export_library_csv_formula_safe_and_zip(client, auth):
    add_book(client, auth["headers"], title="=SUM(A1:A2)")
    r = client.post("/api/v1/exports", headers=auth["headers"], json={"format": "library_csv"})
    assert r.status_code == 202
    export_id = r.json()["id"]
    db = SessionLocal()
    job = db.get(BackgroundJob, r.json()["job_id"])
    asyncio.run(handle_export(db, job))
    db.commit()
    db.close()
    r = client.get(f"/api/v1/exports/{export_id}/download", headers=auth["headers"])
    assert r.status_code == 200
    text = r.content.decode("utf-8-sig")
    assert "'=SUM(A1:A2)" in text

    r = client.post("/api/v1/exports", headers=auth["headers"], json={"format": "archive_zip"})
    export_id = r.json()["id"]
    db = SessionLocal()
    job = db.get(BackgroundJob, r.json()["job_id"])
    asyncio.run(handle_export(db, job))
    db.commit()
    db.close()
    r = client.get(f"/api/v1/exports/{export_id}/download", headers=auth["headers"])
    assert r.status_code == 200
    assert r.content[:2] == b"PK"

    r = client.post("/api/v1/exports", headers=auth["headers"], json={"format": "report_pdf"})
    export_id = r.json()["id"]
    db = SessionLocal()
    job = db.get(BackgroundJob, r.json()["job_id"])
    asyncio.run(handle_export(db, job))
    db.commit()
    db.close()
    r = client.get(f"/api/v1/exports/{export_id}/download", headers=auth["headers"])
    assert r.status_code == 200
    assert r.content[:4] == b"%PDF"


def test_export_jobs_are_user_scoped(client, auth):
    add_book(client, auth["headers"])
    r = client.post("/api/v1/exports", headers=auth["headers"], json={"format": "library_csv"})
    export_id = r.json()["id"]
    other = register_user(client, "exportother@example.com")
    other_headers = {"X-CSRF-Token": other["csrf_token"]}
    assert client.get(f"/api/v1/exports/{export_id}", headers=other_headers).status_code == 404
    assert client.get(f"/api/v1/exports/{export_id}/download", headers=other_headers).status_code == 404
