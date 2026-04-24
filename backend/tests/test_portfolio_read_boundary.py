from app.db.database import SessionLocal
from app.services.context_builder import PortfolioContextBuilder


def test_context_builder_reuses_portfolio_read_metrics(client, seed_uploaded_portfolio):
    portfolio = seed_uploaded_portfolio()
    bundle = client.get("/api/v1/portfolio/full?mode=uploaded").json()

    db = SessionLocal()
    try:
        context = PortfolioContextBuilder(db).build(portfolio.id)
    finally:
        db.close()

    assert context.total_value == bundle["summary"]["total_value"]
    assert context.total_cost == bundle["summary"]["total_cost"]
    assert context.total_pnl == bundle["summary"]["total_pnl"]
    assert context.num_holdings == bundle["summary"]["num_holdings"]
    assert context.num_sectors == bundle["risk_snapshot"]["num_sectors"]
    assert context.risk_profile == bundle["risk_snapshot"]["risk_profile"]
    assert context.max_holding_weight == bundle["risk_snapshot"]["max_holding_weight"]
