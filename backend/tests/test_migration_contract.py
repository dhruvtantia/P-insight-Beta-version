from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parents[1]


def test_alembic_migration_boundary_exists():
    assert (BACKEND_ROOT / "alembic.ini").exists()
    assert (BACKEND_ROOT / "alembic" / "env.py").exists()
    assert (BACKEND_ROOT / "alembic" / "script.py.mako").exists()


def test_initial_migration_covers_current_core_tables():
    migration = (
        BACKEND_ROOT
        / "alembic"
        / "versions"
        / "20260502_0001_initial_schema.py"
    )
    contents = migration.read_text()

    expected_tables = {
        "portfolios",
        "holdings",
        "watchlist",
        "snapshots",
        "snapshot_holdings",
        "portfolio_history",
        "benchmark_history",
        "broker_connections",
        "background_jobs",
        "background_job_stages",
    }

    for table in expected_tables:
        assert f'"{table}"' in contents
