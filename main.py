from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BACKEND = ROOT / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

# Vercel builds the Vite bundle before deploying the FastAPI function and copies
# it under backend/ so it is inside the function's includeFiles glob. Local runs
# fall back to the normal frontend/dist location.
DIST = ROOT / "backend" / "frontend_dist"
if not DIST.is_dir():
    DIST = ROOT / "frontend" / "dist"
os.environ.setdefault("FRONTEND_DIST_DIR", str(DIST))

from app.main import app  # noqa: E402,F401

__all__ = ["app"]
