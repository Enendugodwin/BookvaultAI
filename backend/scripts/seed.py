"""Create demo data for a local YVO's Book Vault instance.

This script is intentionally conservative: it refuses to run against a
production database unless you explicitly pass ``--force``, and it only
touches the account it creates (or resets with ``--reset``).

Examples (run from the ``backend`` directory):

    ..\\.venv\\Scripts\\python.exe scripts\\seed.py --create
    ..\\.venv\\Scripts\\python.exe scripts\\seed.py --email me@example.com --password "long password"

The ``--create`` flag creates any missing tables with SQLAlchemy metadata. For
a real deployment always use ``alembic upgrade head`` instead.
"""
from __future__ import annotations

import argparse
import random
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

# Allow ``python scripts/seed.py`` without setting PYTHONPATH.
BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

import app.models  # noqa: F401  (register every mapper before create_all)
from sqlalchemy import select

from app.core.config import settings
from app.core.db import Base, SessionLocal, engine
from app.core.security import hash_password
from app.models.knowledge import Highlight, JournalEntry, Note
from app.models.reading import ReadingGoal, ReadingSession
from app.models.user import User, UserSettings
from app.schemas.books import BookInput
from app.services.books import add_to_library, apply_status

SEED_BOOKS = [
    {
        "title": "The Left Hand of Darkness",
        "authors": ["Ursula K. Le Guin"],
        "categories": ["Science fiction"],
        "page_count": 304,
        "status": "completed",
        "rating": 5,
        "review": "An ambulatory novel about loyalty, gender and the cost of understanding a culture on its own terms.",
        "description": "A lone human envoy on the planet Gethen must learn to trust an alien society shaped by ambisexuality.",
    },
    {
        "title": "Thinking in Systems",
        "authors": ["Donella H. Meadows"],
        "categories": ["Science", "Systems"],
        "page_count": 240,
        "status": "reading",
        "rating": None,
        "description": "A primer on feedback loops, stocks and flows, and why complex systems surprise us.",
    },
    {
        "title": "The Remains of the Day",
        "authors": ["Kazuo Ishiguro"],
        "categories": ["Literary fiction"],
        "page_count": 258,
        "status": "completed",
        "rating": 4,
        "description": "An English butler looks back on duty, restraint and the life he did not permit himself.",
    },
    {
        "title": "How to Take Smart Notes",
        "authors": ["Sönke Ahrens"],
        "categories": ["Writing", "Productivity"],
        "page_count": 188,
        "status": "reading",
        "rating": None,
        "description": "A practical account of the Zettelkasten method and why writing is thinking.",
    },
    {
        "title": "The Dispossessed",
        "authors": ["Ursula K. Le Guin"],
        "categories": ["Science fiction"],
        "page_count": 387,
        "status": "want_to_read",
        "rating": None,
        "description": "A physicist travels between an anarchist moon and a capitalist world.",
    },
    {
        "title": "Piranesi",
        "authors": ["Susanna Clarke"],
        "categories": ["Fantasy", "Literary fiction"],
        "page_count": 245,
        "status": "completed",
        "rating": 5,
        "description": "A gentle observer maps an infinite house of tides, statues and birds.",
    },
    {
        "title": "The Art of Statistics",
        "authors": ["David Spiegelhalter"],
        "categories": ["Science", "Mathematics"],
        "page_count": 426,
        "status": "paused",
        "rating": None,
        "description": "How to learn from data without being fooled by it.",
    },
    {
        "title": "Braiding Sweetgrass",
        "authors": ["Robin Wall Kimmerer"],
        "categories": ["Nature", "Essays"],
        "page_count": 408,
        "status": "want_to_read",
        "rating": None,
        "description": "Indigenous wisdom, scientific knowledge and the teachings of plants.",
    },
]

SEED_NOTES = [
    ("The unit of a system is the loop, not the thing", "Meadows keeps returning to the idea that a stock is only meaningful because flows regulate it. I want to use this framing the next time I look at onboarding metrics.", ["systems", "mental models"]),
    ("Writing is the tool of thought", "Ahrens: you do not write after thinking, you write in order to think. The slip-box is a conversation partner, not an archive.", ["writing", "zettelkasten"]),
    ("Piranesi's kindness", "The book's gentleness is not naivety. It is a discipline the protagonist practises under isolation.", ["fiction", "attention"]),
]

SEED_HIGHLIGHTS = [
    ("It is very hard for a man to believe that people are not putting on an act for his benefit.", "Ishiguro, The Remains of the Day"),
    ("The only thing that makes life possible is permanent, intolerable uncertainty: not knowing what comes next.", "Le Guin, The Left Hand of Darkness"),
    ("We can't impose our will on a system. We can listen to what the system tells us, and discover how its properties and our values can work together.", "Meadows, Thinking in Systems"),
]


def _reset_user(db, email: str) -> None:
    user = db.scalar(select(User).where(User.email == email))
    if user is not None:
        db.delete(user)
        db.commit()
        print(f"  reset  removed existing demo account {email}")


def _create_user(db, email: str, password: str, display_name: str) -> User:
    user = User(
        email=email,
        password_hash=hash_password(password),
        display_name=display_name,
        is_demo=True,
        is_admin=True,
        email_verified=True,
    )
    user.settings = UserSettings(
        timezone="Europe/Vienna",
        theme="system",
        preferred_genres=["Science fiction", "Literary fiction", "Science"],
        onboarded=True,
        reminder_time="20:30",
        reminder_days=[0, 1, 2, 3, 4, 5, 6],
        notify_inapp=True,
        notify_email=False,
        weekly_summary=True,
        monthly_report=True,
        ai_enabled=True,
        ai_external_consent=False,
        page_size=24,
        library_view="grid",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    print(f"  create account {email}")
    return user


def _seed_library(db, user: User) -> dict[str, object]:
    rng = random.Random(20261025)
    library: dict[str, object] = {}
    for raw in SEED_BOOKS:
        payload = dict(raw)
        status = payload.pop("status")
        rating = payload.pop("rating")
        review = payload.pop("review", None)
        data = BookInput(
            **payload,
            status=status,
            rating=rating,
            review=review,
        )
        user_book, _ = add_to_library(db, user.id, data)
        db.flush()
        if status == "reading":
            apply_status(user_book, "reading")
        library[str(payload["title"])] = user_book
    db.commit()

    today = datetime.now(timezone.utc)
    reading_titles = ["Thinking in Systems", "How to Take Smart Notes", "The Remains of the Day", "Piranesi"]
    for index in range(18):
        title = reading_titles[index % len(reading_titles)]
        user_book = library[title]
        started = today - timedelta(days=32 - index * 1.7, hours=rng.randint(0, 5))
        minutes = rng.choice([18, 24, 31, 38, 45, 52, 63])
        ended = started + timedelta(minutes=minutes)
        start_page = rng.randint(1, 120)
        end_page = start_page + rng.randint(8, 28)
        session = ReadingSession(
            user_id=user.id,
            user_book_id=user_book.id,
            started_at=started,
            ended_at=ended,
            paused_seconds=rng.choice([0, 0, 45, 90]),
            duration_seconds=minutes * 60,
            start_page=start_page,
            end_page=end_page,
            pages_read=end_page - start_page,
            notes="Seeded reading session." if index % 4 == 0 else None,
            source="manual",
            client_ref=f"seed:{index}",
        )
        db.add(session)
        if index == 17:
            user_book.current_page = end_page
    db.commit()
    print(f"  create {len(library)} library books and 18 reading sessions")
    return library


def _seed_knowledge(db, user: User, library: dict[str, object]) -> None:
    first = library["The Left Hand of Darkness"]
    systems = library["Thinking in Systems"]
    notes = library["How to Take Smart Notes"]
    remains = library["The Remains of the Day"]

    for (title, content, tags), user_book in zip(SEED_NOTES, [systems, notes, library["Piranesi"]]):
        db.add(
            Note(
                user_id=user.id,
                user_book_id=user_book.id,
                title=title,
                content=content,
                tags=tags,
                is_important=True if user_book is systems else False,
            )
        )
    for (text, source), user_book in zip(SEED_HIGHLIGHTS, [remains, first, systems]):
        db.add(
            Highlight(
                user_id=user.id,
                user_book_id=user_book.id,
                text=text,
                commentary=f"From {source}.",
                tags=["seed"],
            )
        )

    today = date.today()
    db.add(
        JournalEntry(
            user_id=user.id,
            entry_date=today,
            title="Reading as a conversation",
            mood="curious",
            reflections="I noticed that I retain far more when I stop to write a question after a chapter.",
            ideas="Keep a single running question per book instead of many highlights.",
            questions="What would it look like to re-read Piranesi with the map beside me?",
            lessons="Attention is a practice, not a mood.",
            applications="End each session with one sentence in the journal.",
        )
    )
    db.add(
        ReadingGoal(
            user_id=user.id,
            name="Read 24 books this year",
            goal_type="books",
            period="year",
            target_value=24,
            start_date=date(today.year, 1, 1),
            end_date=date(today.year, 12, 31),
            is_active=True,
        )
    )
    db.add(
        ReadingGoal(
            user_id=user.id,
            name="Read every day this month",
            goal_type="sessions",
            period="month",
            target_value=30,
            start_date=today.replace(day=1),
            end_date=date(today.year + (1 if today.month == 12 else 0), 1 if today.month == 12 else today.month + 1, 1) - timedelta(days=1),
            is_active=True,
        )
    )
    db.commit()
    print("  create notes, highlights, a journal entry and two goals")


def main() -> int:
    parser = argparse.ArgumentParser(description="Seed a YVO's Book Vault demo account.")
    parser.add_argument("--email", default="demo@bookvault.io")
    parser.add_argument("--password", default="bookvault-demo-2026")
    parser.add_argument("--name", default="Demo Reader")
    parser.add_argument("--reset", action="store_true", help="Delete and recreate the demo account.")
    parser.add_argument("--create", action="store_true", help="Create missing tables (local SQLite only).")
    parser.add_argument("--force", action="store_true", help="Allow seeding when ENVIRONMENT=production.")
    args = parser.parse_args()

    if settings.environment == "production" and not args.force:
        print("Refusing to seed a production database. Pass --force only if you really mean it.", file=sys.stderr)
        return 2

    if args.create:
        Base.metadata.create_all(engine)
        print("  create missing tables")

    db = SessionLocal()
    try:
        existing = db.scalar(select(User).where(User.email == args.email))
        if existing is not None:
            if not args.reset:
                print(
                    f"Account {args.email} already exists. Use --reset to rebuild its demo data, "
                    "or pass a different --email.",
                    file=sys.stderr,
                )
                return 1
            _reset_user(db, args.email)

        user = _create_user(db, args.email, args.password, args.name)
        library = _seed_library(db, user)
        _seed_knowledge(db, user, library)
        print()
        print("Demo account ready:")
        print(f"  email:    {args.email}")
        print(f"  password: {args.password}")
        print("  role:     administrator (local demo only)")
        print("Run the backend and frontend, then sign in at /login.")
        print("Start the worker too, or background jobs (imports, exports, AI) stay queued:")
        print("  python -m app.tasks.worker")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())

