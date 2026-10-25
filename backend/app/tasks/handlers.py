from __future__ import annotations

import io
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.core.errors import AIUnavailable
from app.models.ai import AISummary, UploadedDocument
from app.models.book import UserBook
from app.models.ops import BackgroundJob, ExportJob, Notification
from app.models.user import User
from app.services import exporter, importer
from app.services.ai.service import extract_insights, generate_summary
from app.services.email import report_html, send_email
from app.services.notifications import create_notification
from app.services.storage import get_storage


async def handle_export(db: Session, job: BackgroundJob) -> dict:
    user = db.get(User, job.user_id)
    if not user:
        raise RuntimeError("User no longer exists")
    export = db.get(ExportJob, job.payload.get("export_id")) if job.payload.get("export_id") else None
    if export is None or export.user_id != user.id:
        raise RuntimeError("Export record missing")
    fmt = export.format
    builders = {
        "library_csv": lambda: exporter.library_csv(db, user),
        "library_json": lambda: exporter.library_json(db, user),
        "sessions_csv": lambda: exporter.sessions_csv(db, user),
        "notes_md": lambda: exporter.notes_markdown(db, user),
        "report_pdf": lambda: exporter.report_pdf(db, user, user.settings, "month"),
        "archive_zip": lambda: exporter.archive_zip(db, user, user.settings),
    }
    if fmt not in builders:
        raise RuntimeError("Unsupported export format")
    filename, content_type, data = builders[fmt]()
    key = f"exports/{user.id}/{uuid.uuid4().hex}-{filename}"
    get_storage().save(key, data, content_type)
    export.storage_key = key
    export.filename = filename
    export.size_bytes = len(data)
    export.status = "ready"
    export.expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    db.add(export)
    return {"export_id": export.id, "filename": filename, "size_bytes": len(data)}


async def handle_import(db: Session, job: BackgroundJob) -> dict:
    import_job_id = job.payload.get("import_id")
    from app.models.ops import ImportJob

    imp = db.get(ImportJob, import_job_id)
    if not imp or imp.user_id != job.user_id:
        raise RuntimeError("Import record missing")
    imp.status = "running"
    db.commit()
    result = importer.commit(db, imp)
    return result


async def handle_ai_summary(db: Session, job: BackgroundJob) -> dict:
    user = db.get(User, job.user_id)
    ub = db.get(UserBook, job.payload.get("user_book_id"))
    if not user or not ub or ub.user_id != user.id:
        raise RuntimeError("Book not found for this user")
    summary = await generate_summary(
        db, user, ub, job.payload.get("kind", "short"), job.payload.get("length", "medium"),
        job.payload.get("document_ids", []),
    )
    return {"summary_id": summary.id}


async def handle_ai_insights(db: Session, job: BackgroundJob) -> dict:
    user = db.get(User, job.user_id)
    if not user:
        raise RuntimeError("User missing")
    created = await extract_insights(
        db, user, job.payload.get("user_book_id"), int(job.payload.get("limit_notes", 40))
    )
    return {"created": created}


async def handle_document_extract(db: Session, job: BackgroundJob) -> dict:
    doc = db.get(UploadedDocument, job.payload.get("document_id"))
    if not doc:
        raise RuntimeError("Document missing")
    raw = get_storage().read(doc.storage_key)
    text = ""
    if doc.mime_type == "application/pdf" or doc.filename.lower().endswith(".pdf"):
        from pypdf import PdfReader

        reader = PdfReader(io.BytesIO(raw))
        text = "\n\n".join((page.extract_text() or "") for page in reader.pages[:400])
    else:
        text = raw.decode("utf-8", errors="replace")
    text = text.strip()
    if not text:
        doc.status = "failed"
        doc.error = "No selectable text could be extracted from this file."
    else:
        doc.extracted_text = text[:400000]
        doc.status = "ready"
        doc.error = None
    return {"document_id": doc.id, "status": doc.status, "chars": len(doc.extracted_text or "")}


async def handle_email_report(db: Session, job: BackgroundJob) -> dict:
    user = db.get(User, job.user_id)
    if not user:
        raise RuntimeError("User missing")
    note = db.get(Notification, job.payload.get("notification_id")) if job.payload.get("notification_id") else None
    title = job.payload.get("subject") or (note.title if note else "YVO's Book Vault report")
    body = job.payload.get("body") or (note.body if note else "")
    html = report_html(title, body, list(job.payload.get("rows", [])), "Sent because you enabled reading emails in YVO's Book Vault.")
    result = await send_email(user.email, title, html)
    if note:
        note.email_status = result["status"]
    return result


async def handle_email_test(db: Session, job: BackgroundJob) -> dict:
    user = db.get(User, job.user_id)
    if not user:
        raise RuntimeError("User missing")
    result = await send_email(
        job.payload.get("to") or user.email,
        "YVO's Book Vault email test",
        report_html("Email test", "If you received this, transactional email is configured correctly.",
                    [("Provider", "Resend"), ("Status", "accepted")], "Test message from YVO's Book Vault."),
    )
    if result["status"] == "failed":
        raise RuntimeError(result["error"] or "Email delivery failed")
    return result


HANDLERS = {
    "export": handle_export,
    "import_commit": handle_import,
    "ai_summary": handle_ai_summary,
    "ai_insights": handle_ai_insights,
    "document_extract": handle_document_extract,
    "email_report": handle_email_report,
    "email_test": handle_email_test,
}
