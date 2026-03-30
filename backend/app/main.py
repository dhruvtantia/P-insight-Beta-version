"""
P-Insight FastAPI Application Entry Point
------------------------------------------
Initialises the app, middleware, and routes.
Run with: uvicorn app.main:app --reload --port 8000
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager

from app.core.config import settings
from app.api.v1.router import api_router
from app.db.init_db import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Runs on startup and shutdown."""
    print(f"🚀 Starting {settings.APP_NAME} v{settings.APP_VERSION}")
    init_db()
    yield
    print("👋 Shutting down P-Insight API")


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description=(
        "P-Insight Portfolio Analytics API. "
        "Visit /docs for interactive API documentation."
    ),
    lifespan=lifespan,
)

# ─── CORS ─────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL, "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Routes ───────────────────────────────────────────────────────────────────
app.include_router(api_router)


# ─── Health Check ─────────────────────────────────────────────────────────────
@app.get("/health", tags=["System"])
async def health_check():
    return {
        "status": "healthy",
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "features": {
            "live_api": settings.LIVE_API_ENABLED,
            "broker_sync": settings.BROKER_SYNC_ENABLED,
            "ai_chat": settings.AI_CHAT_ENABLED,
        },
    }


@app.get("/", tags=["System"])
async def root():
    return JSONResponse({
        "message": f"Welcome to {settings.APP_NAME}",
        "docs": "/docs",
        "health": "/health",
    })
