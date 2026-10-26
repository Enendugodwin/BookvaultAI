from __future__ import annotations

import hmac

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.db import get_db
from app.core.errors import AppError, Unauthorized
from app.tasks.runner import tick

router = APIRouter(prefix="/internal", tags=["internal"])


@router.get("/jobs/tick")
async def jobs_tick(request: Request, db: Session = Depends(get_db)):
    """Vercel Cron entrypoint. Requires ``Authorization: Bearer $CRON_SECRET``."""
    if not settings.cron_secret:
        raise AppError(
            "cron_disabled",
            "CRON_SECRET is not configured, so the job tick endpoint is disabled.",
            503,
        )
    header = request.headers.get("authorization", "")
    expected = f"Bearer {settings.cron_secret}"
    if not hmac.compare_digest(header, expected):
        raise Unauthorized("Invalid cron credentials.")
    return await tick(db, limit=settings.cron_job_limit)
