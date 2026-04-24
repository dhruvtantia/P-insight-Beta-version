import os
import tempfile
import uuid
from collections.abc import Generator

# Configure the test database before importing the FastAPI app or DB engine.
_DB_PATH = os.path.join(tempfile.gettempdir(), f"p_insight_test_{uuid.uuid4().hex}.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_DB_PATH}"
os.environ.setdefault("DOCS_ENABLED", "false")
os.environ.setdefault("DEFAULT_DATA_MODE", "uploaded")

import pytest
from fastapi.testclient import TestClient

from app.db.database import Base, SessionLocal, engine
from app.main import app
from app.models.portfolio import Holding, Portfolio


@pytest.fixture(autouse=True)
def reset_database() -> Generator[None, None, None]:
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

    import app.data_providers.file_provider as file_provider

    file_provider._uploaded_holdings = []
    yield
    file_provider._uploaded_holdings = []
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def client() -> Generator[TestClient, None, None]:
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def seed_uploaded_portfolio():
    def _seed() -> Portfolio:
        db = SessionLocal()
        try:
            portfolio = Portfolio(
                name="Contract Test Portfolio",
                source="uploaded",
                is_active=True,
                upload_filename="contract-test.csv",
            )
            db.add(portfolio)
            db.flush()

            db.add_all(
                [
                    Holding(
                        portfolio_id=portfolio.id,
                        ticker="TCS",
                        name="Tata Consultancy Services",
                        quantity=10,
                        average_cost=1000,
                        current_price=1100,
                        sector="Information Technology",
                        asset_class="Equity",
                        currency="INR",
                        enrichment_status="enriched",
                        fundamentals_status="fetched",
                        peers_status="found",
                    ),
                    Holding(
                        portfolio_id=portfolio.id,
                        ticker="INFY",
                        name="Infosys",
                        quantity=5,
                        average_cost=1500,
                        current_price=1450,
                        sector="Information Technology",
                        asset_class="Equity",
                        currency="INR",
                        enrichment_status="partial",
                        fundamentals_status="unavailable",
                        peers_status="pending",
                    ),
                ]
            )
            db.commit()
            db.refresh(portfolio)

            holdings = db.query(Holding).filter(Holding.portfolio_id == portfolio.id).all()
            from app.data_providers.file_provider import _restore_from_db_holdings

            _restore_from_db_holdings(holdings)
            return portfolio
        finally:
            db.close()

    return _seed
