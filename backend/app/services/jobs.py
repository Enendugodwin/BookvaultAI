from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.ops import BackgroundJob


def enqueue(
    db: Session,
    kind: str,
    payload: dict,
    *,
    user_id: str | None = None,
    run_after: datetime | None = None,
    max_attempts: int = 3,
) -> BackgroundJob:
    job = BackgroundJob(
        user_id=user_id,
        kind=kind,
        status="queued",
        payload=payload,
        attempts=0,
        max_attempts=max_attempts,
        run_after=run_after or datetime.now(timezone.utc),
    )
    db.add(job)
    db.flush()
    return job
