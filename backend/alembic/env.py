"""Alembic migration environment for P-Insight.

The database URL and the target metadata both come from the application itself,
so migrations always track the real ORM models and the configured database:

  - URL      → app.core.config.settings.DATABASE_URL
  - metadata → app.db.database.Base.metadata (after importing app.models)

Run migrations with:  alembic upgrade head
Autogenerate with:    alembic revision --autogenerate -m "message"
"""

from logging.config import fileConfig

from sqlalchemy import engine_from_config, pool

from alembic import context

# Import the app's Base and register every ORM model on it. Importing the
# app.models package has the side effect of importing each model module, so
# Base.metadata is fully populated before autogenerate compares it to the DB.
from app.core.config import settings
from app.db.database import Base
import app.models  # noqa: F401  (registers portfolio, snapshot, broker_connection, history)

config = context.config

# Single source of truth for the URL — overrides anything in alembic.ini.
config.set_main_option("sqlalchemy.url", settings.DATABASE_URL)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def _is_sqlite() -> bool:
    return settings.DATABASE_URL.startswith("sqlite")


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode (emit SQL without a DBAPI connection)."""
    context.configure(
        url=settings.DATABASE_URL,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        render_as_batch=_is_sqlite(),  # SQLite needs batch mode for ALTER
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode (with a live DBAPI connection)."""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            render_as_batch=_is_sqlite(),
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
