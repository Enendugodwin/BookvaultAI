from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import (
    Boolean, Date, DateTime, Float, ForeignKey, Index, Integer, String, Text, UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin
from app.models.book import UserBook

GOAL_TYPES = (
    "books", "pages", "minutes", "hours", "sessions", "streak", "genre_books",
)
GOAL_PERIODS = ("day", "week", "month", "year", "custom")


class ReadingSession(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "reading_sessions"
    __table_args__ = (
        Index("ix_sessions_user_started", "user_id", "started_at"),
        Index("ix_sessions_user_book", "user_id", "user_book_id"),
        UniqueConstraint("user_id", "client_ref", name="uq_sessions_user_client_ref"),
    )

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    user_book_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("user_books.id", ondelete="CASCADE"), nullable=False
    )
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ended_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    paused_seconds: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    duration_seconds: Mapped[int] = mapped_column(Integer, nullable=False)
    start_page: Mapped[int | None] = mapped_column(Integer)
    end_page: Mapped[int | None] = mapped_column(Integer)
    pages_read: Mapped[int | None] = mapped_column(Integer)
    notes: Mapped[str | None] = mapped_column(Text)
    source: Mapped[str] = mapped_column(String(16), default="manual", nullable=False)
    client_ref: Mapped[str | None] = mapped_column(String(64))

    user_book: Mapped[UserBook] = relationship(lazy="joined")


class ActiveTimer(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "active_timers"
    __table_args__ = (UniqueConstraint("user_id", name="uq_active_timers_user"),)

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    user_book_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("user_books.id", ondelete="CASCADE"), nullable=False
    )
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    accumulated_seconds: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    running: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    paused_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    start_page: Mapped[int | None] = mapped_column(Integer)
    notes: Mapped[str | None] = mapped_column(Text)

    user_book: Mapped[UserBook] = relationship(lazy="joined")


class ReadingGoal(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "reading_goals"
    __table_args__ = (Index("ix_goals_user_dates", "user_id", "start_date", "end_date"),)

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    goal_type: Mapped[str] = mapped_column(String(24), nullable=False)
    period: Mapped[str] = mapped_column(String(16), default="custom", nullable=False)
    target_value: Mapped[float] = mapped_column(Float, nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    genre: Mapped[str | None] = mapped_column(String(120))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
