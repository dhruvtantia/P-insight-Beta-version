from app.db.database import SessionLocal
from app.models.portfolio import Holding
from app.services.ai_advisor_service import AIAdvisorService
from app.services.snapshot_service import SnapshotService


def test_advisor_context_consumes_portfolio_and_snapshot_read_boundaries(seed_uploaded_portfolio):
    portfolio = seed_uploaded_portfolio()
    db = SessionLocal()

    try:
        snapshot_service = SnapshotService(db)
        snapshot_service.capture(portfolio.id, label="Before")

        holding = (
            db.query(Holding)
            .filter(Holding.portfolio_id == portfolio.id, Holding.ticker == "TCS")
            .first()
        )
        holding.quantity += 1
        db.commit()

        snapshot_service.capture(portfolio.id, label="After")

        advisor = AIAdvisorService(db)
        payload = advisor.build_context_payload(portfolio.id)

        assert advisor._resolve_portfolio_id(None) == portfolio.id
        assert payload.portfolio_id == portfolio.id
        assert payload.snapshot_count == 2
        assert payload.recent_changes is not None
        assert payload.recent_changes.increased_count == 1
    finally:
        db.close()
