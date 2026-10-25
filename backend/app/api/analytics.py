from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import AuthContext, require_csrf
from app.core.db import get_db
from app.core.errors import AppError
from app.services import analytics
from app.services.books import book_authors

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/summary")
def get_summary(auth: AuthContext = Depends(require_csrf), db: Session = Depends(get_db)):
    return analytics.summary(db, auth.user, auth.user.settings)


@router.get("/overview")
def get_overview(
    auth: AuthContext = Depends(require_csrf),
    db: Session = Depends(get_db),
    preset: str = Query(default="30d", pattern="^(7d|30d|month|year|prev_year|custom)$"),
    start: date | None = None,
    end: date | None = None,
):
    try:
        start_d, end_d = analytics.resolve_range(preset, start, end, auth.user.settings.timezone)
    except ValueError as exc:
        raise AppError("invalid_range", str(exc), 400)
    return analytics.overview(db, auth.user, auth.user.settings, start_d, end_d)


@router.get("/heatmap")
def get_heatmap(
    auth: AuthContext = Depends(require_csrf),
    db: Session = Depends(get_db),
    year: int | None = Query(default=None, ge=2000, le=2100),
    metric: str = Query(default="pages", pattern="^(pages|minutes|sessions)$"),
):
    y = year or date.today().year
    return analytics.heatmap(db, auth.user, y, metric)


@router.get("/day")
def get_day(
    day: date,
    auth: AuthContext = Depends(require_csrf),
    db: Session = Depends(get_db),
):
    return analytics.day_detail(db, auth.user, day, auth.user.settings.timezone)


@router.get("/currently-reading")
def get_currently_reading(auth: AuthContext = Depends(require_csrf), db: Session = Depends(get_db)):
    items = analytics.currently_reading(db, auth.user)
    authors = book_authors(db, [i["book"]["id"] for i in items])
    for item in items:
        item["book"]["authors"] = authors.get(item["book"]["id"], [])
    return {"items": items}
