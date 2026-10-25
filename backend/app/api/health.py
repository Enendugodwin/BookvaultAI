from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.core.config import settings, validate_runtime_config
from app.core.db import get_db
from app.models.ops import BackgroundJob

router = APIRouter(tags=["health"])

VERSION = "1.0.0"


@router.get("/health")
def health():
    return {
        "status": "ok",
        "service": "yvos-book-vault-api",
        "version": VERSION,
        "environment": settings.environment,
        "time": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/health/ready")
def ready(db: Session = Depends(get_db)):
    checks: dict = {"database": False}
    try:
        db.execute(text("SELECT 1"))
        checks["database"] = True
    except Exception:
        checks["database"] = False

    try:
        queued = db.scalar(
            select(func.count(BackgroundJob.id)).where(BackgroundJob.status == "queued")
        ) or 0
        running = db.scalar(
            select(func.count(BackgroundJob.id)).where(BackgroundJob.status == "running")
        ) or 0
        failed = db.scalar(
            select(func.count(BackgroundJob.id)).where(BackgroundJob.status == "failed")
        ) or 0
        checks["jobs"] = {"queued": queued, "running": running, "failed": failed}
    except Exception:
        checks["jobs"] = None

    checks.update({
        "ai_provider": settings.ai_provider,
        "email_provider": settings.email_provider,
        "storage_backend": settings.storage_backend,
        "config_problems": validate_runtime_config(),
    })
    ok = bool(checks["database"]) and not checks["config_problems"]
    return JSONResponse(
        status_code=200 if ok else 503,
        content={
            "status": "ready" if ok else "degraded",
            "version": VERSION,
            "checks": checks,
            "time": datetime.now(timezone.utc).isoformat(),
        },
    )
