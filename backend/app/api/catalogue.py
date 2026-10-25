from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import AuthContext, require_csrf
from app.core.db import get_db
from app.core.errors import AppError, ExternalServiceError
from app.services import catalogue

router = APIRouter(prefix="/catalogue", tags=["catalogue"])


@router.get("/search")
async def search(
    auth: AuthContext = Depends(require_csrf),
    db: Session = Depends(get_db),
    q: str = Query(min_length=2, max_length=200),
    field: str = Query(default="all", pattern="^(all|title|author|isbn|subject)$"),
    limit: int = Query(default=20, ge=1, le=40),
):
    try:
        result = await catalogue.search(db, q, field, limit)
    except ValueError as exc:
        raise AppError("invalid_query", str(exc), 400)
    except Exception:
        raise ExternalServiceError("Book catalogue")
    if not result["items"] and result.get("errors"):
        raise ExternalServiceError("Book catalogue")
    return result


@router.get("/isbn/{isbn}")
async def by_isbn(
    isbn: str, auth: AuthContext = Depends(require_csrf), db: Session = Depends(get_db)
):
    clean = "".join(c for c in isbn if c.isdigit() or c.upper() == "X")
    if len(clean) not in (10, 13):
        raise AppError("invalid_isbn", "ISBN must have 10 or 13 digits.", 400)
    try:
        result = await catalogue.search(db, clean, "isbn", 5)
    except Exception:
        raise ExternalServiceError("Book catalogue")
    return result
