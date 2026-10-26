from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, Query, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import AuthContext, audit, require_csrf, verify_own_book
from app.core.config import settings
from app.core.db import get_db
from app.core.errors import AppError, NotFound
from app.models.ai import (
    AIConversation, AIConversationMessage, AISummary, UploadedDocument,
)
from app.models.knowledge import AIInsight, Note
from app.models.ops import ExportJob  # noqa: F401  (keeps mapper registry import order stable)
from app.models.user import User
from app.schemas.ai import (
    ConversationIn, InsightExtractIn, MessageIn, RecommendationIn, SummaryIn,
)
from app.services.ai import service as ai_service
from app.services.jobs import enqueue
from app.services.storage import get_storage
from app.tasks.runner import run_job_now

router = APIRouter(prefix="/ai", tags=["ai"])

ALLOWED_DOC_TYPES = {
    ".pdf": "application/pdf",
    ".txt": "text/plain",
    ".md": "text/markdown",
}


@router.get("/status")
def status(auth: AuthContext = Depends(require_csrf), db: Session = Depends(get_db)):
    return ai_service.ai_status(db, auth.user)


@router.post("/test")
async def test(auth: AuthContext = Depends(require_csrf), db: Session = Depends(get_db)):
    if not auth.user.settings.ai_enabled:
        raise AppError("ai_disabled", "Enable AI in Settings first.", 400)
    return await ai_service.test_connection(db, auth.user)


@router.post("/summaries", status_code=202)
async def create_summary(
    payload: SummaryIn, auth: AuthContext = Depends(require_csrf), db: Session = Depends(get_db)
):
    ub = verify_own_book(db, auth.user.id, payload.user_book_id)
    ai_service.ensure_available(db, auth.user)
    for doc_id in payload.document_ids:
        doc = db.get(UploadedDocument, doc_id)
        if not doc or doc.user_id != auth.user.id or doc.status != "ready":
            raise AppError("invalid_document", "One of the selected documents is not ready.", 400)
    job = enqueue(db, "ai_summary", {
        "user_book_id": ub.id, "kind": payload.kind, "length": payload.length,
        "document_ids": payload.document_ids,
    }, user_id=auth.user.id)
    db.commit()
    if settings.run_jobs_inline:
        await run_job_now(db, job)
    return {"job_id": job.id, "status": job.status}


@router.get("/summaries")
def list_summaries(
    auth: AuthContext = Depends(require_csrf), db: Session = Depends(get_db),
    user_book_id: str | None = None,
):
    stmt = select(AISummary).where(AISummary.user_id == auth.user.id)
    if user_book_id:
        stmt = stmt.where(AISummary.user_book_id == user_book_id)
    rows = db.scalars(stmt.order_by(AISummary.created_at.desc()).limit(100)).all()
    return {"items": [_summary_out(s) for s in rows]}


@router.get("/summaries/{summary_id}")
def get_summary(
    summary_id: str, auth: AuthContext = Depends(require_csrf), db: Session = Depends(get_db)
):
    s = db.get(AISummary, summary_id)
    if not s or s.user_id != auth.user.id:
        raise NotFound("Summary")
    return _summary_out(s)


@router.delete("/summaries/{summary_id}", status_code=204)
def delete_summary(
    summary_id: str, auth: AuthContext = Depends(require_csrf), db: Session = Depends(get_db)
):
    s = db.get(AISummary, summary_id)
    if not s or s.user_id != auth.user.id:
        raise NotFound("Summary")
    db.delete(s)
    db.commit()
    return None


# ------------------------------------------------------------------ conversations
@router.get("/conversations")
def list_conversations(auth: AuthContext = Depends(require_csrf), db: Session = Depends(get_db)):
    rows = db.scalars(
        select(AIConversation).where(AIConversation.user_id == auth.user.id)
        .order_by(AIConversation.updated_at.desc()).limit(50)
    ).all()
    return {"items": [{
        "id": c.id, "title": c.title, "user_book_id": c.user_book_id,
        "created_at": c.created_at, "updated_at": c.updated_at,
    } for c in rows]}


@router.post("/conversations", status_code=201)
def create_conversation(
    payload: ConversationIn, auth: AuthContext = Depends(require_csrf), db: Session = Depends(get_db)
):
    if payload.user_book_id:
        verify_own_book(db, auth.user.id, payload.user_book_id)
    conv = AIConversation(
        user_id=auth.user.id, user_book_id=payload.user_book_id,
        title=(payload.title or "New conversation")[:200],
    )
    db.add(conv)
    db.commit()
    db.refresh(conv)
    return {"id": conv.id, "title": conv.title, "user_book_id": conv.user_book_id}


@router.get("/conversations/{conversation_id}")
def get_conversation(
    conversation_id: str, auth: AuthContext = Depends(require_csrf), db: Session = Depends(get_db)
):
    conv = db.get(AIConversation, conversation_id)
    if not conv or conv.user_id != auth.user.id:
        raise NotFound("Conversation")
    messages = db.scalars(
        select(AIConversationMessage)
        .where(AIConversationMessage.conversation_id == conv.id)
        .order_by(AIConversationMessage.created_at)
    ).all()
    return {
        "id": conv.id, "title": conv.title, "user_book_id": conv.user_book_id,
        "messages": [{
            "id": m.id, "role": m.role, "content": m.content, "citations": m.citations,
            "created_at": m.created_at,
        } for m in messages],
    }


@router.post("/conversations/{conversation_id}/messages")
async def post_message(
    conversation_id: str, payload: MessageIn,
    auth: AuthContext = Depends(require_csrf), db: Session = Depends(get_db),
):
    conv = db.get(AIConversation, conversation_id)
    if not conv or conv.user_id != auth.user.id:
        raise NotFound("Conversation")
    return await ai_service.chat_turn(db, auth.user, conv, payload.content)


@router.delete("/conversations/{conversation_id}", status_code=204)
def delete_conversation(
    conversation_id: str, auth: AuthContext = Depends(require_csrf), db: Session = Depends(get_db)
):
    conv = db.get(AIConversation, conversation_id)
    if not conv or conv.user_id != auth.user.id:
        raise NotFound("Conversation")
    db.delete(conv)
    db.commit()
    return None


# ----------------------------------------------------------------------- insights
@router.post("/insights", status_code=202)
async def extract(
    payload: InsightExtractIn, auth: AuthContext = Depends(require_csrf), db: Session = Depends(get_db)
):
    if payload.user_book_id:
        verify_own_book(db, auth.user.id, payload.user_book_id)
    ai_service.ensure_available(db, auth.user)
    job = enqueue(db, "ai_insights", {
        "user_book_id": payload.user_book_id, "limit_notes": payload.limit_notes,
    }, user_id=auth.user.id)
    db.commit()
    if settings.run_jobs_inline:
        await run_job_now(db, job)
    return {"job_id": job.id, "status": job.status}


@router.get("/insights")
def list_insights(
    auth: AuthContext = Depends(require_csrf), db: Session = Depends(get_db),
    status_filter: str = Query(default="pending", alias="status", pattern="^(pending|accepted|dismissed|all)$"),
):
    stmt = select(AIInsight).where(AIInsight.user_id == auth.user.id)
    if status_filter != "all":
        stmt = stmt.where(AIInsight.status == status_filter)
    rows = db.scalars(stmt.order_by(AIInsight.created_at.desc()).limit(100)).all()
    return {"items": [{
        "id": i.id, "kind": i.kind, "content": i.content, "status": i.status,
        "user_book_id": i.user_book_id, "source_note_ids": i.source_note_ids,
        "created_at": i.created_at,
    } for i in rows]}


@router.post("/insights/{insight_id}/accept", status_code=201)
def accept_insight(
    insight_id: str, auth: AuthContext = Depends(require_csrf), db: Session = Depends(get_db)
):
    insight = db.get(AIInsight, insight_id)
    if not insight or insight.user_id != auth.user.id:
        raise NotFound("Insight")
    if insight.status != "pending":
        raise AppError("invalid_state", "This insight was already reviewed.", 409)
    note = Note(
        user_id=auth.user.id, user_book_id=insight.user_book_id,
        title=f"AI insight: {insight.kind}"[:300], content=insight.content,
        source="ai", is_important=False, tags=["ai-insight"],
    )
    insight.status = "accepted"
    db.add(note)
    db.commit()
    db.refresh(note)
    return {"note_id": note.id, "message": "Added to your knowledge base."}


@router.post("/insights/{insight_id}/dismiss")
def dismiss_insight(
    insight_id: str, auth: AuthContext = Depends(require_csrf), db: Session = Depends(get_db)
):
    insight = db.get(AIInsight, insight_id)
    if not insight or insight.user_id != auth.user.id:
        raise NotFound("Insight")
    insight.status = "dismissed"
    db.commit()
    return {"message": "Insight dismissed."}


@router.post("/recommendations")
async def recommend(
    payload: RecommendationIn, auth: AuthContext = Depends(require_csrf), db: Session = Depends(get_db)
):
    return {"items": await ai_service.recommendations(
        db, auth.user, payload.count, payload.include_rereads
    )}


# ---------------------------------------------------------------------- documents
@router.get("/documents")
def list_documents(auth: AuthContext = Depends(require_csrf), db: Session = Depends(get_db)):
    rows = db.scalars(
        select(UploadedDocument).where(UploadedDocument.user_id == auth.user.id)
        .order_by(UploadedDocument.created_at.desc()).limit(100)
    ).all()
    return {"items": [{
        "id": d.id, "filename": d.filename, "status": d.status, "size_bytes": d.size_bytes,
        "user_book_id": d.user_book_id, "created_at": d.created_at,
        "chars": len(d.extracted_text or ""), "error": d.error,
    } for d in rows]}


@router.post("/documents", status_code=202)
async def upload_document(
    file: UploadFile = File(...),
    user_book_id: str | None = Query(default=None),
    auth: AuthContext = Depends(require_csrf),
    db: Session = Depends(get_db),
):
    from pathlib import Path

    if user_book_id:
        verify_own_book(db, auth.user.id, user_book_id)
    ai_service.ensure_available(db, auth.user)
    filename = Path(file.filename or "upload").name
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_DOC_TYPES:
        raise AppError("invalid_file_type", "Upload a .pdf, .txt or .md file.", 400)
    data = await file.read(settings.max_upload_mb * 1024 * 1024 + 1)
    if len(data) > settings.max_upload_mb * 1024 * 1024:
        raise AppError("file_too_large", f"Uploads are limited to {settings.max_upload_mb} MB.", 413)
    if not data:
        raise AppError("empty_file", "The uploaded file is empty.", 400)
    key = f"uploads/{auth.user.id}/{uuid.uuid4().hex}{ext}"
    get_storage().save(key, data, ALLOWED_DOC_TYPES[ext])
    doc = UploadedDocument(
        user_id=auth.user.id, user_book_id=user_book_id, filename=filename[:255],
        mime_type=ALLOWED_DOC_TYPES[ext], size_bytes=len(data), storage_key=key,
        status="pending",
    )
    db.add(doc)
    db.flush()
    bg = enqueue(db, "document_extract", {"document_id": doc.id}, user_id=auth.user.id)
    audit(db, auth.user.id, "ai.document_uploaded", {"document_id": doc.id})
    db.commit()
    if settings.run_jobs_inline:
        await run_job_now(db, bg)
        db.refresh(doc)
    return {"document": {"id": doc.id, "filename": doc.filename, "status": doc.status}}


@router.delete("/documents/{document_id}", status_code=204)
def delete_document(
    document_id: str, auth: AuthContext = Depends(require_csrf), db: Session = Depends(get_db)
):
    doc = db.get(UploadedDocument, document_id)
    if not doc or doc.user_id != auth.user.id:
        raise NotFound("Document")
    try:
        get_storage().delete(doc.storage_key)
    except Exception:
        pass
    db.delete(doc)
    db.commit()
    return None


def _summary_out(s: AISummary) -> dict:
    return {
        "id": s.id, "user_book_id": s.user_book_id, "kind": s.kind, "length": s.length,
        "content": s.content, "coverage": s.coverage, "coverage_note": s.coverage_note,
        "sources": s.sources or [], "provider": s.provider, "model": s.model,
        "created_at": s.created_at,
    }
