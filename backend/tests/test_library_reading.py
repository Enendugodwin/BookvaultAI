from __future__ import annotations

from datetime import datetime, timedelta, timezone

from conftest import add_book, auth_headers, register_user


def test_add_book_normalises_and_deduplicates(client, auth):
    book = add_book(client, auth["headers"])
    assert book["book"]["title"] == "The Practice"
    assert book["book"]["authors"] == ["Seth Godin"]
    assert book["progress_percent"] == 5.0
    r = client.post("/api/v1/books", headers=auth["headers"], json={
        "title": "the practice", "authors": ["Seth Godin"],
    })
    assert r.status_code == 409
    assert r.json()["error"]["details"]["user_book_id"] == book["id"]


def test_invalid_isbn_and_page_ranges_rejected(client, auth):
    r = client.post("/api/v1/books", headers=auth["headers"], json={
        "title": "Bad ISBN", "authors": ["X"], "isbn13": "123",
    })
    assert r.status_code == 422
    r = client.post("/api/v1/books", headers=auth["headers"], json={
        "title": "Too many pages", "authors": ["X"], "page_count": 100, "current_page": 150,
    })
    assert r.status_code == 422


def test_library_filters_sorting_and_facets(client, auth):
    add_book(client, auth["headers"], title="Alpha", authors=["A"], genre="History", tags=["war"])
    add_book(client, auth["headers"], title="Beta", authors=["B"], genre="Science", tags=["space"],
             isbn13="9781234567898")
    r = client.get("/api/v1/books?q=alpha", headers=auth["headers"])
    assert r.json()["total"] == 1
    r = client.get("/api/v1/books?genre=Science", headers=auth["headers"])
    assert r.json()["total"] == 1
    r = client.get("/api/v1/books?tag=war", headers=auth["headers"])
    assert r.json()["total"] == 1
    r = client.get("/api/v1/books?sort=title&order=asc", headers=auth["headers"])
    assert [i["book"]["title"] for i in r.json()["items"]] == ["Alpha", "Beta"]
    r = client.get("/api/v1/books/facets", headers=auth["headers"])
    assert r.status_code == 200
    assert {g["name"] for g in r.json()["genres"]} == {"History", "Science"}


def test_progress_validation_and_status_transition(client, auth):
    book = add_book(client, auth["headers"], status="want_to_read", current_page=None)
    r = client.post(f"/api/v1/books/{book['id']}/progress", headers=auth["headers"], json={"current_page": 25})
    assert r.status_code == 200
    assert r.json()["status"] == "reading"
    assert r.json()["progress_percent"] == 12.5
    r = client.post(f"/api/v1/books/{book['id']}/progress", headers=auth["headers"], json={"current_page": 500})
    assert r.status_code == 400


def test_complete_book_rating_and_next_suggestion(client, auth):
    book = add_book(client, auth["headers"])
    add_book(client, auth["headers"], title="Next Up", authors=["Someone"], isbn13="9781234567899",
             status="want_to_read")
    r = client.post(f"/api/v1/books/{book['id']}/complete", headers=auth["headers"],
                    json={"rating": 5, "review": "Excellent."})
    assert r.status_code == 200
    body = r.json()
    assert body["book"]["status"] == "completed"
    assert body["book"]["rating"] == 5.0
    assert body["suggested_next"]["book"]["title"] == "Next Up"
    assert body["book"]["current_page"] == 200


def test_archive_hides_book_from_default_library(client, auth):
    book = add_book(client, auth["headers"])
    r = client.patch(f"/api/v1/books/{book['id']}", headers=auth["headers"], json={"archived": True})
    assert r.status_code == 200
    assert client.get("/api/v1/books", headers=auth["headers"]).json()["total"] == 0
    assert client.get("/api/v1/books?archived=true", headers=auth["headers"]).json()["total"] == 1


def test_cross_user_isolation(client, auth):
    book = add_book(client, auth["headers"])
    other = register_user(client, "intruder@example.com")
    other_headers = {"X-CSRF-Token": other["csrf_token"]}
    assert client.get(f"/api/v1/books/{book['id']}", headers=other_headers).status_code == 404
    assert client.patch(f"/api/v1/books/{book['id']}", headers=other_headers,
                        json={"rating": 1}).status_code == 404
    assert client.request("DELETE", f"/api/v1/books/{book['id']}", headers=other_headers).status_code == 404
    # the other user can add the same canonical book independently
    r = client.post("/api/v1/books", headers=other_headers, json={
        "title": "The Practice", "authors": ["Seth Godin"],
    })
    assert r.status_code == 201
    assert r.json()["id"] != book["id"]


def test_session_math_idempotency_and_delete(client, auth):
    book = add_book(client, auth["headers"])
    now = datetime.now(timezone.utc)
    payload = {
        "started_at": (now - timedelta(minutes=40)).isoformat(),
        "ended_at": now.isoformat(),
        "paused_seconds": 300,
        "start_page": 10, "end_page": 50,
    }
    headers = {**auth["headers"], "Idempotency-Key": "abc-1"}
    r = client.post(f"/api/v1/books/{book['id']}/sessions", headers=headers, json=payload)
    assert r.status_code == 201
    s = r.json()
    assert s["duration_seconds"] == 2100
    assert s["pages_read"] == 40
    assert s["pages_per_hour"] == 68.6
    r2 = client.post(f"/api/v1/books/{book['id']}/sessions", headers=headers, json=payload)
    assert r2.json()["id"] == s["id"]

    r = client.get("/api/v1/analytics/overview?preset=30d", headers=auth["headers"])
    assert r.json()["totals"]["pages"] == 40
    assert r.json()["totals"]["sessions"] == 1

    r = client.request("DELETE", f"/api/v1/sessions/{s['id']}", headers=auth["headers"])
    assert r.status_code == 204
    r = client.get("/api/v1/analytics/overview?preset=30d", headers=auth["headers"])
    assert r.json()["totals"]["pages"] == 0
    assert r.json()["totals"]["sessions"] == 0


def test_session_validation(client, auth):
    book = add_book(client, auth["headers"])
    now = datetime.now(timezone.utc)
    base = {"started_at": (now - timedelta(minutes=10)).isoformat(), "ended_at": now.isoformat()}
    r = client.post(f"/api/v1/books/{book['id']}/sessions", headers=auth["headers"],
                    json={**base, "end_page": 500})
    assert r.status_code == 400
    r = client.post(f"/api/v1/books/{book['id']}/sessions", headers=auth["headers"],
                    json={**base, "started_at": now.isoformat(), "ended_at": (now - timedelta(minutes=1)).isoformat()})
    assert r.status_code == 422
    r = client.post(f"/api/v1/books/{book['id']}/sessions", headers=auth["headers"],
                    json={**base, "paused_seconds": 700})
    assert r.status_code == 400


def test_timer_lifecycle_and_persistence(client, auth):
    book = add_book(client, auth["headers"], current_page=20)
    r = client.get("/api/v1/timer", headers=auth["headers"])
    assert r.json()["timer"] is None
    r = client.post("/api/v1/timer/start", headers=auth["headers"], json={"user_book_id": book["id"]})
    assert r.status_code == 201
    timer = r.json()["timer"]
    assert timer["running"] is True
    assert timer["start_page"] == 20
    # only one active timer
    r = client.post("/api/v1/timer/start", headers=auth["headers"], json={"user_book_id": book["id"]})
    assert r.status_code == 409
    r = client.post("/api/v1/timer/pause", headers=auth["headers"])
    paused = r.json()["timer"]
    assert paused["running"] is False
    r = client.post("/api/v1/timer/resume", headers=auth["headers"])
    assert r.json()["timer"]["running"] is True
    # simulate elapsed time by shifting the start backwards
    from app.core.db import SessionLocal
    from app.models.reading import ActiveTimer
    from sqlalchemy import select

    session = SessionLocal()
    t = session.scalar(select(ActiveTimer))
    t.started_at = datetime.now(timezone.utc) - timedelta(minutes=12)
    session.commit()
    session.close()
    r = client.post("/api/v1/timer/stop", headers=auth["headers"], json={"end_page": 35})
    assert r.status_code == 201, r.text
    s = r.json()["session"]
    assert s["duration_seconds"] >= 700
    assert s["pages_read"] == 15
    assert client.get("/api/v1/timer", headers=auth["headers"]).json()["timer"] is None


def test_goals_progress_and_recommendations(client, auth):
    today = datetime.now(timezone.utc).date()
    r = client.post("/api/v1/goals", headers=auth["headers"], json={
        "name": "20 pages a day", "goal_type": "pages", "period": "day", "target_value": 20,
        "start_date": str(today), "end_date": str(today),
    })
    assert r.status_code == 201
    goal = r.json()
    assert goal["current_value"] == 0
    assert goal["percent"] == 0.0
    book = add_book(client, auth["headers"])
    now = datetime.now(timezone.utc)
    r = client.post(f"/api/v1/books/{book['id']}/sessions", headers=auth["headers"], json={
        "started_at": (now - timedelta(minutes=30)).isoformat(), "ended_at": now.isoformat(),
        "start_page": 10, "end_page": 35,
    })
    assert r.status_code == 201
    r = client.get("/api/v1/goals", headers=auth["headers"])
    goal = r.json()["items"][0]
    assert goal["current_value"] == 25
    assert goal["completed"] is True
    assert goal["percent"] == 100.0

    r = client.get("/api/v1/goals/recommendations/current", headers=auth["headers"])
    assert r.status_code == 200
    assert len(r.json()["items"]) >= 1


def test_invalid_goal_rejected(client, auth):
    today = datetime.now(timezone.utc).date()
    r = client.post("/api/v1/goals", headers=auth["headers"], json={
        "name": "Bad", "goal_type": "genre_books", "period": "custom", "target_value": 5,
        "start_date": str(today), "end_date": str(today),
    })
    assert r.status_code == 422
    r = client.post("/api/v1/goals", headers=auth["headers"], json={
        "name": "Bad dates", "goal_type": "books", "period": "custom", "target_value": 5,
        "start_date": str(today), "end_date": "2020-01-01",
    })
    assert r.status_code == 422
