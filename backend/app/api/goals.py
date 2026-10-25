from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import AuthContext, require_csrf
from app.core.db import get_db
from app.core.errors import AppError, NotFound
from app.core.timeutils import today_local
from app.models.reading import ReadingGoal
from app.schemas.reading import GoalIn, GoalUpdate
from app.services.goals import compute_goal, recommendations

router = APIRouter(prefix="/goals", tags=["goals"])


@router.get("")
def list_goals(
    auth: AuthContext = Depends(require_csrf),
    db: Session = Depends(get_db),
    include_inactive: bool = False,
):
    tz = auth.user.settings.timezone
    stmt = select(ReadingGoal).where(ReadingGoal.user_id == auth.user.id)
    if not include_inactive:
        stmt = stmt.where(ReadingGoal.is_active.is_(True))
    goals = db.scalars(stmt.order_by(ReadingGoal.created_at.desc())).all()
    today = today_local(tz)
    return {"items": [compute_goal(db, auth.user, g, tz, today) for g in goals]}


@router.post("", status_code=201)
def create_goal(
    payload: GoalIn, auth: AuthContext = Depends(require_csrf), db: Session = Depends(get_db)
):
    goal = ReadingGoal(user_id=auth.user.id, **payload.model_dump())
    db.add(goal)
    db.commit()
    db.refresh(goal)
    return compute_goal(db, auth.user, goal, auth.user.settings.timezone)


@router.patch("/{goal_id}")
def update_goal(
    goal_id: str, payload: GoalUpdate,
    auth: AuthContext = Depends(require_csrf), db: Session = Depends(get_db),
):
    goal = db.get(ReadingGoal, goal_id)
    if not goal or goal.user_id != auth.user.id:
        raise NotFound("Goal")
    data = payload.model_dump(exclude_unset=True)
    for key, value in data.items():
        if value is not None:
            setattr(goal, key, value)
    if goal.end_date < goal.start_date:
        raise AppError("invalid_dates", "Goal end date must not be before the start date.", 400)
    if goal.goal_type == "genre_books" and not goal.genre:
        raise AppError("invalid_goal", "A genre is required for genre-based goals.", 400)
    goal.completed_at = None
    db.commit()
    db.refresh(goal)
    return compute_goal(db, auth.user, goal, auth.user.settings.timezone)


@router.delete("/{goal_id}", status_code=204)
def delete_goal(
    goal_id: str, auth: AuthContext = Depends(require_csrf), db: Session = Depends(get_db)
):
    goal = db.get(ReadingGoal, goal_id)
    if not goal or goal.user_id != auth.user.id:
        raise NotFound("Goal")
    db.delete(goal)
    db.commit()
    return None


@router.get("/recommendations/current")
def goal_recommendations(
    auth: AuthContext = Depends(require_csrf), db: Session = Depends(get_db),
    limit: int = Query(default=3, ge=1, le=5),
):
    return {
        "items": recommendations(db, auth.user, auth.user.settings, auth.user.settings.timezone)[:limit]
    }
