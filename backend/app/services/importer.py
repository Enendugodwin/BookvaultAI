from __future__ import annotations

import csv
import io
import json
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import AppError
from app.models.book import UserBook
from app.models.ops import ImportJob
from app.models.user import User
from app.schemas.books import BookInput
from app.services.books import add_to_library, find_canonical_book

COLUMNS = [
    "title", "subtitle", "authors", "isbn10", "isbn13", "publisher", "published_date",
    "language", "page_count", "cover_url", "description", "genre", "tags", "status",
    "rating", "review", "current_page",
]

TEMPLATE_ROWS = [
    {
        "title": "The Creative Act", "subtitle": "A Way of Being", "authors": "Rick Rubin",
        "isbn10": "", "isbn13": "9780593652886", "publisher": "Penguin Press",
        "published_date": "2023", "language": "en", "page_count": "432",
        "cover_url": "https://covers.openlibrary.org/b/isbn/9780593652886-L.jpg",
        "description": "Example row — replace with your own data.",
        "genre": "Creativity", "tags": "craft;practice", "status": "want_to_read",
        "rating": "", "review": "", "current_page": "0",
    }
]


def template_csv() -> str:
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=COLUMNS)
    writer.writeheader()
    writer.writerows(TEMPLATE_ROWS)
    return buf.getvalue()


def _parse_bool(value: str) -> bool:
    return str(value).strip().lower() in ("1", "true", "yes", "y")


def _row_to_input(row: dict, row_number: int) -> tuple[BookInput | None, list[str]]:
    errors: list[str] = []
    title = (row.get("title") or "").strip()
    if not title:
        errors.append("title is required")
    authors = [a.strip() for a in (row.get("authors") or "").replace("|", ";").split(";") if a.strip()]
    tags = [t.strip() for t in (row.get("tags") or "").replace("|", ";").split(";") if t.strip()]
    page_count = None
    if (row.get("page_count") or "").strip():
        try:
            page_count = int(float(row["page_count"]))
            if page_count < 1:
                raise ValueError
        except ValueError:
            errors.append("page_count must be a positive integer")
    current_page = None
    if (row.get("current_page") or "").strip():
        try:
            current_page = int(float(row["current_page"]))
            if current_page < 0:
                raise ValueError
        except ValueError:
            errors.append("current_page must be a non-negative integer")
    rating = None
    if (row.get("rating") or "").strip():
        try:
            rating = float(row["rating"])
            if not 0 <= rating <= 5:
                raise ValueError
        except ValueError:
            errors.append("rating must be between 0 and 5")
    cover_url = (row.get("cover_url") or "").strip() or None
    if cover_url and not (cover_url.startswith("https://") or cover_url.startswith("http://")):
        errors.append("cover_url must start with http:// or https://")
    status = (row.get("status") or "want_to_read").strip() or "want_to_read"
    if status not in ("want_to_read", "reading", "completed", "paused", "abandoned", "rereading"):
        errors.append(f"unknown status '{status}'")
    if errors:
        return None, errors
    try:
        data = BookInput(
            title=title,
            subtitle=(row.get("subtitle") or "").strip() or None,
            authors=authors,
            isbn10=(row.get("isbn10") or "").strip() or None,
            isbn13=(row.get("isbn13") or "").strip() or None,
            publisher=(row.get("publisher") or "").strip() or None,
            published_date=(row.get("published_date") or "").strip() or None,
            language=(row.get("language") or "").strip() or None,
            page_count=page_count,
            cover_url=cover_url,
            description=(row.get("description") or "").strip() or None,
            genre=(row.get("genre") or "").strip() or None,
            tags=tags,
            status=status,
            rating=rating,
            review=(row.get("review") or "").strip() or None,
            current_page=current_page,
        )
        return data, []
    except Exception as exc:
        return None, [str(exc).split("\n")[0]]


def parse_content(content: str, kind: str) -> list[dict]:
    if kind == "books_json":
        try:
            payload = json.loads(content)
        except json.JSONDecodeError as exc:
            raise AppError("invalid_json", f"Invalid JSON: {exc.msg} at line {exc.lineno}.", 400)
        rows = payload.get("books") if isinstance(payload, dict) else payload
        if not isinstance(rows, list):
            raise AppError("invalid_json", "JSON must contain a 'books' array.", 400)
        if len(rows) > settings.max_import_rows:
            raise AppError("too_large", f"Imports are limited to {settings.max_import_rows} rows.", 413)
        out = []
        for idx, entry in enumerate(rows, start=1):
            if not isinstance(entry, dict):
                continue
            if isinstance(entry.get("book"), dict):
                merged = {**entry["book"], **{k: v for k, v in entry.items() if k != "book"}}
                entry = merged
            normalized = {
                "title": entry.get("title", ""),
                "subtitle": entry.get("subtitle", ""),
                "authors": ";".join(entry.get("authors") or []) if isinstance(entry.get("authors"), list) else entry.get("authors", ""),
                "isbn10": entry.get("isbn10", ""),
                "isbn13": entry.get("isbn13", ""),
                "publisher": entry.get("publisher", ""),
                "published_date": entry.get("published_date", ""),
                "language": entry.get("language", ""),
                "page_count": entry.get("page_count", ""),
                "cover_url": entry.get("cover_url", ""),
                "description": entry.get("description", ""),
                "genre": entry.get("genre", ""),
                "tags": ";".join(entry.get("tags") or []) if isinstance(entry.get("tags"), list) else entry.get("tags", ""),
                "status": entry.get("status", "want_to_read"),
                "rating": entry.get("rating", ""),
                "review": entry.get("review", ""),
                "current_page": entry.get("current_page", ""),
            }
            data, errors = _row_to_input(normalized, idx)
            out.append({"row": idx, "data": data, "errors": errors})
        return out
    reader = csv.DictReader(io.StringIO(content))
    if reader.fieldnames is None:
        raise AppError("invalid_csv", "The file has no header row.", 400)
    if "title" not in [f.strip().lower() for f in reader.fieldnames if f]:
        raise AppError("invalid_csv", "The CSV must include a 'title' column. Download the template.", 400)
    reader.fieldnames = [(f or "").strip().lower() for f in reader.fieldnames]
    rows = []
    for idx, row in enumerate(reader, start=2):
        if idx - 1 > settings.max_import_rows:
            raise AppError("too_large", f"Imports are limited to {settings.max_import_rows} rows.", 413)
        if not any((v or "").strip() for v in row.values()):
            continue
        rows.append(row)
    out = []
    for i, row in enumerate(rows, start=2):
        data, errors = _row_to_input(row, i)
        out.append({"row": i, "data": data, "errors": errors})
    return out


def preview(db: Session, user: User, filename: str, kind: str, content: str) -> ImportJob:
    parsed = parse_content(content, kind)
    preview_rows = []
    duplicates = 0
    errors = 0
    for item in parsed[:200]:
        data = item["data"]
        status = "ready"
        message = ""
        if item["errors"] or data is None:
            status = "error"
            message = "; ".join(item["errors"])
            errors += 1
        else:
            canonical = find_canonical_book(db, data)
            if canonical:
                existing = db.scalar(
                    select(UserBook).where(UserBook.user_id == user.id, UserBook.book_id == canonical.id)
                )
                if existing:
                    status = "duplicate"
                    message = "Already in your library — will be skipped."
                    duplicates += 1
        preview_rows.append({
            "row": item["row"],
            "title": (data.title if data else ""),
            "authors": (data.authors if data else []),
            "status": status,
            "message": message,
        })
    job = ImportJob(
        user_id=user.id, filename=filename[:255], kind=kind, status="preview",
        total_rows=len(parsed), imported_rows=0, skipped_rows=duplicates,
        error_rows=[r for r in preview_rows if r["status"] == "error"],
        preview=preview_rows, raw_content=content,
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


def commit(db: Session, job: ImportJob) -> dict:
    if job.status in ("completed", "cancelled"):
        raise AppError("invalid_state", "This import has already been committed.", 409)
    parsed = parse_content(job.raw_content or "", job.kind)
    imported = skipped = 0
    errors: list[dict] = []
    created_ids: list[str] = []
    for item in parsed:
        data = item["data"]
        if data is None:
            skipped += 1
            errors.append({"row": item["row"], "message": "; ".join(item["errors"])})
            continue
        try:
            with db.begin_nested():
                ub, _ = add_to_library(db, job.user_id, data)
                created_ids.append(ub.id)
            imported += 1
        except Exception as exc:
            skipped += 1
            errors.append({"row": item["row"], "message": str(exc).split("\n")[0][:300]})
    job.imported_rows += imported
    job.skipped_rows = skipped
    job.error_rows = errors
    job.status = "completed" if imported or not errors else "failed"
    job.created_book_ids = created_ids
    db.commit()
    return {"imported": imported, "skipped": skipped, "errors": errors[:100]}
