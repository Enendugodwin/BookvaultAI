from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BACKEND = ROOT / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

# Vercel builds the Vite bundle before deploying the FastAPI function. Point the
# existing SPA fallback at it so /, /assets/* and client-side routes all work on
# the same domain as /api/v1.
DIST = ROOT / "frontend" / "dist"
os.environ.setdefault("FRONTEND_DIST_DIR", str(DIST))

from app.main import app  # noqa: E402,F401

__all__ = ["app"]
