"""Google Books + Open Library metadata search with a persistent cache.

Only bibliographic metadata is retrieved. Neither provider supplies full book
text and the UI states this explicitly.
"""
from __future__ import annotations

import asyncio
import hashlib
import re
from datetime import datetime, timedelta, timezone

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.ops import CatalogueCache

GOOGLE_URL = "https://www.googleapis.com/books/v1/volumes"
OPENLIBRARY_SEARCH = "https://openlibrary.org/search.json"
OPENLIBRARY_ISBN = "https://openlibrary.org/isbn/{isbn}.json"
COVER_BASE = "https://covers.openlibrary.org/b/id/{cover_id}-L.jpg"


def _clean_isbns(values) -> tuple[str | None, str | None]:
    isbn10 = isbn13 = None
    for raw in values or []:
        digits = re.sub(r"[^0-9Xx]", "", str(raw)).upper()
        if len(digits) == 13 and digits.startswith(("978", "979")):
            isbn13 = isbn13 or digits
        elif len(digits) == 10:
            isbn10 = isbn10 or digits
    return isbn10, isbn13


def _item(**kw) -> dict:
    return {
        "title": kw.get("title") or "Untitled",
        "subtitle": kw.get("subtitle"),
        "authors": [a for a in (kw.get("authors") or []) if a][:10],
        "isbn10": kw.get("isbn10"),
        "isbn13": kw.get("isbn13"),
        "description": (kw.get("description") or "")[:5000] or None,
        "publisher": kw.get("publisher"),
        "published_date": kw.get("published_date"),
        "language": kw.get("language"),
        "page_count": kw.get("page_count"),
        "cover_url": kw.get("cover_url"),
        "categories": [c for c in (kw.get("categories") or []) if c][:10],
        "google_books_id": kw.get("google_books_id"),
        "openlibrary_id": kw.get("openlibrary_id"),
        "source": kw.get("source"),
    }


def _parse_google(payload: dict) -> list[dict]:
    out = []
    for row in payload.get("items", []) or []:
        info = row.get("volumeInfo", {}) or {}
        ids = info.get("industryIdentifiers", []) or []
        isbn10, isbn13 = _clean_isbns([i.get("identifier") for i in ids])
        images = info.get("imageLinks", {}) or {}
        cover = images.get("thumbnail") or images.get("smallThumbnail")
        if cover:
            cover = cover.replace("http://", "https://").replace("&zoom=1", "&zoom=2")
        out.append(_item(
            title=info.get("title"),
            subtitle=info.get("subtitle"),
            authors=info.get("authors"),
            isbn10=isbn10,
            isbn13=isbn13,
            description=info.get("description"),
            publisher=info.get("publisher"),
            published_date=info.get("publishedDate"),
            language=info.get("language"),
            page_count=info.get("pageCount"),
            cover_url=cover,
            categories=info.get("categories"),
            google_books_id=row.get("id"),
            source="google_books",
        ))
    return out


def _parse_openlibrary(payload: dict) -> list[dict]:
    out = []
    for doc in payload.get("docs", []) or []:
        isbn10, isbn13 = _clean_isbns(doc.get("isbn"))
        cover_id = (doc.get("cover_i") or [None])[0] if isinstance(doc.get("cover_i"), list) else doc.get("cover_i")
        out.append(_item(
            title=doc.get("title"),
            subtitle=doc.get("subtitle"),
            authors=doc.get("author_name"),
            isbn10=isbn10,
            isbn13=isbn13,
            published_date=str(doc.get("first_publish_year")) if doc.get("first_publish_year") else None,
            language=(doc.get("language") or [None])[0],
            page_count=doc.get("number_of_pages_median"),
            cover_url=COVER_BASE.format(cover_id=cover_id) if cover_id else None,
            categories=doc.get("subject"),
            openlibrary_id=doc.get("key", "").replace("/works/", "") or None,
            source="open_library",
        ))
    return out


def _cache_key(field: str, query: str) -> str:
    return hashlib.sha256(f"v1|{field}|{query.casefold()}".encode()).hexdigest()[:40]


def _get_cached(db: Session, key: str) -> dict | None:
    row = db.scalar(select(CatalogueCache).where(CatalogueCache.cache_key == key))
    if not row:
        return None
    fetched = row.fetched_at
    if fetched.tzinfo is None:
        fetched = fetched.replace(tzinfo=timezone.utc)
    if fetched + timedelta(minutes=settings.catalogue_cache_minutes) < datetime.now(timezone.utc):
        return None
    return row.payload


def _store(db: Session, key: str, payload: dict) -> None:
    row = db.scalar(select(CatalogueCache).where(CatalogueCache.cache_key == key))
    if row is None:
        row = CatalogueCache(cache_key=key, payload=payload, fetched_at=datetime.now(timezone.utc))
        db.add(row)
    else:
        row.payload = payload
        row.fetched_at = datetime.now(timezone.utc)
    db.commit()


async def _google(query: str, field: str, limit: int) -> list[dict]:
    q = query
    if field == "isbn":
        q = f"isbn:{query}"
    elif field == "title":
        q = f"intitle:{query}"
    elif field == "author":
        q = f"inauthor:{query}"
    elif field == "subject":
        q = f"subject:{query}"
    params = {"q": q, "maxResults": min(40, limit), "printType": "books"}
    if settings.google_books_api_key:
        params["key"] = settings.google_books_api_key
    async with httpx.AsyncClient(timeout=settings.catalogue_timeout_seconds) as client:
        r = await client.get(GOOGLE_URL, params=params)
        if r.status_code == 429:
            raise RuntimeError("Google Books rate limit reached")
        r.raise_for_status()
        return _parse_google(r.json())


async def _openlibrary(query: str, field: str, limit: int) -> list[dict]:
    params: dict = {"limit": min(40, limit)}
    if field == "isbn":
        async with httpx.AsyncClient(timeout=settings.catalogue_timeout_seconds) as client:
            r = await client.get(OPENLIBRARY_ISBN.format(isbn=query))
            if r.status_code == 404:
                return []
            r.raise_for_status()
            doc = r.json()
            return [_item(
                title=doc.get("title"),
                subtitle=doc.get("subtitle"),
                authors=[a.get("name") for a in doc.get("by_statement", [])] if isinstance(doc.get("by_statement"), list) else None,
                isbn10=_clean_isbns(doc.get("isbn_10"))[0],
                isbn13=_clean_isbns(doc.get("isbn_13"))[1],
                publisher=(doc.get("publishers") or [None])[0],
                published_date=doc.get("publish_date"),
                page_count=doc.get("number_of_pages"),
                cover_url=COVER_BASE.format(cover_id=doc["covers"][0]) if doc.get("covers") else None,
                openlibrary_id=doc.get("key", "").replace("/books/", "") or None,
                source="open_library",
            )]
    params["q"] = query
    if field == "title":
        params["title"] = query
    elif field == "author":
        params["author"] = query
    elif field == "subject":
        params["subject"] = query
    async with httpx.AsyncClient(timeout=settings.catalogue_timeout_seconds) as client:
        r = await client.get(OPENLIBRARY_SEARCH, params=params)
        if r.status_code == 429:
            raise RuntimeError("Open Library rate limit reached")
        r.raise_for_status()
        return _parse_openlibrary(r.json())


def _dedupe(items: list[dict], limit: int) -> list[dict]:
    seen: set[str] = set()
    out = []
    for item in items:
        key = item.get("isbn13") or item.get("isbn10") or f"{(item.get('title') or '').casefold()}|{','.join(item.get('authors') or []).casefold()}"
        if key in seen:
            continue
        seen.add(key)
        out.append(item)
        if len(out) >= limit:
            break
    return out


async def search(db: Session, query: str, field: str = "all", limit: int = 20) -> dict:
    query = (query or "").strip()
    if len(query) < 2:
        raise ValueError("Enter at least two characters to search.")
    field = field if field in ("all", "title", "author", "isbn", "subject") else "all"
    limit = max(1, min(40, limit))
    key = _cache_key(field, query)
    cached = _get_cached(db, key)
    if cached:
        return {**cached, "cached": True}

    tasks = [_google(query, field, limit), _openlibrary(query, field, limit)]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    items: list[dict] = []
    errors: list[str] = []
    for name, result in zip(("google_books", "open_library"), results):
        if isinstance(result, Exception):
            errors.append(f"{name}: {result}")
        else:
            items.extend(result)

    payload = {
        "query": query,
        "field": field,
        "items": _dedupe(items, limit),
        "errors": errors,
        "degraded": bool(errors),
        "attribution": "Metadata from Google Books and Open Library. No full book text is provided.",
    }
    if payload["items"] or not errors:
        _store(db, key, payload)
    return {**payload, "cached": False}
