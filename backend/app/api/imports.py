from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, File, UploadFile
from fastapi.responses import PlainTextResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import AuthContext, require_csrf
from app.core.config import settings
from app.core.db import get_db
from app.core.errors import AppError, NotFound
from app.models.ops import ImportJob
from app.services import importer
from app.services.jobs import enqueue

router = APIRouter(prefix="/imports", tags=["imports"])

MAX_BYTES = 5 * 1024 * 1024


@router.get("/template", response_class=PlainTextResponse)
def template(auth: AuthContext = Depends(require_csrf)):
    return PlainTextResponse(
        importer.template_csv(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="yvos-book-vault-import-template.csv"'},
    )


@router.post("", status_code=201)
async def preview_import(
    file: UploadFile = File(...),
    auth: AuthContext = Depends(require_csrf),
    db: Session = Depends(get_db),
):
    filename = Path(file.filename or "import").name
    ext = Path(filename).suffix.lower()
    if ext not in (".csv", ".json"):
        raise AppError("invalid_file_type", "Upload a .csv or .json file.", 400)
    raw = await file.read(MAX_BYTES + 1)
    if len(raw) > MAX_BYTES:
        raise AppError("file_too_large", "Import files are limited to 5 MB.", 413)
    try:
        content = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise AppError("invalid_encoding", "The file must be UTF-8 encoded.", 400)
    kind = "books_json" if ext == ".json" else "books_csv"
    job = importer.preview(db, auth.user, filename, kind, content)
    return {
        "id": job.id,
        "filename": job.filename,
        "kind": job.kind,
        "status": job.status,
        "total_rows": job.total_rows,
        "preview": job.preview,
        "duplicates": job.skipped_rows,
        "errors": job.error_rows,
    }


@router.get("")
def list_imports(auth: AuthContext = Depends(require_csrf), db: Session = Depends(get_db)):
    rows = db.scalars(
        select(ImportJob).where(ImportJob.user_id == auth.user.id)
        .order_by(ImportJob.created_at.desc()).limit(50)
    ).all()
    return {"items": [_out(j) for j in rows]}


@router.get("/{import_id}")
def get_import(
    import_id: str, auth: AuthContext = Depends(require_csrf), db: Session = Depends(get_db)
):
    job = db.get(ImportJob, import_id)
    if not job or job.user_id != auth.user.id:
        raise NotFound("Import")
    return _out(job)


@router.post("/{import_id}/commit", status_code=202)
def commit_import(
    import_id: str, auth: AuthContext = Depends(require_csrf), db: Session = Depends(get_db)
):
    job = db.get(ImportJob, import_id)
    if not job or job.user_id != auth.user.id:
        raise NotFound("Import")
    if job.status not in ("preview", "failed"):
        raise AppError("invalid_state", "This import has already been processed.", 409)
    if job.total_rows > settings.max_import_rows:
        raise AppError("too_large", f"Imports are limited to {settings.max_import_rows} rows.", 413)
    job.status = "queued"
    bg = enqueue(db, "import_commit", {"import_id": job.id}, user_id=auth.user.id)
    db.commit()
    return {"job_id": bg.id, "status": "queued", "import_id": job.id}


@router.delete("/{import_id}", status_code=204)
def delete_import(
    import_id: str, auth: AuthContext = Depends(require_csrf), db: Session = Depends(get_db)
):
    job = db.get(ImportJob, import_id)
    if not job or job.user_id != auth.user.id:
        raise NotFound("Import")
    db.delete(job)
    db.commit()
    return None


def _out(job: ImportJob) -> dict:
    return {
        "id": job.id,
        "filename": job.filename,
        "kind": job.kind,
        "status": job.status,
        "total_rows": job.total_rows,
        "imported_rows": job.imported_rows,
        "skipped_rows": job.skipped_rows,
        "errors": (job.error_rows or [])[:50],
        "preview": (job.preview or [])[:100],
        "created_at": job.created_at,
        "updated_at": job.updated_at,
    }
