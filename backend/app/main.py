"""
P-Insight FastAPI Application Entry Point
------------------------------------------
Initialises the app, middleware, and routes.

Local dev:
    uvicorn app.main:app --reload --port 8000

Production (example):
    gunicorn -k uvicorn.workers.UvicornWorker -b 0.0.0.0:8000 app.main:app

Environment variables → see app/core/config.py and DEPLOYMENT.md.
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.api.v1.router import api_router
from app.db.init_db import init_db


# ─── Logging ──────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)


# ─── Lifespan ─────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Runs on startup and shutdown."""
    logger.info("Starting %s v%s [env=%s]", settings.APP_NAME, settings.APP_VERSION, settings.APP_ENV)
    init_db()
    yield
    logger.info("Shutting down %s", settings.APP_NAME)


# ─── App factory ──────────────────────────────────────────────────────────────

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description=(
        "P-Insight Portfolio Analytics API. "
        "Visit /docs for interactive API documentation."
    ),
    lifespan=lifespan,
    # Disable interactive docs in production; enable via DOCS_ENABLED=true
    docs_url="/docs"    if settings.DOCS_ENABLED else None,
    redoc_url="/redoc"  if settings.DOCS_ENABLED else None,
)

# ─── CORS ─────────────────────────────────────────────────────────────────────

_cors_origins = settings.cors_origins()
logger.info("CORS allow-list: %s", _cors_origins)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Routes ───────────────────────────────────────────────────────────────────

app.include_router(api_router)


# ─── Health / Readiness ───────────────────────────────────────────────────────

@app.get("/health", tags=["System"])
async def health_check():
    """
    Liveness probe — returns 200 if the process is running.
    Load balancers and uptime monitors can hit this endpoint.
    """
    return {
        "status": "healthy",
        "app":     settings.APP_NAME,
        "version": settings.APP_VERSION,
        "env":     settings.APP_ENV,
        "features": {
            "live_api":    settings.LIVE_API_ENABLED,
            "broker_sync": settings.BROKER_SYNC_ENABLED,
            "ai_chat":     settings.AI_CHAT_ENABLED,
        },
    }


@app.get("/readiness", tags=["System"])
async def readiness_check():
    """
    Readiness probe — returns 200 only when the app can serve traffic.
    Checks database connectivity before reporting ready.
    Kubernetes / Render / Railway health checks should use this endpoint.
    """
    from sqlalchemy import text
    from app.db.database import SessionLocal

    db_ok   = False
    db_info = "unknown"

    try:
        with SessionLocal() as session:
            session.execute(text("SELECT 1"))
        db_ok   = True
        db_info = "sqlite" if settings.is_sqlite() else "postgresql"
    except Exception as exc:  # noqa: BLE001
        db_info = f"error: {exc}"

    status  = "ready" if db_ok else "not_ready"
    code    = 200    if db_ok else 503

    return JSONResponse(
        status_code=code,
        content={
            "status":   status,
            "database": {"ok": db_ok, "driver": db_info},
        },
    )


@app.get("/", tags=["System"])
async def root():
    payload: dict = {
        "message": f"Welcome to {settings.APP_NAME}",
        "health":  "/health",
        "ready":   "/readiness",
    }
    if settings.DOCS_ENABLED:
        payload["docs"] = "/docs"
    return JSONResponse(payload)
