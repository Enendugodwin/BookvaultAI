from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import AuthContext, get_current
from app.core.db import get_db
from app.core.errors import NotFound
from app.models.ops import BackgroundJob

router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.get("/{job_id}")
def get_job(job_id: str, auth: AuthContext = Depends(get_current), db: Session = Depends(get_db)):
    job = db.get(BackgroundJob, job_id)
    if not job or job.user_id != auth.user.id:
        raise NotFound("Job")
    return {
        "id": job.id,
        "kind": job.kind,
        "status": job.status,
        "attempts": job.attempts,
        "result": job.result,
        "error": job.error,
        "created_at": job.created_at,
        "started_at": job.started_at,
        "finished_at": job.finished_at,
    }
