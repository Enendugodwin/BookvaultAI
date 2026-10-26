from __future__ import annotations

from fastapi import APIRouter

from app.api import (
    admin, ai, analytics, auth, books, catalogue, exports, goals, health, imports, jobs,
    knowledge, notifications, sessions, internal,
)

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(admin.router)
api_router.include_router(books.router)
api_router.include_router(sessions.router)
api_router.include_router(goals.router)
api_router.include_router(analytics.router)
api_router.include_router(catalogue.router)
api_router.include_router(knowledge.router)
api_router.include_router(ai.router)
api_router.include_router(notifications.router)
api_router.include_router(imports.router)
api_router.include_router(exports.router)
api_router.include_router(jobs.router)
api_router.include_router(internal.router)
