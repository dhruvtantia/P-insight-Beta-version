"""
Database Engine & Session Setup
---------------------------------
Uses SQLAlchemy with SQLite for Phase 1.

To migrate to PostgreSQL (Phase 2+):
  1. Update DATABASE_URL in .env:
       DATABASE_URL=postgresql+psycopg2://user:password@localhost:5432/p_insight
  2. Remove connect_args={"check_same_thread": False} (SQLite-only)
  3. pip install psycopg2-binary (or asyncpg for async)
  4. Run: alembic upgrade head
"""

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from app.core.config import settings


engine = create_engine(
    settings.DATABASE_URL,
    connect_args={"check_same_thread": False},  # Required for SQLite only
    echo=settings.DEBUG,  # Logs SQL queries in debug mode
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    """
    Base class for all SQLAlchemy ORM models.
    Import this in each model file and inherit from it.
    """
    pass


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
