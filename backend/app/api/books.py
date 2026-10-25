from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import Text, cast, exists, func, or_, select
from sqlalchemy.orm import Session

from app.api.deps import AuthContext, require_csrf, verify_own_book
from app.core.db import get_db
from app.core.errors import AppError, NotFound
from app.core.timeutils import ensure_utc
from app.models.book import Author, Book, BookAuthor, BookCategory, Category, UserBook
from app.schemas.books import (
    BookInput, BookUpdate, BulkStatusIn, CompleteIn, ProgressIn,
)
from app.services.books import (
    apply_status, book_authors, create_canonical_book, find_canonical_book,
    add_to_library, normalize_title, serialize_user_books,
)

router = APIRouter(prefix="/books", tags=["books"])

SORT_FIELDS = {
    "title": "title", "date_added": "date_added", "rating": "rating",
    "published_date": "published_date", "completed_at": "completed_at",
    "author": "author", "updated": "updated",
}


def _author_match(term: str):
    return exists(
        select(1).select_from(BookAuthor)
        .join(Author, Author.id == BookAuthor.author_id)
        .where(BookAuthor.book_id == Book.id, Author.name.ilike(term))
    )


@router.get("")
def list_books(
    auth: AuthContext = Depends(require_csrf),
    db: Session = Depends(get_db),
    q: str | None = Query(default=None, max_length=200),
    status: str | None = Query(default=None),
    genre: str | None = Query(default=None, max_length=120),
    tag: str | None = Query(default=None, max_length=80),
    rating_min: float | None = Query(default=None, ge=0, le=5),
    archived: bool = False,
    sort: str = "date_added",
    order: str = "desc",
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=24, ge=1, le=100),
):
    stmt = (
        select(UserBook).join(Book, Book.id == UserBook.book_id)
        .where(UserBook.user_id == auth.user.id, UserBook.archived.is_(archived))
    )
    if q:
        term = f"%{q.strip()}%"
        stmt = stmt.where(or_(
            Book.title.ilike(term), Book.subtitle.ilike(term),
            Book.isbn13.ilike(term), Book.isbn10.ilike(term), _author_match(term),
        ))
    if status:
        statuses = [s for s in status.split(",") if s]
        stmt = stmt.where(UserBook.status.in_(statuses))
    if genre:
        stmt = stmt.where(or_(
            func.lower(UserBook.genre) == genre.lower(),
            exists(
                select(1).select_from(BookCategory)
                .join(Category, Category.id == BookCategory.category_id)
                .where(BookCategory.book_id == Book.id, func.lower(Category.name) == genre.lower())
            ),
        ))
    if tag:
        stmt = stmt.where(cast(UserBook.tags, Text).ilike(f'%"{tag.lower()}"%'))
    if rating_min is not None:
        stmt = stmt.where(UserBook.rating >= rating_min)

    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0

    sort_key = SORT_FIELDS.get(sort, "date_added")
    direction = "asc" if order.lower() == "asc" else "desc"
    if sort_key == "title":
        col = Book.title
    elif sort_key == "published_date":
        col = Book.published_date
    elif sort_key == "rating":
        col = UserBook.rating
    elif sort_key == "completed_at":
        col = UserBook.completed_at
    elif sort_key == "updated":
        col = UserBook.updated_at
    elif sort_key == "author":
        col = (
            select(func.min(Author.name)).select_from(Author)
            .join(BookAuthor, BookAuthor.author_id == Author.id)
            .where(BookAuthor.book_id == Book.id).correlate(Book).scalar_subquery()
        )
    else:
        col = UserBook.created_at
    stmt = stmt.order_by(col.asc() if direction == "asc" else col.desc())
    items = db.scalars(stmt.offset((page - 1) * page_size).limit(page_size)).all()
    return {
        "items": serialize_user_books(db, items),
        "total": total, "page": page, "page_size": page_size,
        "pages": max(1, (total + page_size - 1) // page_size),
    }


@router.get("/facets")
def facets(auth: AuthContext = Depends(require_csrf), db: Session = Depends(get_db)):
    rows = db.scalars(
        select(UserBook).where(UserBook.user_id == auth.user.id, UserBook.archived.is_(False))
    ).all()
    cat_map: dict[str, str] = {}
    book_ids = [ub.book_id for ub in rows]
    if book_ids:
        for book_id, name in db.execute(
            select(BookCategory.book_id, Category.name)
            .join(Category, Category.id == BookCategory.category_id)
            .where(BookCategory.book_id.in_(book_ids))
        ):
            cat_map.setdefault(book_id, name)
    genres: dict[str, int] = {}
    tags: dict[str, int] = {}
    statuses: dict[str, int] = {}
    for ub in rows:
        g = ub.genre or cat_map.get(ub.book_id) or "Uncategorized"
        genres[g] = genres.get(g, 0) + 1
        for t in ub.tags or []:
            tags[t] = tags.get(t, 0) + 1
        statuses[ub.status] = statuses.get(ub.status, 0) + 1
    return {
        "genres": [{"name": k, "count": v} for k, v in sorted(genres.items(), key=lambda x: -x[1])],
        "tags": [{"name": k, "count": v} for k, v in sorted(tags.items(), key=lambda x: -x[1])][:100],
        "statuses": statuses,
    }


@router.post("", status_code=201)
def add_book(
    payload: BookInput, auth: AuthContext = Depends(require_csrf), db: Session = Depends(get_db)
):
    ub, _ = add_to_library(db, auth.user.id, payload)
    db.commit()
    db.refresh(ub)
    return serialize_user_books(db, [ub])[0]


@router.get("/{user_book_id}")
def get_book(
    user_book_id: str, auth: AuthContext = Depends(require_csrf), db: Session = Depends(get_db)
):
    from app.models.knowledge import Highlight, Note
    from app.models.reading import ReadingSession

    ub = verify_own_book(db, auth.user.id, user_book_id)
    data = serialize_user_books(db, [ub])[0]
    count, seconds = db.execute(
        select(
            func.count(ReadingSession.id),
            func.coalesce(func.sum(ReadingSession.duration_seconds), 0),
        ).where(ReadingSession.user_id == auth.user.id, ReadingSession.user_book_id == ub.id)
    ).one()
    data["stats"] = {
        "sessions": int(count or 0),
        "minutes": round(float(seconds or 0) / 60.0, 1),
        "notes": db.scalar(
            select(func.count(Note.id)).where(Note.user_id == auth.user.id, Note.user_book_id == ub.id)
        ) or 0,
        "highlights": db.scalar(
            select(func.count(Highlight.id)).where(
                Highlight.user_id == auth.user.id, Highlight.user_book_id == ub.id
            )
        ) or 0,
    }
    return data


@router.patch("/{user_book_id}")
def update_book(
    user_book_id: str, payload: BookUpdate,
    auth: AuthContext = Depends(require_csrf), db: Session = Depends(get_db),
):
    ub = verify_own_book(db, auth.user.id, user_book_id)
    book = ub.book
    data = payload.model_dump(exclude_unset=True)

    if "title" in data and data["title"]:
        book.title = data["title"].strip()
        book.title_normalized = normalize_title(book.title)
    for field in ("subtitle", "description", "publisher", "published_date", "language", "cover_url"):
        if field in data:
            setattr(book, field, data[field])
    if "page_count" in data and data["page_count"] is not None:
        book.page_count = data["page_count"]
    if "authors" in data and data["authors"] is not None:
        db.query(BookAuthor).filter(BookAuthor.book_id == book.id).delete()
        from app.services.books import _get_or_create_author

        for index, name in enumerate(data["authors"]):
            author = _get_or_create_author(db, name)
            db.add(BookAuthor(book_id=book.id, author_id=author.id, position=index))
    if "genre" in data:
        ub.genre = data["genre"]
    if "tags" in data and data["tags"] is not None:
        ub.tags = data["tags"]
    if "rating" in data:
        ub.rating = data["rating"]
    if "review" in data:
        ub.review = data["review"]
    if "archived" in data and data["archived"] is not None:
        ub.archived = data["archived"]
    if "current_page" in data and data["current_page"] is not None:
        if book.page_count and data["current_page"] > book.page_count:
            raise AppError("invalid_page", "Current page cannot exceed the page count.", 400)
        ub.current_page = data["current_page"]
    if "status" in data and data["status"]:
        apply_status(ub, data["status"])
    if book.page_count and ub.current_page and ub.current_page > book.page_count:
        raise AppError("invalid_page", "Current page exceeds the updated page count.", 400)
    db.commit()
    db.refresh(ub)
    return serialize_user_books(db, [ub])[0]


@router.delete("/{user_book_id}", status_code=204)
def delete_book(
    user_book_id: str, auth: AuthContext = Depends(require_csrf), db: Session = Depends(get_db)
):
    ub = verify_own_book(db, auth.user.id, user_book_id)
    db.delete(ub)
    db.commit()
    return None


@router.post("/bulk-status")
def bulk_status(
    payload: BulkStatusIn, auth: AuthContext = Depends(require_csrf), db: Session = Depends(get_db)
):
    rows = db.scalars(
        select(UserBook).where(UserBook.user_id == auth.user.id, UserBook.id.in_(payload.ids))
    ).all()
    for ub in rows:
        apply_status(ub, payload.status)
    db.commit()
    return {"updated": len(rows)}


@router.post("/{user_book_id}/progress")
def update_progress(
    user_book_id: str, payload: ProgressIn,
    auth: AuthContext = Depends(require_csrf), db: Session = Depends(get_db),
):
    ub = verify_own_book(db, auth.user.id, user_book_id)
    if ub.book.page_count and payload.current_page > ub.book.page_count:
        raise AppError("invalid_page", f"Current page cannot exceed {ub.book.page_count}.", 400)
    ub.current_page = payload.current_page
    if ub.status == "want_to_read":
        apply_status(ub, "reading")
    db.commit()
    db.refresh(ub)
    return serialize_user_books(db, [ub])[0]


@router.post("/{user_book_id}/complete")
def complete_book(
    user_book_id: str, payload: CompleteIn,
    auth: AuthContext = Depends(require_csrf), db: Session = Depends(get_db),
):
    ub = verify_own_book(db, auth.user.id, user_book_id)
    apply_status(ub, "completed")
    if payload.completed_at:
        ub.completed_at = ensure_utc(payload.completed_at)
    if payload.rating is not None:
        ub.rating = payload.rating
    if payload.review is not None:
        ub.review = payload.review
    if ub.book.page_count and (ub.current_page is None or ub.current_page < ub.book.page_count):
        ub.current_page = ub.book.page_count
    nxt = db.scalar(
        select(UserBook).where(
            UserBook.user_id == auth.user.id,
            UserBook.status == "want_to_read",
            UserBook.archived.is_(False),
            UserBook.id != ub.id,
        ).order_by(func.random()).limit(1)
    )
    db.commit()
    db.refresh(ub)
    return {
        "book": serialize_user_books(db, [ub])[0],
        "suggested_next": serialize_user_books(db, [nxt])[0] if nxt else None,
    }
