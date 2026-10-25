from __future__ import annotations

import re
import unicodedata
from datetime import datetime, timezone
from typing import Iterable

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import Conflict
from app.models.book import Author, Book, BookAuthor, BookCategory, Category, UserBook
from app.schemas.books import BookInput
from app.services.metrics import progress_percent

_ARTICLES = re.compile(r"^(the|a|an)\s+")


def normalize_text(value: str) -> str:
    value = unicodedata.normalize("NFKD", value or "")
    value = "".join(c for c in value if not unicodedata.combining(c))
    value = value.casefold()
    value = re.sub(r"[^a-z0-9\s]", " ", value)
    value = re.sub(r"\s+", " ", value).strip()
    return _ARTICLES.sub("", value)


def normalize_title(value: str) -> str:
    return normalize_text(value)[:500]


def normalize_name(value: str) -> str:
    return normalize_text(value)[:255]


def _get_or_create_author(db: Session, name: str) -> Author:
    norm = normalize_name(name)
    author = db.scalar(select(Author).where(Author.name_normalized == norm))
    if author is None:
        author = Author(name=name.strip(), name_normalized=norm)
        db.add(author)
        db.flush()
    return author


def _get_or_create_category(db: Session, name: str) -> Category:
    norm = normalize_name(name)[:120]
    category = db.scalar(select(Category).where(Category.name_normalized == norm))
    if category is None:
        category = Category(name=name.strip()[:120], name_normalized=norm)
        db.add(category)
        db.flush()
    return category


def find_canonical_book(db: Session, data: BookInput) -> Book | None:
    if data.isbn13:
        found = db.scalar(select(Book).where(Book.isbn13 == data.isbn13))
        if found:
            return found
    if data.isbn10:
        found = db.scalar(select(Book).where(Book.isbn10 == data.isbn10))
        if found:
            return found
    if data.google_books_id:
        found = db.scalar(select(Book).where(Book.google_books_id == data.google_books_id))
        if found:
            return found
    if data.openlibrary_id:
        found = db.scalar(select(Book).where(Book.openlibrary_id == data.openlibrary_id))
        if found:
            return found
    if not data.authors:
        return None
    title_norm = normalize_title(data.title)
    author_norms = {normalize_name(a) for a in data.authors}
    rows = db.execute(
        select(Book)
        .join(BookAuthor, BookAuthor.book_id == Book.id)
        .join(Author, Author.id == BookAuthor.author_id)
        .where(Book.title_normalized == title_norm)
    ).scalars().all()
    for book in rows:
        names = {
            a.name_normalized
            for a in db.scalars(
                select(Author).join(BookAuthor, BookAuthor.author_id == Author.id).where(
                    BookAuthor.book_id == book.id
                )
            )
        }
        if names & author_norms:
            return book
    return None


def create_canonical_book(db: Session, data: BookInput, *, is_demo: bool = False) -> Book:
    book = Book(
        title=data.title,
        title_normalized=normalize_title(data.title),
        subtitle=data.subtitle,
        isbn10=data.isbn10,
        isbn13=data.isbn13,
        description=data.description,
        publisher=data.publisher,
        published_date=data.published_date,
        language=data.language,
        page_count=data.page_count,
        cover_url=data.cover_url,
        google_books_id=data.google_books_id,
        openlibrary_id=data.openlibrary_id,
        is_demo=is_demo,
    )
    db.add(book)
    db.flush()
    for index, name in enumerate(data.authors):
        author = _get_or_create_author(db, name)
        db.add(BookAuthor(book_id=book.id, author_id=author.id, position=index))
    categories = list(data.categories)
    if data.genre and data.genre not in categories:
        categories.append(data.genre)
    for name in categories[:20]:
        category = _get_or_create_category(db, name)
        exists = db.scalar(
            select(BookCategory).where(
                BookCategory.book_id == book.id, BookCategory.category_id == category.id
            )
        )
        if not exists:
            db.add(BookCategory(book_id=book.id, category_id=category.id))
    db.flush()
    return book


def update_canonical_book(db: Session, book: Book, data: BookInput) -> None:
    book.title = data.title
    book.title_normalized = normalize_title(data.title)
    book.subtitle = data.subtitle
    book.description = data.description
    book.publisher = data.publisher
    book.published_date = data.published_date
    book.language = data.language
    book.page_count = data.page_count
    book.cover_url = data.cover_url
    if data.authors:
        db.query(BookAuthor).filter(BookAuthor.book_id == book.id).delete()
        for index, name in enumerate(data.authors):
            author = _get_or_create_author(db, name)
            db.add(BookAuthor(book_id=book.id, author_id=author.id, position=index))


def add_to_library(db: Session, user_id: str, data: BookInput) -> tuple[UserBook, bool]:
    existing = None
    canonical = find_canonical_book(db, data)
    if canonical is not None:
        existing = db.scalar(
            select(UserBook).where(
                UserBook.user_id == user_id, UserBook.book_id == canonical.id
            )
        )
        if existing:
            raise Conflict(
                "This book is already in your library.",
                {"user_book_id": existing.id, "book_id": canonical.id},
            )
    book = canonical or create_canonical_book(db, data)
    ub = UserBook(
        user_id=user_id,
        book_id=book.id,
        status=data.status,
        rating=data.rating,
        review=data.review,
        current_page=data.current_page,
        genre=data.genre or (data.categories[0] if data.categories else None),
        tags=data.tags,
        started_at=datetime.now(timezone.utc) if data.status in ("reading", "rereading") else None,
        completed_at=datetime.now(timezone.utc) if data.status == "completed" else None,
    )
    db.add(ub)
    db.flush()
    return ub, canonical is None


def apply_status(ub: UserBook, status: str) -> None:
    now = datetime.now(timezone.utc)
    if status == "completed":
        ub.completed_at = ub.completed_at or now
    elif status in ("reading", "rereading"):
        ub.completed_at = None
        ub.started_at = ub.started_at or now
    ub.status = status


def book_authors(db: Session, book_ids: Iterable[str]) -> dict[str, list[str]]:
    ids = list(book_ids)
    if not ids:
        return {}
    rows = db.execute(
        select(BookAuthor.book_id, Author.name)
        .join(Author, Author.id == BookAuthor.author_id)
        .where(BookAuthor.book_id.in_(ids))
        .order_by(BookAuthor.position)
    ).all()
    out: dict[str, list[str]] = {}
    for book_id, name in rows:
        out.setdefault(book_id, []).append(name)
    return out


def book_categories(db: Session, book_ids: Iterable[str]) -> dict[str, list[str]]:
    ids = list(book_ids)
    if not ids:
        return {}
    rows = db.execute(
        select(BookCategory.book_id, Category.name)
        .join(Category, Category.id == BookCategory.category_id)
        .where(BookCategory.book_id.in_(ids))
    ).all()
    out: dict[str, list[str]] = {}
    for book_id, name in rows:
        out.setdefault(book_id, []).append(name)
    return out


def serialize_user_books(db: Session, items: list[UserBook]) -> list[dict]:
    ids = [ub.book_id for ub in items]
    authors = book_authors(db, ids)
    categories = book_categories(db, ids)
    result = []
    for ub in items:
        b = ub.book
        result.append(
            {
                "id": ub.id,
                "book": {
                    "id": b.id,
                    "title": b.title,
                    "subtitle": b.subtitle,
                    "authors": authors.get(b.id, []),
                    "isbn10": b.isbn10,
                    "isbn13": b.isbn13,
                    "description": b.description,
                    "publisher": b.publisher,
                    "published_date": b.published_date,
                    "language": b.language,
                    "page_count": b.page_count,
                    "cover_url": b.cover_url,
                    "categories": categories.get(b.id, []),
                    "google_books_id": b.google_books_id,
                    "openlibrary_id": b.openlibrary_id,
                },
                "status": ub.status,
                "rating": ub.rating,
                "review": ub.review,
                "current_page": ub.current_page,
                "progress_percent": progress_percent(ub.current_page, b.page_count),
                "started_at": ub.started_at,
                "completed_at": ub.completed_at,
                "archived": ub.archived,
                "genre": ub.genre,
                "tags": ub.tags or [],
                "created_at": ub.created_at,
                "updated_at": ub.updated_at,
            }
        )
    return result


def library_stats(db: Session, user_id: str) -> dict:
    total = db.scalar(
        select(func.count(UserBook.id)).where(UserBook.user_id == user_id, UserBook.archived.is_(False))
    ) or 0
    return {"total_books": total}
