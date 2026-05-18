"""Initial application schema.

Revision ID: 20260502_0001
Revises:
Create Date: 2026-05-02
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260502_0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "portfolios",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("source", sa.String(length=20), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("upload_filename", sa.String(length=255), nullable=True),
        sa.Column("last_synced_at", sa.DateTime(), nullable=True),
        sa.Column("source_metadata", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_portfolios_id"), "portfolios", ["id"], unique=False)

    op.create_table(
        "watchlist",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("ticker", sa.String(length=20), nullable=False),
        sa.Column("name", sa.String(length=150), nullable=True),
        sa.Column("tag", sa.String(length=50), nullable=True),
        sa.Column("sector", sa.String(length=100), nullable=True),
        sa.Column("target_price", sa.Float(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("added_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_watchlist_id"), "watchlist", ["id"], unique=False)
    op.create_index(op.f("ix_watchlist_ticker"), "watchlist", ["ticker"], unique=True)

    op.create_table(
        "background_jobs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("job_type", sa.String(length=80), nullable=False),
        sa.Column("owner_type", sa.String(length=50), nullable=False),
        sa.Column("owner_id", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("stage", sa.String(length=80), nullable=True),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_background_jobs_id"), "background_jobs", ["id"], unique=False)
    op.create_index(
        op.f("ix_background_jobs_job_type"), "background_jobs", ["job_type"], unique=False
    )
    op.create_index(
        op.f("ix_background_jobs_owner_id"), "background_jobs", ["owner_id"], unique=False
    )
    op.create_index(
        op.f("ix_background_jobs_owner_type"), "background_jobs", ["owner_type"], unique=False
    )
    op.create_index(
        op.f("ix_background_jobs_status"), "background_jobs", ["status"], unique=False
    )

    op.create_table(
        "benchmark_history",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("ticker", sa.String(length=20), nullable=False),
        sa.Column("date", sa.String(length=10), nullable=False),
        sa.Column("close_price", sa.Float(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("ticker", "date", name="uq_benchmark_history_date"),
    )
    op.create_index(
        op.f("ix_benchmark_history_id"), "benchmark_history", ["id"], unique=False
    )
    op.create_index(
        op.f("ix_benchmark_history_ticker"), "benchmark_history", ["ticker"], unique=False
    )

    op.create_table(
        "background_job_stages",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("job_id", sa.Integer(), nullable=False),
        sa.Column("stage", sa.String(length=80), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["job_id"], ["background_jobs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_background_job_stages_id"), "background_job_stages", ["id"], unique=False
    )
    op.create_index(
        op.f("ix_background_job_stages_job_id"),
        "background_job_stages",
        ["job_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_background_job_stages_stage"),
        "background_job_stages",
        ["stage"],
        unique=False,
    )
    op.create_index(
        op.f("ix_background_job_stages_status"),
        "background_job_stages",
        ["status"],
        unique=False,
    )

    op.create_table(
        "broker_connections",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("portfolio_id", sa.Integer(), nullable=False),
        sa.Column("broker_name", sa.String(length=50), nullable=False),
        sa.Column("connection_state", sa.String(length=20), nullable=False),
        sa.Column("account_id", sa.String(length=100), nullable=True),
        sa.Column("last_sync_at", sa.DateTime(), nullable=True),
        sa.Column("sync_error", sa.Text(), nullable=True),
        sa.Column("config_json", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["portfolio_id"], ["portfolios.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_broker_connections_id"), "broker_connections", ["id"], unique=False
    )
    op.create_index(
        op.f("ix_broker_connections_portfolio_id"),
        "broker_connections",
        ["portfolio_id"],
        unique=False,
    )

    op.create_table(
        "holdings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("portfolio_id", sa.Integer(), nullable=False),
        sa.Column("ticker", sa.String(length=20), nullable=False),
        sa.Column("name", sa.String(length=150), nullable=False),
        sa.Column("quantity", sa.Float(), nullable=False),
        sa.Column("average_cost", sa.Float(), nullable=False),
        sa.Column("current_price", sa.Float(), nullable=True),
        sa.Column("sector", sa.String(length=100), nullable=True),
        sa.Column("asset_class", sa.String(length=50), nullable=True),
        sa.Column("currency", sa.String(length=10), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("industry", sa.String(length=150), nullable=True),
        sa.Column("purchase_date", sa.String(length=20), nullable=True),
        sa.Column("normalized_ticker", sa.String(length=30), nullable=True),
        sa.Column("sector_status", sa.String(length=20), nullable=True),
        sa.Column("name_status", sa.String(length=20), nullable=True),
        sa.Column("enrichment_reason", sa.Text(), nullable=True),
        sa.Column("enrichment_status", sa.String(length=20), nullable=True),
        sa.Column("fundamentals_status", sa.String(length=20), nullable=True),
        sa.Column("peers_status", sa.String(length=20), nullable=True),
        sa.Column("last_enriched_at", sa.DateTime(), nullable=True),
        sa.Column("failure_reason", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["portfolio_id"], ["portfolios.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_holdings_id"), "holdings", ["id"], unique=False)
    op.create_index(op.f("ix_holdings_ticker"), "holdings", ["ticker"], unique=False)

    op.create_table(
        "portfolio_history",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("portfolio_id", sa.Integer(), nullable=False),
        sa.Column("date", sa.String(length=10), nullable=False),
        sa.Column("total_value", sa.Float(), nullable=False),
        sa.ForeignKeyConstraint(["portfolio_id"], ["portfolios.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("portfolio_id", "date", name="uq_portfolio_history_date"),
    )
    op.create_index(
        op.f("ix_portfolio_history_id"), "portfolio_history", ["id"], unique=False
    )
    op.create_index(
        op.f("ix_portfolio_history_portfolio_id"),
        "portfolio_history",
        ["portfolio_id"],
        unique=False,
    )

    op.create_table(
        "snapshots",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("portfolio_id", sa.Integer(), nullable=False),
        sa.Column("label", sa.String(length=200), nullable=True),
        sa.Column("captured_at", sa.DateTime(), nullable=True),
        sa.Column("total_value", sa.Float(), nullable=True),
        sa.Column("total_cost", sa.Float(), nullable=True),
        sa.Column("total_pnl", sa.Float(), nullable=True),
        sa.Column("total_pnl_pct", sa.Float(), nullable=True),
        sa.Column("num_holdings", sa.Integer(), nullable=True),
        sa.Column("top_sector", sa.String(length=100), nullable=True),
        sa.Column("sector_weights_json", sa.Text(), nullable=True),
        sa.Column("risk_metrics_json", sa.Text(), nullable=True),
        sa.Column("top_holdings_json", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["portfolio_id"], ["portfolios.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_snapshots_captured_at"), "snapshots", ["captured_at"], unique=False)
    op.create_index(op.f("ix_snapshots_id"), "snapshots", ["id"], unique=False)
    op.create_index(
        op.f("ix_snapshots_portfolio_id"), "snapshots", ["portfolio_id"], unique=False
    )

    op.create_table(
        "snapshot_holdings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("snapshot_id", sa.Integer(), nullable=False),
        sa.Column("ticker", sa.String(length=20), nullable=False),
        sa.Column("name", sa.String(length=150), nullable=True),
        sa.Column("quantity", sa.Float(), nullable=True),
        sa.Column("average_cost", sa.Float(), nullable=True),
        sa.Column("market_value", sa.Float(), nullable=True),
        sa.Column("weight_pct", sa.Float(), nullable=True),
        sa.Column("sector", sa.String(length=100), nullable=True),
        sa.ForeignKeyConstraint(["snapshot_id"], ["snapshots.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_snapshot_holdings_id"), "snapshot_holdings", ["id"], unique=False
    )
    op.create_index(
        op.f("ix_snapshot_holdings_snapshot_id"),
        "snapshot_holdings",
        ["snapshot_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_snapshot_holdings_snapshot_id"), table_name="snapshot_holdings")
    op.drop_index(op.f("ix_snapshot_holdings_id"), table_name="snapshot_holdings")
    op.drop_table("snapshot_holdings")
    op.drop_index(op.f("ix_snapshots_portfolio_id"), table_name="snapshots")
    op.drop_index(op.f("ix_snapshots_id"), table_name="snapshots")
    op.drop_index(op.f("ix_snapshots_captured_at"), table_name="snapshots")
    op.drop_table("snapshots")
    op.drop_index(op.f("ix_portfolio_history_portfolio_id"), table_name="portfolio_history")
    op.drop_index(op.f("ix_portfolio_history_id"), table_name="portfolio_history")
    op.drop_table("portfolio_history")
    op.drop_index(op.f("ix_holdings_ticker"), table_name="holdings")
    op.drop_index(op.f("ix_holdings_id"), table_name="holdings")
    op.drop_table("holdings")
    op.drop_index(op.f("ix_broker_connections_portfolio_id"), table_name="broker_connections")
    op.drop_index(op.f("ix_broker_connections_id"), table_name="broker_connections")
    op.drop_table("broker_connections")
    op.drop_index(op.f("ix_background_job_stages_status"), table_name="background_job_stages")
    op.drop_index(op.f("ix_background_job_stages_stage"), table_name="background_job_stages")
    op.drop_index(op.f("ix_background_job_stages_job_id"), table_name="background_job_stages")
    op.drop_index(op.f("ix_background_job_stages_id"), table_name="background_job_stages")
    op.drop_table("background_job_stages")
    op.drop_index(op.f("ix_benchmark_history_ticker"), table_name="benchmark_history")
    op.drop_index(op.f("ix_benchmark_history_id"), table_name="benchmark_history")
    op.drop_table("benchmark_history")
    op.drop_index(op.f("ix_background_jobs_status"), table_name="background_jobs")
    op.drop_index(op.f("ix_background_jobs_owner_type"), table_name="background_jobs")
    op.drop_index(op.f("ix_background_jobs_owner_id"), table_name="background_jobs")
    op.drop_index(op.f("ix_background_jobs_job_type"), table_name="background_jobs")
    op.drop_index(op.f("ix_background_jobs_id"), table_name="background_jobs")
    op.drop_table("background_jobs")
    op.drop_index(op.f("ix_watchlist_ticker"), table_name="watchlist")
    op.drop_index(op.f("ix_watchlist_id"), table_name="watchlist")
    op.drop_table("watchlist")
    op.drop_index(op.f("ix_portfolios_id"), table_name="portfolios")
    op.drop_table("portfolios")
