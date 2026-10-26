"""Persistent background worker.

Run alongside the API: `python -m app.tasks.worker`.
Claims jobs from the `background_jobs` table with SKIP LOCKED on PostgreSQL, so
multiple worker replicas can run safely. SQLite (development only) uses a simple
serialized claim.
"""
from __future__ import annotations

import asyncio
import signal
import time
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session
from zoneinfo import ZoneInfo

from app.core.config import settings, validate_runtime_config
from app.core.db import SessionLocal
from app.core.logging import configure_logging, log_event
from app.models.book import UserBook
from app.models.ops import BackgroundJob
from app.models.reading import ReadingGoal, ReadingSession
from app.models.user import User, UserSettings
from app.services.analytics import summary
from app.services.goals import compute_goal
from app.services.jobs import enqueue
from app.services.notifications import create_notification
from app.tasks.handlers import HANDLERS

_running = True


def claim_job(db: Session) -> BackgroundJob | None:
    now = datetime.now(timezone.utc)
    stmt = (
        select(BackgroundJob)
        .where(BackgroundJob.status == "queued", BackgroundJob.run_after <= now)
        .order_by(BackgroundJob.run_after)
        .limit(1)
    )
    if not settings.resolved_database_url.startswith("sqlite"):
        stmt = stmt.with_for_update(skip_locked=True)
    job = db.scalar(stmt)
    if job is None:
        return None
    job.status = "running"
    job.attempts += 1
    job.started_at = now
    db.commit()
    return job


def finish_job(db: Session, job: BackgroundJob, result: dict | None, error: str | None) -> None:
    now = datetime.now(timezone.utc)
    if error:
        job.error = error[:2000]
        if job.attempts < job.max_attempts:
            job.status = "queued"
            job.run_after = now + timedelta(seconds=min(300, 15 * job.attempts))
        else:
            job.status = "failed"
            job.finished_at = now
            log_event("job_failed", level=40, job_id=job.id, kind=job.kind, error=error[:300])
    else:
        job.status = "completed"
        job.result = result or {}
        job.error = None
        job.finished_at = now
    db.commit()


async def process_job(db: Session, job: BackgroundJob) -> None:
    handler = HANDLERS.get(job.kind)
    if handler is None:
        finish_job(db, job, None, f"No handler registered for kind '{job.kind}'")
        return
    try:
        result = await handler(db, job)
        db.commit()
        finish_job(db, job, result, None)
    except Exception as exc:
        db.rollback()
        finish_job(db, job, None, f"{type(exc).__name__}: {exc}")


def _local_now(tz: str) -> datetime:
    return datetime.now(timezone.utc).astimezone(ZoneInfo(tz))


def _within_minutes(local: datetime, hhmm: str, minutes: int = 5) -> bool:
    try:
        h, m = [int(x) for x in hhmm.split(":")]
    except ValueError:
        return False
    target = local.replace(hour=h, minute=m, second=0, microsecond=0)
    return 0 <= (local - target).total_seconds() < minutes * 60


def _weekly_rows(stats: dict, last7: dict) -> list[tuple[str, str]]:
    return [
        ("Books completed (last 7 days)", str(last7["books_completed"])),
        ("Pages read (last 7 days)", str(last7["pages"])),
        ("Minutes read (last 7 days)", f"{last7['minutes']:.0f}"),
        ("Sessions (last 7 days)", str(last7["sessions"])),
        ("Current streak", f"{stats['current_streak']} days"),
        ("Library size", str(stats["total_books"])),
    ]


def run_schedules(db: Session, window_minutes: int = 5) -> None:
    """Create due in-app notifications and enqueue report emails exactly once.

    ``window_minutes`` lets an infrequent cron invocation still catch a schedule
    that was due a few minutes earlier. Dedupe keys make repeated calls safe.
    """
    users = db.execute(
        select(User, UserSettings).join(UserSettings, UserSettings.user_id == User.id)
        .where(User.is_active.is_(True)).limit(2000)
    ).all()
    today_utc = datetime.now(timezone.utc)

    for user, cfg in users:
        tz = cfg.timezone or "UTC"
        try:
            local = _local_now(tz)
        except Exception:
            local = _local_now("UTC")
        weekday = local.weekday()

        # Daily reading reminder
        if cfg.notify_inapp and weekday in (cfg.reminder_days or []) and _within_minutes(local, cfg.reminder_time, window_minutes):
            reading = db.scalar(
                select(ReadingSession.id).where(
                    ReadingSession.user_id == user.id,
                    ReadingSession.started_at >= today_utc.replace(hour=0, minute=0, second=0, microsecond=0),
                ).limit(1)
            )
            if not reading:
                note = create_notification(
                    db, user, "reminder", "Time to read",
                    "A short session today keeps your streak alive. Pick up where you left off.",
                    f"reminder:{local.date().isoformat()}",
                    email_requested=bool(cfg.notify_email and settings.email_enabled),
                )
                if note and note.email_status == "pending":
                    enqueue(db, "email_report", {"notification_id": note.id,
                                                 "subject": "Time to read",
                                                 "body": note.body}, user_id=user.id)

        # Weekly summary (Monday 08:00 local) and monthly report (1st, 08:00)
        special = None
        if weekday == 0 and _within_minutes(local, "08:00", window_minutes):
            special = ("weekly", f"week:{local.isocalendar().year}-{local.isocalendar().week}")
        elif local.day == 1 and _within_minutes(local, "08:00", window_minutes):
            special = ("monthly", f"month:{local.year}-{local.month}")
        if special:
            kind, dedupe = special
            if kind == "weekly" and not (cfg.weekly_summary or cfg.notify_inapp):
                continue
            if kind == "monthly" and not (cfg.monthly_report or cfg.notify_inapp):
                continue
            stats = summary(db, user, cfg)
            since = today_utc - timedelta(days=7)
            rows = db.scalars(
                select(ReadingSession).where(ReadingSession.user_id == user.id, ReadingSession.started_at >= since)
            ).all()
            completed = db.scalar(
                select(ReadingSession.id).where(ReadingSession.user_id == user.id)
            )
            last7 = {
                "books_completed": 0,
                "pages": sum(s.pages_read or 0 for s in rows),
                "minutes": sum(s.duration_seconds for s in rows) / 60,
                "sessions": len(rows),
            }
            title = "Your weekly reading summary" if kind == "weekly" else "Your monthly reading report"
            body = (
                f"You read {last7['pages']} pages in {last7['sessions']} session(s) "
                f"over the last 7 days. Current streak: {stats['current_streak']} day(s)."
            )
            note = create_notification(
                db, user, "report", title, body, f"{dedupe}:{kind}",
                email_requested=bool(cfg.notify_email and settings.email_enabled),
            )
            if note and note.email_status == "pending":
                enqueue(db, "email_report", {
                    "notification_id": note.id, "subject": title, "body": body,
                    "rows": _weekly_rows(stats, last7),
                }, user_id=user.id)

        # Completed goals
        active_goals = db.scalars(
            select(ReadingGoal).where(ReadingGoal.user_id == user.id, ReadingGoal.is_active.is_(True))
        ).all()
        for goal in active_goals:
            progress = compute_goal(db, user, goal, tz)
            if progress["completed"] and goal.completed_at is None:
                goal.completed_at = datetime.now(timezone.utc)
                create_notification(
                    db, user, "goal", "Goal achieved",
                    f"You completed “{goal.name}”. {progress['current_value']} of {progress['target_value']}.",
                    f"goal-complete:{goal.id}",
                )

        # Long-paused books, once per month
        paused = db.scalars(
            select(UserBook).where(
                UserBook.user_id == user.id, UserBook.status == "paused",
                UserBook.archived.is_(False),
                UserBook.updated_at < datetime.now(timezone.utc) - timedelta(days=14),
            ).limit(3)
        ).all()
        for ub in paused:
            create_notification(
                db, user, "paused", "Still thinking about this one?",
                f"“{ub.book.title}” has been paused for a while. Resume it or move it to your wishlist.",
                f"paused:{ub.id}:{local.year}-{local.month}",
            )
        db.commit()


def main() -> None:
    configure_logging()
    problems = validate_runtime_config()
    if problems:
        for p in problems:
            log_event("config_error", level=40, problem=p)
        raise SystemExit("Refusing to start worker with invalid production configuration.")
    log_event("worker_started", environment=settings.environment)
    last_schedule = 0.0
    while _running:
        db = SessionLocal()
        try:
            if time.monotonic() - last_schedule > 60:
                try:
                    run_schedules(db)
                except Exception as exc:
                    db.rollback()
                    log_event("scheduler_error", level=40, error=f"{type(exc).__name__}: {exc}")
                last_schedule = time.monotonic()
            job = claim_job(db)
            if job is None:
                db.close()
                time.sleep(2)
                continue
            log_event("job_started", job_id=job.id, kind=job.kind, attempt=job.attempts)
            asyncio.run(process_job(db, job))
            db.close()
        except Exception as exc:
            db.rollback()
            log_event("worker_loop_error", level=40, error=f"{type(exc).__name__}: {exc}")
            db.close()
            time.sleep(2)


def _stop(*_args) -> None:
    global _running
    _running = False


if __name__ == "__main__":
    signal.signal(signal.SIGINT, _stop)
    signal.signal(signal.SIGTERM, _stop)
    main()
