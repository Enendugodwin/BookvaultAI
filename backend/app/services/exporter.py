from __future__ import annotations

import csv
import io
import json
import zipfile
from datetime import date, datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.book import UserBook
from app.models.knowledge import Highlight, JournalEntry, Note
from app.models.reading import ReadingSession
from app.models.user import User, UserSettings
from app.services.analytics import overview, resolve_range, summary
from app.services.books import book_authors, book_categories

DANGEROUS_PREFIXES = ("=", "+", "-", "@", "\t", "\r")


def csv_safe(value) -> str:
    if value is None:
        return ""
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return str(value)
    text = str(value)
    if text.startswith(DANGEROUS_PREFIXES):
        return "'" + text
    return text


def _csv_bytes(headers: list[str], rows: list[list]) -> bytes:
    buf = io.StringIO()
    writer = csv.writer(buf, lineterminator="\r\n")
    writer.writerow(headers)
    for row in rows:
        writer.writerow([csv_safe(v) for v in row])
    return buf.getvalue().encode("utf-8-sig")


def _library_items(db: Session, user: User) -> list[dict]:
    items = db.scalars(
        select(UserBook).where(UserBook.user_id == user.id).order_by(UserBook.created_at)
    ).all()
    authors = book_authors(db, [ub.book_id for ub in items])
    cats = book_categories(db, [ub.book_id for ub in items])
    out = []
    for ub in items:
        b = ub.book
        out.append({
            "title": b.title,
            "subtitle": b.subtitle,
            "authors": authors.get(b.id, []),
            "isbn10": b.isbn10,
            "isbn13": b.isbn13,
            "publisher": b.publisher,
            "published_date": b.published_date,
            "language": b.language,
            "page_count": b.page_count,
            "description": b.description,
            "cover_url": b.cover_url,
            "categories": cats.get(b.id, []),
            "status": ub.status,
            "rating": ub.rating,
            "review": ub.review,
            "current_page": ub.current_page,
            "genre": ub.genre,
            "tags": ub.tags or [],
            "started_at": ub.started_at.isoformat() if ub.started_at else None,
            "completed_at": ub.completed_at.isoformat() if ub.completed_at else None,
            "archived": ub.archived,
            "added_at": ub.created_at.isoformat(),
        })
    return out


def library_csv(db: Session, user: User) -> tuple[str, str, bytes]:
    items = _library_items(db, user)
    headers = [
        "title", "subtitle", "authors", "isbn10", "isbn13", "publisher", "published_date",
        "language", "page_count", "genre", "tags", "status", "rating", "review",
        "current_page", "started_at", "completed_at", "added_at",
    ]
    rows = []
    for it in items:
        rows.append([
            it["title"], it["subtitle"], ";".join(it["authors"]), it["isbn10"], it["isbn13"],
            it["publisher"], it["published_date"], it["language"], it["page_count"],
            it["genre"], ";".join(it["tags"]), it["status"], it["rating"], it["review"],
            it["current_page"], it["started_at"], it["completed_at"], it["added_at"],
        ])
    return f"bookvault-library-{date.today().isoformat()}.csv", "text/csv; charset=utf-8", _csv_bytes(headers, rows)


def library_json(db: Session, user: User) -> tuple[str, str, bytes]:
    payload = {
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "format": "bookvault-library-v1",
        "books": _library_items(db, user),
    }
    name = f"bookvault-library-{date.today().isoformat()}.json"
    return name, "application/json", json.dumps(payload, indent=2, ensure_ascii=False).encode("utf-8")


def sessions_csv(db: Session, user: User) -> tuple[str, str, bytes]:
    rows = db.execute(
        select(ReadingSession, UserBook)
        .join(UserBook, UserBook.id == ReadingSession.user_book_id)
        .where(ReadingSession.user_id == user.id)
        .order_by(ReadingSession.started_at)
    ).all()
    data = []
    for s, ub in rows:
        data.append([
            s.started_at.isoformat(), s.ended_at.isoformat(), round(s.duration_seconds / 60, 1),
            ub.book.title, s.start_page, s.end_page, s.pages_read, s.notes,
        ])
    headers = ["started_at", "ended_at", "minutes", "book", "start_page", "end_page", "pages_read", "notes"]
    return f"bookvault-sessions-{date.today().isoformat()}.csv", "text/csv; charset=utf-8", _csv_bytes(headers, data)


def notes_markdown(db: Session, user: User) -> tuple[str, str, bytes]:
    books = {ub.id: ub for ub in db.scalars(select(UserBook).where(UserBook.user_id == user.id)).all()}
    notes = db.scalars(
        select(Note).where(Note.user_id == user.id).order_by(Note.created_at)
    ).all()
    highlights = db.scalars(
        select(Highlight).where(Highlight.user_id == user.id).order_by(Highlight.created_at)
    ).all()
    journal = db.scalars(
        select(JournalEntry).where(JournalEntry.user_id == user.id).order_by(JournalEntry.entry_date)
    ).all()
    lines = [f"# BookVault AI — Notes & Knowledge", "", f"Exported {datetime.now(timezone.utc).isoformat()}", ""]
    lines += ["## Notes", ""]
    for n in notes:
        book = books.get(n.user_book_id)
        lines.append(f"### {n.title}")
        meta = [f"Book: {book.book.title}" if book else "Book: —"]
        if n.page_ref:
            meta.append(f"Page: {n.page_ref}")
        if n.is_important:
            meta.append("Important")
        lines.append("_" + " · ".join(meta) + "_")
        lines.append("")
        lines.append(n.content)
        lines.append("")
    lines += ["## Highlights", ""]
    for h in highlights:
        book = books.get(h.user_book_id)
        lines.append(f"> {h.text}")
        lines.append("")
        if h.commentary:
            lines.append(f"Commentary: {h.commentary}")
        if book:
            lines.append(f"— {book.book.title}" + (f", p.{h.page_ref}" if h.page_ref else ""))
        lines.append("")
    lines += ["## Reading journal", ""]
    for j in journal:
        lines.append(f"### {j.entry_date.isoformat()}" + (f" — {j.title}" if j.title else ""))
        for label, value in (
            ("Reflections", j.reflections), ("Ideas", j.ideas), ("Questions", j.questions),
            ("Lessons", j.lessons), ("Applications", j.applications),
        ):
            if value:
                lines.append(f"**{label}:** {value}")
        lines.append("")
    name = f"bookvault-notes-{date.today().isoformat()}.md"
    return name, "text/markdown; charset=utf-8", "\n".join(lines).encode("utf-8")


def report_pdf(db: Session, user: User, cfg: UserSettings, period: str = "month") -> tuple[str, str, bytes]:
    from reportlab.graphics.charts.barcharts import VerticalBarChart
    from reportlab.graphics.shapes import Drawing
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    today = date.today()
    summary_data = summary(db, user, cfg)
    start, end = resolve_range("30d" if period == "month" else "7d", None, None, cfg.timezone)
    data = overview(db, user, cfg, start, end)

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=20 * mm, rightMargin=20 * mm,
                            topMargin=18 * mm, bottomMargin=18 * mm)
    styles = getSampleStyleSheet()
    story = [
        Paragraph("BookVault AI — Reading Report", styles["Title"]),
        Paragraph(f"{start.isoformat()} to {end.isoformat()} · {user.display_name}", styles["Normal"]),
        Spacer(1, 8 * mm),
    ]
    rows = [
        ["Books completed", str(data["totals"]["books_completed"])],
        ["Pages read", str(data["totals"]["pages"])],
        ["Reading time", f"{data['totals']['minutes']:.0f} minutes"],
        ["Sessions", str(data["totals"]["sessions"])],
        ["Current streak", f"{summary_data['current_streak']} days"],
        ["Library size", str(summary_data["total_books"])],
    ]
    table = Table(rows, colWidths=[60 * mm, 60 * mm])
    table.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#d9d4c7")),
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#f3efe6")),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    story += [table, Spacer(1, 8 * mm), Paragraph("Pages read by month", styles["Heading2"])]

    months = data["monthly"][-6:]
    if months:
        drawing = Drawing(420, 150)
        chart = VerticalBarChart()
        chart.x, chart.y, chart.height, chart.width = 40, 20, 110, 360
        chart.data = [[m["pages"] for m in months]]
        chart.categoryAxis.categoryNames = [m["month"][2:] for m in months]
        chart.bars[0].fillColor = colors.HexColor("#6d5bd0")
        chart.valueAxis.valueMin = 0
        chart.valueAxis.valueMax = max(10, max(m["pages"] for m in months) * 1.2)
        chart.categoryAxis.labels.fontSize = 7
        drawing.add(chart)
        story.append(drawing)
    story += [Spacer(1, 6 * mm), Paragraph("Recently completed", styles["Heading2"])]
    completed = db.scalars(
        select(UserBook).where(
            UserBook.user_id == user.id, UserBook.completed_at.is_not(None)
        ).order_by(UserBook.completed_at.desc()).limit(8)
    ).all()
    if completed:
        for ub in completed:
            story.append(Paragraph(f"• {ub.book.title} — {ub.book.published_date or ''}", styles["Normal"]))
    else:
        story.append(Paragraph("No completed books recorded yet.", styles["Normal"]))
    story += [Spacer(1, 6 * mm), Paragraph(
        "Generated from your stored sessions and library records. Days are grouped in your configured time zone.",
        styles["Italic"])]
    doc.build(story)
    name = f"bookvault-report-{period}-{today.isoformat()}.pdf"
    return name, "application/pdf", buf.getvalue()


def archive_zip(db: Session, user: User, cfg: UserSettings) -> tuple[str, str, bytes]:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("README.txt",
                    "BookVault AI personal data archive.\n"
                    "Contains library.json (complete library), library.csv, sessions.csv, "
                    "notes-and-journal.md, journal.json, highlights.json and account.json.\n")
        name, _, data = library_json(db, user)
        zf.writestr("library.json", data)
        zf.writestr("library.csv", library_csv(db, user)[2])
        zf.writestr("sessions.csv", sessions_csv(db, user)[2])
        zf.writestr("notes-and-journal.md", notes_markdown(db, user)[2])
        journal = db.scalars(select(JournalEntry).where(JournalEntry.user_id == user.id)).all()
        zf.writestr("journal.json", json.dumps([{
            "date": j.entry_date.isoformat(), "title": j.title, "reflections": j.reflections,
            "ideas": j.ideas, "questions": j.questions, "lessons": j.lessons,
            "applications": j.applications, "mood": j.mood,
        } for j in journal], indent=2))
        highlights = db.scalars(select(Highlight).where(Highlight.user_id == user.id)).all()
        zf.writestr("highlights.json", json.dumps([{
            "text": h.text, "page": h.page_ref, "commentary": h.commentary,
            "tags": h.tags, "created_at": h.created_at.isoformat(),
        } for h in highlights], indent=2))
        zf.writestr("account.json", json.dumps({
            "id": user.id, "email": user.email, "display_name": user.display_name,
            "created_at": user.created_at.isoformat(),
            "timezone": cfg.timezone, "preferred_genres": cfg.preferred_genres,
        }, indent=2))
    name = f"bookvault-archive-{date.today().isoformat()}.zip"
    return name, "application/zip", buf.getvalue()
