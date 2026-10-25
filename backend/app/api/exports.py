from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import AuthContext, audit, require_csrf
from app.core.db import get_db
from app.core.errors import AppError, NotFound
from app.models.ops import ExportJob
from app.services.jobs import enqueue
from app.services.storage import get_storage

router = APIRouter(prefix="/exports", tags=["exports"])

FORMATS = {
    "library_csv": ("text/csv; charset=utf-8", "csv"),
    "library_json": ("application/json", "json"),
    "sessions_csv": ("text/csv; charset=utf-8", "csv"),
    "notes_md": ("text/markdown; charset=utf-8", "md"),
    "report_pdf": ("application/pdf", "pdf"),
    "archive_zip": ("application/zip", "zip"),
}


class ExportRequest(BaseModel):
    format: str = Field(pattern="^(library_csv|library_json|sessions_csv|notes_md|report_pdf|archive_zip)$")


def _out(job: ExportJob) -> dict:
    now = datetime.now(timezone.utc)
    expires = job.expires_at
    if expires is not None and expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    return {
        "id": job.id,
        "format": job.format,
        "status": job.status,
        "filename": job.filename,
        "size_bytes": job.size_bytes,
        "created_at": job.created_at,
        "expires_at": job.expires_at,
        "downloadable": job.status == "ready" and (expires is None or expires > now),
    }


@router.get("")
def list_exports(auth: AuthContext = Depends(require_csrf), db: Session = Depends(get_db)):
    rows = db.scalars(
        select(ExportJob).where(ExportJob.user_id == auth.user.id)
        .order_by(ExportJob.created_at.desc()).limit(50)
    ).all()
    return {"items": [_out(j) for j in rows]}


@router.post("", status_code=202)
def create_export(
    payload: ExportRequest, auth: AuthContext = Depends(require_csrf), db: Session = Depends(get_db)
):
    job = ExportJob(user_id=auth.user.id, format=payload.format, status="queued")
    db.add(job)
    db.flush()
    bg = enqueue(db, "export", {"export_id": job.id, "format": payload.format}, user_id=auth.user.id)
    job.job_id = bg.id
    audit(db, auth.user.id, "export.requested", {"format": payload.format, "export_id": job.id})
    db.commit()
    return {"id": job.id, "job_id": bg.id, "status": "queued", "format": payload.format}


@router.get("/{export_id}")
def get_export(
    export_id: str, auth: AuthContext = Depends(require_csrf), db: Session = Depends(get_db)
):
    job = db.get(ExportJob, export_id)
    if not job or job.user_id != auth.user.id:
        raise NotFound("Export")
    return _out(job)


@router.get("/{export_id}/download")
def download_export(
    export_id: str, auth: AuthContext = Depends(require_csrf), db: Session = Depends(get_db)
):
    job = db.get(ExportJob, export_id)
    if not job or job.user_id != auth.user.id:
        raise NotFound("Export")
    if job.status != "ready" or not job.storage_key:
        raise AppError("not_ready", "This export is not ready yet.", 409)
    expires = job.expires_at
    if expires is not None:
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        if expires < datetime.now(timezone.utc):
            raise AppError("expired", "This export has expired. Generate a new one.", 410)
    try:
        data = get_storage().read(job.storage_key)
    except FileNotFoundError:
        raise AppError("missing_file", "The export file is no longer available.", 410)
    media_type = FORMATS.get(job.format, ("application/octet-stream", "bin"))[0]
    filename = (job.filename or f"bookvault-export-{job.id}").replace('"', "")
    return Response(
        content=data,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.delete("/{export_id}", status_code=204)
def delete_export(
    export_id: str, auth: AuthContext = Depends(require_csrf), db: Session = Depends(get_db)
):
    job = db.get(ExportJob, export_id)
    if not job or job.user_id != auth.user.id:
        raise NotFound("Export")
    if job.storage_key:
        try:
            get_storage().delete(job.storage_key)
        except Exception:
            pass
    db.delete(job)
    db.commit()
    return None
