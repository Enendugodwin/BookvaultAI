"""Import every model so Base.metadata is complete for migrations and tests."""
from app.models.base import Base, utcnow, uuid_str  # noqa: F401
from app.models.user import (  # noqa: F401
    AuditLog, EmailVerificationToken, PasswordResetToken, User, UserSession, UserSettings,
)
from app.models.book import (  # noqa: F401
    READING_STATUSES, Author, Book, BookAuthor, BookCategory, Category, Tag, UserBook,
)
from app.models.reading import (  # noqa: F401
    GOAL_PERIODS, GOAL_TYPES, ActiveTimer, ReadingGoal, ReadingSession,
)
from app.models.knowledge import (  # noqa: F401
    AIInsight, Highlight, JournalEntry, Note, NoteTag,
)
from app.models.ai import (  # noqa: F401
    AIConversation, AIConversationMessage, AISummary, AIUsageRecord, UploadedDocument,
)
from app.models.ops import (  # noqa: F401
    AppLog, BackgroundJob, CatalogueCache, ExportJob, ImportJob, Notification,
)
