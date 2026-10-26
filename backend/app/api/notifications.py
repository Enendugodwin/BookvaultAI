from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import AuthContext, require_csrf
from app.core.config import settings
from app.core.db import get_db
from app.core.errors import AppError, NotFound
from app.models.ops import Notification
from app.models.reading import ReadingSession
from app.services.analytics import summary
from app.services.jobs import enqueue
from app.tasks.runner import run_job_now

router = APIRouter(prefix="/notifications", tags=["notifications"])


class ReportRequest(BaseModel):
    period: str = Field(default="week", pattern="^(week|month)$")


def _out(n: Notification) -> dict:
    return {
        "id": n.id, "category": n.category, "title": n.title, "body": n.body,
        "read": n.read_at is not None, "read_at": n.read_at,
        "email_status": n.email_status, "created_at": n.created_at,
    }


@router.get("")
def list_notifications(
    auth: AuthContext = Depends(require_csrf), db: Session = Depends(get_db),
    unread_only: bool = False,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=30, ge=1, le=100),
):
    stmt = select(Notification).where(Notification.user_id == auth.user.id)
    if unread_only:
        stmt = stmt.where(Notification.read_at.is_(None))
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.scalars(
        stmt.order_by(Notification.created_at.desc())
        .offset((page - 1) * page_size).limit(page_size)
    ).all()
    unread = db.scalar(
        select(func.count(Notification.id)).where(
            Notification.user_id == auth.user.id, Notification.read_at.is_(None)
        )
    ) or 0
    return {
        "items": [_out(n) for n in rows], "unread": unread, "total": total,
        "page": page, "page_size": page_size,
    }


@router.post("/{notification_id}/read")
def mark_read(
    notification_id: str, auth: AuthContext = Depends(require_csrf), db: Session = Depends(get_db)
):
    n = db.get(Notification, notification_id)
    if not n or n.user_id != auth.user.id:
        raise NotFound("Notification")
    if n.read_at is None:
        n.read_at = datetime.now(timezone.utc)
    db.commit()
    return {"message": "Marked as read."}


@router.post("/read-all")
def mark_all_read(auth: AuthContext = Depends(require_csrf), db: Session = Depends(get_db)):
    db.query(Notification).filter(
        Notification.user_id == auth.user.id, Notification.read_at.is_(None)
    ).update({"read_at": datetime.now(timezone.utc)})
    db.commit()
    return {"message": "All notifications marked as read."}


@router.delete("/{notification_id}", status_code=204)
def delete_notification(
    notification_id: str, auth: AuthContext = Depends(require_csrf), db: Session = Depends(get_db)
):
    n = db.get(Notification, notification_id)
    if not n or n.user_id != auth.user.id:
        raise NotFound("Notification")
    db.delete(n)
    db.commit()
    return None


@router.post("/test-email", status_code=202)
async def test_email(auth: AuthContext = Depends(require_csrf), db: Session = Depends(get_db)):
    if not settings.email_enabled:
        raise AppError("email_disabled", "Transactional email is not configured on this server.", 400)
    job = enqueue(db, "email_test", {"to": auth.user.email}, user_id=auth.user.id)
    db.commit()
    if settings.run_jobs_inline:
        await run_job_now(db, job)
    return {"job_id": job.id, "status": job.status, "to": auth.user.email}


@router.get("/reports/preview")
def preview_report(
    auth: AuthContext = Depends(require_csrf), db: Session = Depends(get_db),
    period: str = Query(default="week", pattern="^(week|month)$"),
):
    days = 7 if period == "week" else 30
    since = datetime.now(timezone.utc) - timedelta(days=days)
    sessions = db.scalars(
        select(ReadingSession).where(
            ReadingSession.user_id == auth.user.id, ReadingSession.started_at >= since
        )
    ).all()
    stats = summary(db, auth.user, auth.user.settings)
    pages = sum(s.pages_read or 0 for s in sessions)
    minutes = round(sum(s.duration_seconds for s in sessions) / 60.0, 1)
    return {
        "period": period,
        "title": "Weekly reading summary" if period == "week" else "Monthly reading report",
        "rows": [
            ["Books completed", "tracked separately"],
            ["Pages read", str(pages)],
            ["Minutes read", f"{minutes:.0f}"],
            ["Sessions", str(len(sessions))],
            ["Current streak", f"{stats['current_streak']} days"],
            ["Library size", str(stats["total_books"])],
        ],
        "email_configured": settings.email_enabled,
        "email_enabled_by_user": auth.user.settings.notify_email,
    }


@router.post("/reports/send", status_code=202)
async def send_report(
    payload: ReportRequest, auth: AuthContext = Depends(require_csrf), db: Session = Depends(get_db)
):
    if not settings.email_enabled:
        raise AppError("email_disabled", "Transactional email is not configured on this server.", 400)
    days = 7 if payload.period == "week" else 30
    since = datetime.now(timezone.utc) - timedelta(days=days)
    sessions = db.scalars(
        select(ReadingSession).where(
            ReadingSession.user_id == auth.user.id, ReadingSession.started_at >= since
        )
    ).all()
    stats = summary(db, auth.user, auth.user.settings)
    pages = sum(s.pages_read or 0 for s in sessions)
    minutes = round(sum(s.duration_seconds for s in sessions) / 60.0, 1)
    title = "Your weekly reading summary" if payload.period == "week" else "Your monthly reading report"
    rows = [
        ["Pages read", str(pages)], ["Minutes read", f"{minutes:.0f}"],
        ["Sessions", str(len(sessions))], ["Current streak", f"{stats['current_streak']} days"],
        ["Library size", str(stats["total_books"])],
    ]
    job = enqueue(db, "email_report", {
        "subject": title,
        "body": f"Here is your {payload.period} reading summary.",
        "rows": rows,
    }, user_id=auth.user.id)
    db.commit()
    if settings.run_jobs_inline:
        await run_job_now(db, job)
    return {"job_id": job.id, "status": job.status}
