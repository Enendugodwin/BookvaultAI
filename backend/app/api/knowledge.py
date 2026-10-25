from __future__ import annotations

import re
from collections import Counter
from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.api.deps import AuthContext, require_csrf, verify_own_book
from app.core.db import get_db
from app.core.errors import NotFound
from app.models.book import Book, UserBook
from app.models.knowledge import AIInsight, Highlight, JournalEntry, Note
from app.schemas.knowledge import (
    HighlightIn, HighlightUpdate, JournalIn, JournalUpdate, NoteIn, NoteUpdate,
)

router = APIRouter(tags=["knowledge"])


def _book_titles(db: Session, user_id: str, ids: list[str]) -> dict[str, str]:
    ids = [i for i in set(ids) if i]
    if not ids:
        return {}
    rows = db.execute(
        select(UserBook.id, Book.title)
        .join(Book, Book.id == UserBook.book_id)
        .where(UserBook.user_id == user_id, UserBook.id.in_(ids))
    ).all()
    return {rid: title for rid, title in rows}


def _note_out(n: Note, titles: dict[str, str]) -> dict:
    return {
        "id": n.id, "title": n.title, "content": n.content, "user_book_id": n.user_book_id,
        "book_title": titles.get(n.user_book_id or "", None), "page_ref": n.page_ref,
        "is_important": n.is_important, "source": n.source, "tags": n.tags or [],
        "created_at": n.created_at, "updated_at": n.updated_at,
    }


def _highlight_out(h: Highlight, titles: dict[str, str]) -> dict:
    return {
        "id": h.id, "text": h.text, "commentary": h.commentary, "page_ref": h.page_ref,
        "user_book_id": h.user_book_id, "book_title": titles.get(h.user_book_id or "", None),
        "tags": h.tags or [], "created_at": h.created_at,
    }


def _journal_out(j: JournalEntry) -> dict:
    return {
        "id": j.id, "entry_date": j.entry_date, "title": j.title, "reflections": j.reflections,
        "ideas": j.ideas, "questions": j.questions, "lessons": j.lessons,
        "applications": j.applications, "mood": j.mood,
        "created_at": j.created_at, "updated_at": j.updated_at,
    }


# --------------------------------------------------------------------------- notes
@router.get("/notes")
def list_notes(
    auth: AuthContext = Depends(require_csrf), db: Session = Depends(get_db),
    q: str | None = Query(default=None, max_length=200),
    user_book_id: str | None = None,
    important: bool | None = None,
    tag: str | None = Query(default=None, max_length=80),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
):
    stmt = select(Note).where(Note.user_id == auth.user.id)
    if q:
        term = f"%{q.strip()}%"
        stmt = stmt.where(or_(Note.title.ilike(term), Note.content.ilike(term)))
    if user_book_id:
        stmt = stmt.where(Note.user_book_id == user_book_id)
    if important is not None:
        stmt = stmt.where(Note.is_important.is_(important))
    if tag:
        stmt = stmt.where(Note.tags.isnot(None))
    notes = db.scalars(stmt.order_by(Note.updated_at.desc())).all()
    if tag:
        notes = [n for n in notes if tag.lower() in [t.lower() for t in (n.tags or [])]]
    total = len(notes)
    notes = notes[(page - 1) * page_size: page * page_size]
    titles = _book_titles(db, auth.user.id, [n.user_book_id for n in notes])
    return {
        "items": [_note_out(n, titles) for n in notes], "total": total, "page": page,
        "page_size": page_size, "pages": max(1, (total + page_size - 1) // page_size),
    }


@router.post("/notes", status_code=201)
def create_note(
    payload: NoteIn, auth: AuthContext = Depends(require_csrf), db: Session = Depends(get_db)
):
    if payload.user_book_id:
        verify_own_book(db, auth.user.id, payload.user_book_id)
    note = Note(
        user_id=auth.user.id, user_book_id=payload.user_book_id, title=payload.title,
        content=payload.content, page_ref=payload.page_ref, is_important=payload.is_important,
        tags=_clean_tags(payload.tags), source="user",
    )
    db.add(note)
    db.commit()
    db.refresh(note)
    titles = _book_titles(db, auth.user.id, [note.user_book_id])
    return _note_out(note, titles)


@router.patch("/notes/{note_id}")
def update_note(
    note_id: str, payload: NoteUpdate,
    auth: AuthContext = Depends(require_csrf), db: Session = Depends(get_db),
):
    note = db.get(Note, note_id)
    if not note or note.user_id != auth.user.id:
        raise NotFound("Note")
    data = payload.model_dump(exclude_unset=True)
    if data.get("user_book_id"):
        verify_own_book(db, auth.user.id, data["user_book_id"])
    for key, value in data.items():
        if key == "tags" and value is not None:
            value = _clean_tags(value)
        setattr(note, key, value)
    db.commit()
    db.refresh(note)
    return _note_out(note, _book_titles(db, auth.user.id, [note.user_book_id]))


@router.delete("/notes/{note_id}", status_code=204)
def delete_note(
    note_id: str, auth: AuthContext = Depends(require_csrf), db: Session = Depends(get_db)
):
    note = db.get(Note, note_id)
    if not note or note.user_id != auth.user.id:
        raise NotFound("Note")
    db.delete(note)
    db.commit()
    return None


# --------------------------------------------------------------------- highlights
@router.get("/highlights")
def list_highlights(
    auth: AuthContext = Depends(require_csrf), db: Session = Depends(get_db),
    user_book_id: str | None = None,
    q: str | None = Query(default=None, max_length=200),
):
    stmt = select(Highlight).where(Highlight.user_id == auth.user.id)
    if user_book_id:
        stmt = stmt.where(Highlight.user_book_id == user_book_id)
    if q:
        term = f"%{q.strip()}%"
        stmt = stmt.where(or_(Highlight.text.ilike(term), Highlight.commentary.ilike(term)))
    items = db.scalars(stmt.order_by(Highlight.created_at.desc()).limit(200)).all()
    titles = _book_titles(db, auth.user.id, [h.user_book_id for h in items])
    return {"items": [_highlight_out(h, titles) for h in items], "total": len(items)}


@router.post("/highlights", status_code=201)
def create_highlight(
    payload: HighlightIn, auth: AuthContext = Depends(require_csrf), db: Session = Depends(get_db)
):
    if payload.user_book_id:
        verify_own_book(db, auth.user.id, payload.user_book_id)
    h = Highlight(
        user_id=auth.user.id, user_book_id=payload.user_book_id, text=payload.text,
        page_ref=payload.page_ref, commentary=payload.commentary, tags=_clean_tags(payload.tags),
    )
    db.add(h)
    db.commit()
    db.refresh(h)
    return _highlight_out(h, _book_titles(db, auth.user.id, [h.user_book_id]))


@router.patch("/highlights/{highlight_id}")
def update_highlight(
    highlight_id: str, payload: HighlightUpdate,
    auth: AuthContext = Depends(require_csrf), db: Session = Depends(get_db),
):
    h = db.get(Highlight, highlight_id)
    if not h or h.user_id != auth.user.id:
        raise NotFound("Highlight")
    data = payload.model_dump(exclude_unset=True)
    if data.get("tags") is not None:
        data["tags"] = _clean_tags(data["tags"])
    for key, value in data.items():
        setattr(h, key, value)
    db.commit()
    db.refresh(h)
    return _highlight_out(h, _book_titles(db, auth.user.id, [h.user_book_id]))


@router.delete("/highlights/{highlight_id}", status_code=204)
def delete_highlight(
    highlight_id: str, auth: AuthContext = Depends(require_csrf), db: Session = Depends(get_db)
):
    h = db.get(Highlight, highlight_id)
    if not h or h.user_id != auth.user.id:
        raise NotFound("Highlight")
    db.delete(h)
    db.commit()
    return None


# ------------------------------------------------------------------------ journal
@router.get("/journal")
def list_journal(
    auth: AuthContext = Depends(require_csrf), db: Session = Depends(get_db),
    month: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}$"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=30, ge=1, le=100),
):
    stmt = select(JournalEntry).where(JournalEntry.user_id == auth.user.id)
    if month:
        year, mon = [int(x) for x in month.split("-")]
        start = date(year, mon, 1)
        end = date(year + (mon == 12), (mon % 12) + 1, 1)
        stmt = stmt.where(JournalEntry.entry_date >= start, JournalEntry.entry_date < end)
    entries = db.scalars(stmt.order_by(JournalEntry.entry_date.desc())).all()
    total = len(entries)
    entries = entries[(page - 1) * page_size: page * page_size]
    return {
        "items": [_journal_out(j) for j in entries], "total": total, "page": page,
        "page_size": page_size, "pages": max(1, (total + page_size - 1) // page_size),
    }


@router.post("/journal", status_code=201)
def create_journal(
    payload: JournalIn, auth: AuthContext = Depends(require_csrf), db: Session = Depends(get_db)
):
    entry = JournalEntry(user_id=auth.user.id, **payload.model_dump())
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return _journal_out(entry)


@router.patch("/journal/{entry_id}")
def update_journal(
    entry_id: str, payload: JournalUpdate,
    auth: AuthContext = Depends(require_csrf), db: Session = Depends(get_db),
):
    entry = db.get(JournalEntry, entry_id)
    if not entry or entry.user_id != auth.user.id:
        raise NotFound("Journal entry")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(entry, key, value)
    db.commit()
    db.refresh(entry)
    return _journal_out(entry)


@router.delete("/journal/{entry_id}", status_code=204)
def delete_journal(
    entry_id: str, auth: AuthContext = Depends(require_csrf), db: Session = Depends(get_db)
):
    entry = db.get(JournalEntry, entry_id)
    if not entry or entry.user_id != auth.user.id:
        raise NotFound("Journal entry")
    db.delete(entry)
    db.commit()
    return None


# ---------------------------------------------------------------------- knowledge
@router.get("/knowledge/overview")
def knowledge_overview(auth: AuthContext = Depends(require_csrf), db: Session = Depends(get_db)):
    notes = db.scalars(
        select(Note).where(Note.user_id == auth.user.id).order_by(Note.updated_at.desc()).limit(6)
    ).all()
    highlights = db.scalars(
        select(Highlight).where(Highlight.user_id == auth.user.id)
        .order_by(Highlight.created_at.desc()).limit(4)
    ).all()
    important = db.scalars(
        select(Note).where(Note.user_id == auth.user.id, Note.is_important.is_(True))
        .order_by(Note.updated_at.desc()).limit(5)
    ).all()
    insights = db.scalars(
        select(AIInsight).where(AIInsight.user_id == auth.user.id, AIInsight.status == "pending")
        .order_by(AIInsight.created_at.desc()).limit(5)
    ).all()
    journal_count = len(db.scalars(
        select(JournalEntry.id).where(JournalEntry.user_id == auth.user.id).limit(1000)
    ).all())
    tag_counter: Counter = Counter()
    for n in db.scalars(select(Note).where(Note.user_id == auth.user.id).limit(1000)):
        tag_counter.update(n.tags or [])
    for h in db.scalars(select(Highlight).where(Highlight.user_id == auth.user.id).limit(1000)):
        tag_counter.update(h.tags or [])
    titles = _book_titles(
        db, auth.user.id,
        [n.user_book_id for n in notes] + [h.user_book_id for h in highlights]
        + [i.user_book_id for i in insights],
    )
    return {
        "recent_notes": [_note_out(n, titles) for n in notes],
        "recent_highlights": [_highlight_out(h, titles) for h in highlights],
        "important_notes": [_note_out(n, titles) for n in important],
        "pending_insights": [{
            "id": i.id, "kind": i.kind, "content": i.content, "user_book_id": i.user_book_id,
            "book_title": titles.get(i.user_book_id or ""), "status": i.status,
            "created_at": i.created_at,
        } for i in insights],
        "top_tags": [{"name": k, "count": v} for k, v in tag_counter.most_common(20)],
        "counts": {
            "notes": len(db.scalars(select(Note.id).where(Note.user_id == auth.user.id).limit(5000)).all()),
            "highlights": len(db.scalars(select(Highlight.id).where(Highlight.user_id == auth.user.id).limit(5000)).all()),
            "journal_entries": journal_count,
            "important": len(db.scalars(
                select(Note.id).where(Note.user_id == auth.user.id, Note.is_important.is_(True)).limit(5000)
            ).all()),
        },
    }


@router.get("/knowledge/search")
def knowledge_search(
    q: str = Query(min_length=2, max_length=200),
    auth: AuthContext = Depends(require_csrf), db: Session = Depends(get_db),
):
    term = f"%{q.strip()}%"
    notes = db.scalars(
        select(Note).where(Note.user_id == auth.user.id,
                           or_(Note.title.ilike(term), Note.content.ilike(term))).limit(30)
    ).all()
    highlights = db.scalars(
        select(Highlight).where(Highlight.user_id == auth.user.id,
                                or_(Highlight.text.ilike(term), Highlight.commentary.ilike(term))).limit(30)
    ).all()
    journal = db.scalars(
        select(JournalEntry).where(
            JournalEntry.user_id == auth.user.id,
            or_(JournalEntry.title.ilike(term), JournalEntry.reflections.ilike(term),
                JournalEntry.ideas.ilike(term), JournalEntry.questions.ilike(term),
                JournalEntry.lessons.ilike(term), JournalEntry.applications.ilike(term)),
        ).limit(30)
    ).all()
    titles = _book_titles(
        db, auth.user.id, [n.user_book_id for n in notes] + [h.user_book_id for h in highlights]
    )
    return {
        "notes": [_note_out(n, titles) for n in notes],
        "highlights": [_highlight_out(h, titles) for h in highlights],
        "journal": [_journal_out(j) for j in journal],
    }


def _clean_tags(tags: list[str]) -> list[str]:
    out, seen = [], set()
    for tag in tags:
        cleaned = re.sub(r"\s+", " ", str(tag)).strip()[:60]
        if cleaned and cleaned.lower() not in seen:
            seen.add(cleaned.lower())
            out.append(cleaned)
    return out[:20]
