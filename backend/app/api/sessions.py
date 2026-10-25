from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Header, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import AuthContext, require_csrf, verify_own_book
from app.core.db import get_db
from app.core.errors import AppError, Conflict, NotFound
from app.core.timeutils import day_bounds_utc, ensure_utc
from app.models.book import UserBook
from app.models.reading import ActiveTimer, ReadingSession
from app.schemas.reading import SessionIn, SessionUpdate, TimerStartIn, TimerStopIn
from app.services.books import serialize_user_books
from app.services.metrics import pages_read, pages_per_hour, session_duration_seconds

router = APIRouter(tags=["reading"])


def serialize_session(s: ReadingSession) -> dict:
    ub = s.user_book
    return {
        "id": s.id,
        "user_book_id": s.user_book_id,
        "book_title": ub.book.title if ub and ub.book else "Unknown book",
        "started_at": s.started_at,
        "ended_at": s.ended_at,
        "duration_seconds": s.duration_seconds,
        "duration_minutes": round(s.duration_seconds / 60.0, 1),
        "paused_seconds": s.paused_seconds,
        "start_page": s.start_page,
        "end_page": s.end_page,
        "pages_read": s.pages_read,
        "pages_per_hour": pages_per_hour(s.pages_read, s.duration_seconds),
        "notes": s.notes,
        "source": s.source,
        "created_at": s.created_at,
    }


def _timer_payload(t: ActiveTimer) -> dict:
    now = datetime.now(timezone.utc)
    started = ensure_utc(t.started_at)
    running_seconds = int((now - started).total_seconds()) if t.running else 0
    elapsed = max(0, t.accumulated_seconds + running_seconds)
    return {
        "id": t.id,
        "user_book_id": t.user_book_id,
        "book_title": t.user_book.book.title if t.user_book and t.user_book.book else None,
        "started_at": t.started_at,
        "accumulated_seconds": t.accumulated_seconds,
        "running": t.running,
        "paused_at": t.paused_at,
        "elapsed_seconds": elapsed,
        "start_page": t.start_page,
        "notes": t.notes,
    }


@router.get("/sessions")
def list_sessions(
    auth: AuthContext = Depends(require_csrf),
    db: Session = Depends(get_db),
    user_book_id: str | None = None,
    start: date | None = None,
    end: date | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
):
    tz = auth.user.settings.timezone
    stmt = select(ReadingSession).where(ReadingSession.user_id == auth.user.id)
    if user_book_id:
        verify_own_book(db, auth.user.id, user_book_id)
        stmt = stmt.where(ReadingSession.user_book_id == user_book_id)
    if start:
        stmt = stmt.where(ReadingSession.started_at >= day_bounds_utc(start, tz)[0])
    if end:
        stmt = stmt.where(ReadingSession.started_at < day_bounds_utc(end, tz)[1])
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.scalars(
        stmt.order_by(ReadingSession.started_at.desc())
        .offset((page - 1) * page_size).limit(page_size)
    ).all()
    return {
        "items": [serialize_session(s) for s in rows],
        "total": total, "page": page, "page_size": page_size,
        "pages": max(1, (total + page_size - 1) // page_size),
    }


@router.post("/books/{user_book_id}/sessions", status_code=201)
def create_book_session(
    user_book_id: str,
    payload: SessionIn,
    auth: AuthContext = Depends(require_csrf),
    db: Session = Depends(get_db),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
):
    ub = verify_own_book(db, auth.user.id, user_book_id)
    if idempotency_key:
        existing = db.scalar(
            select(ReadingSession).where(
                ReadingSession.user_id == auth.user.id,
                ReadingSession.client_ref == idempotency_key[:64],
            )
        )
        if existing:
            return serialize_session(existing)

    started = ensure_utc(payload.started_at)
    ended = ensure_utc(payload.ended_at)
    if ended - started > timedelta(hours=24):
        raise AppError("invalid_duration", "A session cannot exceed 24 hours.", 400)
    if payload.paused_seconds >= int((ended - started).total_seconds()):
        raise AppError("invalid_duration", "Paused time must be shorter than the session.", 400)
    for page_value in (payload.start_page, payload.end_page):
        if page_value is not None and ub.book.page_count and page_value > ub.book.page_count:
            raise AppError("invalid_page", f"Pages must be within 1–{ub.book.page_count}.", 400)

    duration = session_duration_seconds(started, ended, payload.paused_seconds)
    s = ReadingSession(
        user_id=auth.user.id, user_book_id=ub.id, started_at=started, ended_at=ended,
        paused_seconds=payload.paused_seconds, duration_seconds=duration,
        start_page=payload.start_page, end_page=payload.end_page,
        pages_read=pages_read(payload.start_page, payload.end_page),
        notes=payload.notes, source="manual",
        client_ref=idempotency_key[:64] if idempotency_key else None,
    )
    db.add(s)
    if payload.end_page is not None:
        ub.current_page = max(ub.current_page or 0, payload.end_page)
    if ub.status == "want_to_read":
        from app.services.books import apply_status

        apply_status(ub, "reading")
    db.commit()
    db.refresh(s)
    return serialize_session(s)


@router.patch("/sessions/{session_id}")
def update_session(
    session_id: str, payload: SessionUpdate,
    auth: AuthContext = Depends(require_csrf), db: Session = Depends(get_db),
):
    s = db.get(ReadingSession, session_id)
    if not s or s.user_id != auth.user.id:
        raise NotFound("Session")
    data = payload.model_dump(exclude_unset=True)
    started = ensure_utc(data.get("started_at") or s.started_at)
    ended = ensure_utc(data.get("ended_at") or s.ended_at)
    paused = data.get("paused_seconds", s.paused_seconds)
    if ended <= started:
        raise AppError("invalid_duration", "Session end must be after its start.", 400)
    if ended - started > timedelta(hours=24):
        raise AppError("invalid_duration", "A session cannot exceed 24 hours.", 400)
    if paused >= int((ended - started).total_seconds()):
        raise AppError("invalid_duration", "Paused time must be shorter than the session.", 400)
    start_page = data.get("start_page", s.start_page)
    end_page = data.get("end_page", s.end_page)
    if start_page is not None and end_page is not None and end_page < start_page:
        raise AppError("invalid_page", "End page cannot be before start page.", 400)
    page_count = s.user_book.book.page_count
    if page_count and any(p is not None and p > page_count for p in (start_page, end_page)):
        raise AppError("invalid_page", f"Pages must be within 1–{page_count}.", 400)
    s.started_at, s.ended_at, s.paused_seconds = started, ended, paused
    s.duration_seconds = session_duration_seconds(started, ended, paused)
    s.start_page, s.end_page = start_page, end_page
    s.pages_read = pages_read(start_page, end_page)
    if "notes" in data:
        s.notes = data["notes"]
    db.commit()
    db.refresh(s)
    return serialize_session(s)


@router.delete("/sessions/{session_id}", status_code=204)
def delete_session(
    session_id: str, auth: AuthContext = Depends(require_csrf), db: Session = Depends(get_db)
):
    s = db.get(ReadingSession, session_id)
    if not s or s.user_id != auth.user.id:
        raise NotFound("Session")
    db.delete(s)
    db.commit()
    return None


@router.get("/timer")
def get_timer(auth: AuthContext = Depends(require_csrf), db: Session = Depends(get_db)):
    t = db.scalar(select(ActiveTimer).where(ActiveTimer.user_id == auth.user.id))
    return {"timer": _timer_payload(t) if t else None}


@router.post("/timer/start", status_code=201)
def start_timer(
    payload: TimerStartIn, auth: AuthContext = Depends(require_csrf), db: Session = Depends(get_db)
):
    existing = db.scalar(select(ActiveTimer).where(ActiveTimer.user_id == auth.user.id))
    if existing:
        raise Conflict("A reading timer is already running.", {"timer": _timer_payload(existing)})
    ub = verify_own_book(db, auth.user.id, payload.user_book_id)
    started = ensure_utc(payload.started_at) if payload.started_at else datetime.now(timezone.utc)
    if started > datetime.now(timezone.utc):
        raise AppError("invalid_time", "A timer cannot start in the future.", 400)
    if datetime.now(timezone.utc) - started > timedelta(hours=12):
        raise AppError("invalid_time", "Timer start is too far in the past.", 400)
    start_page = payload.start_page if payload.start_page is not None else ub.current_page
    if ub.book.page_count and start_page is not None and start_page > ub.book.page_count:
        raise AppError("invalid_page", f"Pages must be within 1–{ub.book.page_count}.", 400)
    timer = ActiveTimer(
        user_id=auth.user.id, user_book_id=ub.id, started_at=started,
        accumulated_seconds=0, running=True, start_page=start_page, notes=payload.notes,
    )
    db.add(timer)
    db.commit()
    db.refresh(timer)
    return {"timer": _timer_payload(timer)}


@router.post("/timer/pause")
def pause_timer(auth: AuthContext = Depends(require_csrf), db: Session = Depends(get_db)):
    t = db.scalar(select(ActiveTimer).where(ActiveTimer.user_id == auth.user.id))
    if not t:
        raise NotFound("Timer")
    if t.running:
        now = datetime.now(timezone.utc)
        t.accumulated_seconds += max(0, int((now - ensure_utc(t.started_at)).total_seconds()))
        t.running = False
        t.paused_at = now
    db.commit()
    return {"timer": _timer_payload(t)}


@router.post("/timer/resume")
def resume_timer(auth: AuthContext = Depends(require_csrf), db: Session = Depends(get_db)):
    t = db.scalar(select(ActiveTimer).where(ActiveTimer.user_id == auth.user.id))
    if not t:
        raise NotFound("Timer")
    if not t.running:
        t.started_at = datetime.now(timezone.utc)
        t.running = True
        t.paused_at = None
    db.commit()
    return {"timer": _timer_payload(t)}


@router.post("/timer/stop", status_code=201)
def stop_timer(
    payload: TimerStopIn, auth: AuthContext = Depends(require_csrf), db: Session = Depends(get_db)
):
    t = db.scalar(select(ActiveTimer).where(ActiveTimer.user_id == auth.user.id))
    if not t:
        raise NotFound("Timer")
    now = datetime.now(timezone.utc)
    elapsed = t.accumulated_seconds
    if t.running:
        elapsed += max(0, int((now - ensure_utc(t.started_at)).total_seconds()))
    if elapsed < 5:
        raise AppError("too_short", "Sessions shorter than 5 seconds are not recorded.", 400)
    ended_at = now
    started_at = ended_at - timedelta(seconds=elapsed)
    ub = t.user_book
    end_page = payload.end_page
    if end_page is not None and ub.book.page_count and end_page > ub.book.page_count:
        raise AppError("invalid_page", f"Pages must be within 1–{ub.book.page_count}.", 400)
    if end_page is not None and t.start_page is not None and end_page < t.start_page:
        raise AppError("invalid_page", "End page cannot be before start page.", 400)
    session = ReadingSession(
        user_id=auth.user.id, user_book_id=t.user_book_id,
        started_at=started_at, ended_at=ended_at, paused_seconds=0,
        duration_seconds=elapsed, start_page=t.start_page, end_page=end_page,
        pages_read=pages_read(t.start_page, end_page), notes=payload.notes or t.notes,
        source="timer", client_ref=f"timer:{t.id}",
    )
    db.add(session)
    if end_page is not None:
        ub.current_page = max(ub.current_page or 0, end_page)
    db.delete(t)
    db.commit()
    db.refresh(session)
    return {"session": serialize_session(session)}


@router.delete("/timer", status_code=204)
def cancel_timer(auth: AuthContext = Depends(require_csrf), db: Session = Depends(get_db)):
    t = db.scalar(select(ActiveTimer).where(ActiveTimer.user_id == auth.user.id))
    if t:
        db.delete(t)
        db.commit()
    return None
