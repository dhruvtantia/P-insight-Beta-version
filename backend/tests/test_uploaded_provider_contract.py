import pytest
from fastapi import BackgroundTasks
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.database import Base
from app.schemas.portfolio import HoldingBase

# Register ORM models before create_all.
from app.models import broker_connection, history, portfolio as portfolio_model, snapshot  # noqa: F401
from app.data_providers.uploaded_provider import UploadedPortfolioProvider
from app.services.portfolio_manager import PortfolioManagerService
from app.services.portfolio_service import PortfolioService
from app.services.post_upload_workflow import PostUploadWorkflow, UploadCompleted


@pytest.fixture()
def db_session():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
    )
    Base.metadata.create_all(bind=engine)
    TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = TestingSession()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)


def _sample_holdings() -> list[HoldingBase]:
    return [
        HoldingBase(
            ticker="TCS",
            name="Tata Consultancy Services",
            quantity=2,
            average_cost=3500,
            current_price=3800,
            sector="Information Technology",
        ),
        HoldingBase(
            ticker="INFY",
            name="Infosys",
            quantity=3,
            average_cost=1400,
            current_price=1500,
            sector="Information Technology",
        ),
    ]


@pytest.mark.asyncio
async def test_uploaded_provider_requires_db_session():
    provider = UploadedPortfolioProvider()

    with pytest.raises(RuntimeError, match="requires a database session"):
        await provider.get_holdings()


@pytest.mark.asyncio
async def test_uploaded_provider_reads_active_portfolio_from_db_without_memory_cache(db_session):
    import app.data_providers.file_provider as file_provider

    file_provider._uploaded_holdings = []
    portfolio = PortfolioManagerService(db_session).save_uploaded_portfolio(
        _sample_holdings(),
        filename="holdings.csv",
    )

    holdings = await UploadedPortfolioProvider(db_session).get_holdings()

    assert portfolio.is_active is True
    assert file_provider._uploaded_holdings == []
    assert [holding.ticker for holding in holdings] == ["TCS", "INFY"]
    assert all(holding.data_source == "uploaded" for holding in holdings)


@pytest.mark.asyncio
async def test_portfolio_full_uses_db_backed_uploaded_provider(db_session):
    PortfolioManagerService(db_session).save_uploaded_portfolio(
        _sample_holdings(),
        filename="holdings.csv",
    )

    service = PortfolioService(db_session, UploadedPortfolioProvider(db_session))
    bundle = await service.get_full()

    assert bundle["summary"].num_holdings == 2
    assert bundle["summary"].total_value == 12100
    assert bundle["meta"].mode == "uploaded"
    assert bundle["meta"].portfolio_id is not None
    assert len(bundle["holdings"]) == 2


@pytest.mark.asyncio
async def test_uploaded_provider_can_read_specific_portfolio_without_active_cache(db_session):
    import app.data_providers.file_provider as file_provider

    first = PortfolioManagerService(db_session).save_uploaded_portfolio(
        _sample_holdings(),
        filename="first.csv",
    )
    PortfolioManagerService(db_session).save_uploaded_portfolio(
        [
            HoldingBase(
                ticker="HDFCBANK",
                name="HDFC Bank",
                quantity=1,
                average_cost=1500,
                current_price=1600,
            )
        ],
        filename="second.csv",
    )
    file_provider._uploaded_holdings = []

    holdings = await UploadedPortfolioProvider(db_session, portfolio_id=first.id).get_holdings()

    assert file_provider._uploaded_holdings == []
    assert [holding.ticker for holding in holdings] == ["TCS", "INFY"]


def test_post_upload_workflow_leaves_memory_cache_untouched(tmp_path):
    import app.data_providers.file_provider as file_provider

    async def noop_enrichment(*_args, **_kwargs):
        return None

    file_provider._uploaded_holdings = []
    tasks = BackgroundTasks()
    workflow = PostUploadWorkflow(
        background_tasks=tasks,
        db_factory=lambda: None,
        uploads_path=tmp_path,
        enrichment_task=noop_enrichment,
    )

    workflow.run(UploadCompleted(
        portfolio_id=1,
        holdings=_sample_holdings(),
        filename="holdings.csv",
    ))

    assert (tmp_path / "portfolio_uploaded.csv").exists()
    assert len(tasks.tasks) == 1
    assert file_provider._uploaded_holdings == []


def test_post_upload_workflow_logs_schedule_failure_without_breaking_upload_side_effects(tmp_path):
    class FailingBackgroundTasks:
        def add_task(self, *_args, **_kwargs):
            raise RuntimeError("background scheduler unavailable")

    workflow = PostUploadWorkflow(
        background_tasks=FailingBackgroundTasks(),
        db_factory=lambda: None,
        uploads_path=tmp_path,
        enrichment_task=lambda *_args, **_kwargs: None,
    )

    workflow.run(UploadCompleted(
        portfolio_id=1,
        holdings=_sample_holdings(),
        filename="holdings.csv",
    ))

    assert (tmp_path / "portfolio_uploaded.csv").exists()


def test_snapshot_capture_uses_explicit_cost_basis_fallback_for_untrusted_prices(db_session):
    from app.models.portfolio import Holding, Portfolio
    from app.services.snapshot_service import SnapshotService

    portfolio = Portfolio(name="Snapshot Fallback", source="uploaded", is_active=True)
    db_session.add(portfolio)
    db_session.flush()
    db_session.add_all(
        [
            Holding(
                portfolio_id=portfolio.id,
                ticker="TRUSTED",
                name="Trusted",
                quantity=1,
                average_cost=100,
                current_price=150,
                price_status="live",
                price_source="yfinance",
            ),
            Holding(
                portfolio_id=portfolio.id,
                ticker="FAILED",
                name="Failed",
                quantity=1,
                average_cost=100,
                current_price=999,
                price_status="provider_failed",
                price_source="yfinance",
            ),
        ]
    )
    db_session.commit()

    snapshot = SnapshotService(db_session).capture(portfolio.id, label="Fallback Test")
    by_ticker = {row.ticker: row for row in snapshot.holdings}

    assert by_ticker["TRUSTED"].market_value == 150
    assert by_ticker["FAILED"].market_value == 100
    assert by_ticker["TRUSTED"].weight_pct == 60
    assert by_ticker["FAILED"].weight_pct == 40


@pytest.mark.asyncio
async def test_optimizer_weights_exclude_untrusted_current_prices():
    from app.optimization.optimizer_service import OptimizerService

    class Provider:
        mode_name = "optimizer-untrusted-test"

        async def get_holdings(self):
            return [
                HoldingBase(
                    ticker="TRUSTED",
                    name="Trusted",
                    quantity=1,
                    average_cost=100,
                    current_price=150,
                    price_status="live",
                    price_source="yfinance",
                ),
                HoldingBase(
                    ticker="FAILED",
                    name="Failed",
                    quantity=1,
                    average_cost=100,
                    current_price=999,
                    price_status="provider_failed",
                    price_source="yfinance",
                ),
            ]

        async def get_price_history(self, ticker, period="1y", interval="1d"):
            closes = (
                [100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111]
                if ticker == "TRUSTED"
                else [100, 99, 98, 97, 96, 95, 94, 93, 92, 91, 90, 89]
            )
            return {
                "source": "yfinance",
                "data": [
                    {"date": f"2026-01-{day:02d}", "close": close}
                    for day, close in enumerate(closes, start=1)
                ],
            }

    result = await OptimizerService(Provider()).compute(n_frontier_points=5)

    assert result["meta"]["error"] is None
    assert result["current"]["weights"]["TRUSTED"] == 1
    assert result["current"]["weights"]["FAILED"] == 0
