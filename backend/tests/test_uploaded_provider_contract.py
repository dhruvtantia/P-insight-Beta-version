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
