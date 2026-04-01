"""
Database Engine & Session Setup
---------------------------------
Supports SQLite (default, zero-config) and PostgreSQL (production).

Switching to PostgreSQL
-----------------------
1. Update .env:
     DATABASE_URL=postgresql+psycopg2://user:password@host:5432/p_insight
2. Install the driver:
     pip install psycopg2-binary        # sync (used here)
     # or: pip install asyncpg          # if you move to async SQLAlchemy
3. Run migrations:
     alembic upgrade head
4. No code changes required — the engine is configured automatically below.
"""

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from app.core.config import settings


# ─── Engine ───────────────────────────────────────────────────────────────────

# SQLite requires check_same_thread=False because FastAPI may call
# get_db() from threads other than the one that created the connection.
# PostgreSQL (and other databases) do not accept this argument at all.
_connect_args = {"check_same_thread": False} if settings.is_sqlite() else {}

engine = create_engine(
    settings.DATABASE_URL,
    connect_args=_connect_args,
    # Only log SQL in debug mode — avoid leaking queries in production logs
    echo=settings.DEBUG,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


# ─── Base ─────────────────────────────────────────────────────────────────────

class Base(DeclarativeBase):
    """
    Base class for all SQLAlchemy ORM models.
    Import this in each model file and inherit from it.
    """
    pass


# ─── Dependency ───────────────────────────────────────────────────────────────

def get_db():
    """
    FastAPI dependency that yields a database session.
    Automatically closes the session after the request completes.
    Usage: db: Session = Depends(get_db)
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
