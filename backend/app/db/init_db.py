"""
Database Initialisation
-------------------------
Creates all tables on application startup.
Also runs lightweight column migrations for additive schema changes
so existing SQLite databases are upgraded automatically.

For Phase 2+, replace the ALTER TABLE block with Alembic migrations.
"""

import json
import logging
from datetime import datetime, timezone

from sqlalchemy import text
from app.db.database import engine, Base

# Import all models so SQLAlchemy registers them before create_all
from app.models import portfolio         # noqa: F401
from app.models import snapshot          # noqa: F401
from app.models import broker_connection # noqa: F401

logger = logging.getLogger(__name__)


# ─── Column additions for existing tables ─────────────────────────────────────
# Each entry: (table, column, sqlite_type, default_expression)
# We use "IF NOT EXISTS" via a try/except because SQLite does not support it.

_COLUMN_MIGRATIONS: list[tuple[str, str, str, str]] = [
    ("portfolios", "is_active",        "BOOLEAN",     "0"),
    ("portfolios", "description",      "TEXT",        "NULL"),
    ("portfolios", "upload_filename",  "VARCHAR(255)", "NULL"),
    # Final Hardening — Source lifecycle
    ("portfolios", "last_synced_at",  "DATETIME",    "NULL"),
    ("portfolios", "source_metadata", "TEXT",        "NULL"),
    # Broker Sync Phase — broker_connections table is auto-created by create_all;
    # these are extra columns if the table already exists from an older version.
    ("broker_connections", "portfolio_id",     "INTEGER",    "NULL"),
    ("broker_connections", "broker_name",      "VARCHAR(50)","NULL"),
    ("broker_connections", "connection_state", "VARCHAR(20)","'disconnected'"),
    ("broker_connections", "account_id",       "VARCHAR(100)","NULL"),
    ("broker_connections", "last_sync_at",     "DATETIME",   "NULL"),
    ("broker_connections", "sync_error",       "TEXT",       "NULL"),
    ("broker_connections", "config_json",      "TEXT",       "NULL"),
    # Extended holding fields + enrichment metadata
    ("holdings", "industry",           "VARCHAR(150)", "NULL"),
    ("holdings", "purchase_date",      "VARCHAR(20)",  "NULL"),
    ("holdings", "normalized_ticker",  "VARCHAR(30)",  "NULL"),
    ("holdings", "sector_status",      "VARCHAR(20)",  "NULL"),
    ("holdings", "name_status",        "VARCHAR(20)",  "NULL"),
    ("holdings", "enrichment_reason",  "TEXT",         "NULL"),
]


def _run_column_migrations() -> None:
    """Idempotently add new columns to existing tables."""
    with engine.connect() as conn:
        for table, col, col_type, default in _COLUMN_MIGRATIONS:
            try:
                conn.execute(
                    text(f"ALTER TABLE {table} ADD COLUMN {col} {col_type} DEFAULT {default}")
                )
                conn.commit()
                logger.info("Migration: added column %s.%s", table, col)
            except Exception:
                # Column already exists — safe to ignore
                pass


def _seed_mock_portfolio() -> None:
    """
    Ensure a default mock portfolio exists and is marked active.
    Runs only if no portfolio rows exist at all.
    Idempotent — safe to call on every startup.
    """
    from app.db.database import SessionLocal
    from app.models.portfolio import Portfolio

    db = SessionLocal()
    try:
        count = db.query(Portfolio).count()
        if count == 0:
            mock_p = Portfolio(
                name="Demo Portfolio",
                source="mock",
                is_active=True,
                description="Built-in demo portfolio using mock data",
            )
            db.add(mock_p)
            db.commit()
            logger.info("Seeded default mock portfolio (id=%s)", mock_p.id)
        else:
            # Ensure at least one portfolio is active
            active = db.query(Portfolio).filter(Portfolio.is_active == True).first()
            if active is None:
                latest = db.query(Portfolio).order_by(Portfolio.updated_at.desc()).first()
                if latest:
                    latest.is_active = True
                    db.commit()
                    logger.info("Activated portfolio id=%s as default", latest.id)
    finally:
        db.close()


def _restore_uploaded_portfolio() -> None:
    """
    On startup, if the most recently active uploaded portfolio exists in the DB,
    reload its holdings into FileDataProvider so the 'uploaded' data mode works
    without requiring a re-upload.
    """
    from app.db.database import SessionLocal
    from app.models.portfolio import Portfolio, Holding
    from app.data_providers.file_provider import _restore_from_db_holdings

    db = SessionLocal()
    try:
        # Find the most recent uploaded portfolio that is active
        uploaded = (
            db.query(Portfolio)
            .filter(Portfolio.source == "uploaded")
            .order_by(Portfolio.updated_at.desc())
            .first()
        )
        if uploaded and uploaded.holdings:
            holdings = db.query(Holding).filter(Holding.portfolio_id == uploaded.id).all()
            _restore_from_db_holdings(holdings)
            logger.info(
                "Restored uploaded portfolio '%s' (%d holdings) into FileDataProvider",
                uploaded.name, len(holdings),
            )
    finally:
        db.close()


def init_db() -> None:
    """Create all database tables and run migrations."""
    # 1. Create new tables (idempotent)
    Base.metadata.create_all(bind=engine)
    logger.info("Database tables created/verified")

    # 2. Add new columns to existing tables (idempotent ALTER TABLE)
    _run_column_migrations()

    # 3. Mock portfolio seeding intentionally disabled.
    #    _seed_mock_portfolio() previously created a source="mock" Portfolio row
    #    on fresh installs, which interfered with the data-mode routing logic
    #    (GET /portfolio returned 0 holdings while the portfolio selector showed
    #    a "Demo Portfolio" entry).  The function body is kept for reference.

    # 4. Restore the most-recent uploaded portfolio into memory
    try:
        _restore_uploaded_portfolio()
    except Exception as exc:
        logger.warning("Could not restore uploaded portfolio on startup: %s", exc)

    print("✅ Database initialised")
