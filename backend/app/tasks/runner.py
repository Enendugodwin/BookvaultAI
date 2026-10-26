"""Job execution helpers for serverless requests and cron ticks."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.logging import log_event
from app.models.ops import BackgroundJob
from app.tasks.worker import claim_job, process_job, run_schedules


async def run_job_now(db: Session, job: BackgroundJob) -> BackgroundJob:
    """Claim and run a just-enqueued job inside the current request.

    Vercel Functions do not keep a process alive after the response, so jobs
    created by a user request must finish before that request returns.
    """
    now = datetime.now(timezone.utc)
    job.status = "running"
    job.attempts += 1
    job.started_at = now
    db.commit()
    log_event("job_started_inline", job_id=job.id, kind=job.kind, attempt=job.attempts)
    await process_job(db, job)
    return job


def reap_stale_jobs(db: Session, minutes: int = 10) -> int:
    """Requeue jobs left running by a killed serverless invocation."""
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=minutes)
    stale = db.scalars(
        select(BackgroundJob).where(
            BackgroundJob.status == "running",
            BackgroundJob.started_at.is_not(None),
            BackgroundJob.started_at < cutoff,
        )
    ).all()
    for job in stale:
        if job.attempts < job.max_attempts:
            job.status = "queued"
            job.run_after = datetime.now(timezone.utc)
            job.error = "Recovered after an interrupted serverless invocation."
        else:
            job.status = "failed"
            job.finished_at = datetime.now(timezone.utc)
            job.error = "Job exceeded its attempts after an interrupted invocation."
        log_event("job_reaped", level=30, job_id=job.id, kind=job.kind, status=job.status)
    if stale:
        db.commit()
    return len(stale)


async def tick(db: Session, limit: int = 2) -> dict:
    """Run due schedules and a bounded number of queued jobs.

    Called by Vercel Cron. The limit keeps the invocation inside the function
    duration budget; user-initiated jobs are normally already processed inline.
    """
    reaped = reap_stale_jobs(db)

    schedule_error = None
    try:
        run_schedules(db, window_minutes=30)
    except Exception as exc:  # a bad user timezone must not stop job processing
        db.rollback()
        schedule_error = f"{type(exc).__name__}: {exc}"
        log_event("scheduler_error", level=40, error=schedule_error[:300])

    processed = 0
    failed = 0
    for _ in range(max(0, limit)):
        job = claim_job(db)
        if job is None:
            break
        log_event("job_started_cron", job_id=job.id, kind=job.kind, attempt=job.attempts)
        await process_job(db, job)
        processed += 1
        if job.status == "failed":
            failed += 1

    return {
        "processed": processed,
        "failed": failed,
        "reaped": reaped,
        "schedule_error": schedule_error,
    }
