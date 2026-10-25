from __future__ import annotations

from datetime import date

from sqlalchemy import (
    JSON, Boolean, Date, ForeignKey, Index, Integer, String, Text, UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDMixin


class Note(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "notes"
    __table_args__ = (
        Index("ix_notes_user_updated", "user_id", "updated_at"),
        Index("ix_notes_user_book", "user_id", "user_book_id"),
    )

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    user_book_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("user_books.id", ondelete="SET NULL")
    )
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    page_ref: Mapped[str | None] = mapped_column(String(64))
    is_important: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    source: Mapped[str] = mapped_column(String(16), default="user", nullable=False)  # user|ai
    tags: Mapped[list] = mapped_column(JSON, default=list, nullable=False)


class NoteTag(Base):
    __tablename__ = "note_tags"

    note_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("notes.id", ondelete="CASCADE"), primary_key=True
    )
    tag_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True
    )


class Highlight(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "highlights"
    __table_args__ = (Index("ix_highlights_user_book", "user_id", "user_book_id"),)

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    user_book_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("user_books.id", ondelete="SET NULL")
    )
    text: Mapped[str] = mapped_column(Text, nullable=False)
    page_ref: Mapped[str | None] = mapped_column(String(64))
    commentary: Mapped[str | None] = mapped_column(Text)
    tags: Mapped[list] = mapped_column(JSON, default=list, nullable=False)


class JournalEntry(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "journal_entries"
    __table_args__ = (Index("ix_journal_user_date", "user_id", "entry_date"),)

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    entry_date: Mapped[date] = mapped_column(Date, nullable=False)
    title: Mapped[str | None] = mapped_column(String(200))
    reflections: Mapped[str | None] = mapped_column(Text)
    ideas: Mapped[str | None] = mapped_column(Text)
    questions: Mapped[str | None] = mapped_column(Text)
    lessons: Mapped[str | None] = mapped_column(Text)
    applications: Mapped[str | None] = mapped_column(Text)
    mood: Mapped[str | None] = mapped_column(String(32))


class AIInsight(UUIDMixin, TimestampMixin, Base):
    """AI-extracted candidate insight pending explicit user review."""

    __tablename__ = "ai_insights"
    __table_args__ = (Index("ix_insights_user_status", "user_id", "status"),)

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    user_book_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("user_books.id", ondelete="SET NULL")
    )
    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(16), default="pending", nullable=False)
    source_note_ids: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
