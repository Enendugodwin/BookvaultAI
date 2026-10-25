from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    JSON, Boolean, DateTime, Float, ForeignKey, Index, Integer, String, Text, UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin

READING_STATUSES = ("want_to_read", "reading", "completed", "paused", "abandoned", "rereading")


class Book(UUIDMixin, TimestampMixin, Base):
    """Canonical, user-independent bibliographic record."""

    __tablename__ = "books"
    __table_args__ = (
        Index("ix_books_title_norm", "title_normalized"),
        Index("ix_books_isbn13", "isbn13"),
        Index("ix_books_isbn10", "isbn10"),
    )

    title: Mapped[str] = mapped_column(String(500), nullable=False)
    title_normalized: Mapped[str] = mapped_column(String(500), nullable=False)
    subtitle: Mapped[str | None] = mapped_column(String(500))
    isbn10: Mapped[str | None] = mapped_column(String(13))
    isbn13: Mapped[str | None] = mapped_column(String(17))
    description: Mapped[str | None] = mapped_column(Text)
    publisher: Mapped[str | None] = mapped_column(String(255))
    published_date: Mapped[str | None] = mapped_column(String(32))
    language: Mapped[str | None] = mapped_column(String(32))
    page_count: Mapped[int | None] = mapped_column(Integer)
    cover_url: Mapped[str | None] = mapped_column(String(1000))
    google_books_id: Mapped[str | None] = mapped_column(String(64))
    openlibrary_id: Mapped[str | None] = mapped_column(String(64))
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class Author(UUIDMixin, Base):
    __tablename__ = "authors"
    __table_args__ = (UniqueConstraint("name_normalized", name="uq_authors_name_norm"),)

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    name_normalized: Mapped[str] = mapped_column(String(255), nullable=False, index=True)


class BookAuthor(Base):
    __tablename__ = "book_authors"

    book_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("books.id", ondelete="CASCADE"), primary_key=True
    )
    author_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("authors.id", ondelete="CASCADE"), primary_key=True
    )
    position: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class Category(UUIDMixin, Base):
    __tablename__ = "categories"
    __table_args__ = (UniqueConstraint("name_normalized", name="uq_categories_name_norm"),)

    name: Mapped[str] = mapped_column(String(120), nullable=False)
    name_normalized: Mapped[str] = mapped_column(String(120), nullable=False, index=True)


class BookCategory(Base):
    __tablename__ = "book_categories"

    book_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("books.id", ondelete="CASCADE"), primary_key=True
    )
    category_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("categories.id", ondelete="CASCADE"), primary_key=True
    )


class UserBook(UUIDMixin, TimestampMixin, Base):
    """A user's relationship with a canonical book."""

    __tablename__ = "user_books"
    __table_args__ = (
        UniqueConstraint("user_id", "book_id", name="uq_user_books_user_book"),
        Index("ix_user_books_user_status", "user_id", "status"),
        Index("ix_user_books_user_completed", "user_id", "completed_at"),
        Index("ix_user_books_user_updated", "user_id", "updated_at"),
    )

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    book_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("books.id", ondelete="CASCADE"), nullable=False
    )
    status: Mapped[str] = mapped_column(String(24), default="want_to_read", nullable=False)
    rating: Mapped[float | None] = mapped_column(Float)
    review: Mapped[str | None] = mapped_column(Text)
    current_page: Mapped[int | None] = mapped_column(Integer)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    archived: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    genre: Mapped[str | None] = mapped_column(String(120))
    tags: Mapped[list] = mapped_column(JSON, default=list, nullable=False)

    book: Mapped[Book] = relationship(lazy="joined")


class Tag(UUIDMixin, Base):
    __tablename__ = "tags"
    __table_args__ = (UniqueConstraint("user_id", "name_normalized", name="uq_tags_user_name"),)

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    name_normalized: Mapped[str] = mapped_column(String(80), nullable=False)
    color: Mapped[str] = mapped_column(String(16), default="#6d5bd0", nullable=False)
