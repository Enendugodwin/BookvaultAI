from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    JSON, Boolean, DateTime, ForeignKey, Index, Integer, String, Text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDMixin


class AISummary(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "ai_summaries"
    __table_args__ = (Index("ix_summaries_user_book", "user_id", "user_book_id"),)

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    user_book_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("user_books.id", ondelete="CASCADE"), nullable=False
    )
    kind: Mapped[str] = mapped_column(String(40), nullable=False)
    length: Mapped[str] = mapped_column(String(16), default="medium", nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    coverage: Mapped[str] = mapped_column(String(32), default="metadata_only", nullable=False)
    coverage_note: Mapped[str | None] = mapped_column(Text)
    sources: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    provider: Mapped[str | None] = mapped_column(String(40))
    model: Mapped[str | None] = mapped_column(String(80))


class AIConversation(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "ai_conversations"
    __table_args__ = (Index("ix_conversations_user", "user_id", "updated_at"),)

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    user_book_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("user_books.id", ondelete="SET NULL")
    )
    title: Mapped[str] = mapped_column(String(200), default="New conversation", nullable=False)


class AIConversationMessage(UUIDMixin, Base):
    __tablename__ = "ai_conversation_messages"
    __table_args__ = (Index("ix_messages_conversation", "conversation_id", "created_at"),)

    conversation_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("ai_conversations.id", ondelete="CASCADE"), nullable=False
    )
    role: Mapped[str] = mapped_column(String(16), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    citations: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class AIUsageRecord(UUIDMixin, Base):
    __tablename__ = "ai_usage_records"
    __table_args__ = (Index("ix_ai_usage_user_created", "user_id", "created_at"),)

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    feature: Mapped[str] = mapped_column(String(40), nullable=False)
    provider: Mapped[str | None] = mapped_column(String(40))
    model: Mapped[str | None] = mapped_column(String(80))
    prompt_tokens: Mapped[int | None] = mapped_column(Integer)
    completion_tokens: Mapped[int | None] = mapped_column(Integer)
    success: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    error_code: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class UploadedDocument(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "uploaded_documents"
    __table_args__ = (Index("ix_documents_user", "user_id", "created_at"),)

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    user_book_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("user_books.id", ondelete="SET NULL")
    )
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(120), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    storage_key: Mapped[str] = mapped_column(String(500), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False)
    extracted_text: Mapped[str | None] = mapped_column(Text)
    error: Mapped[str | None] = mapped_column(Text)
