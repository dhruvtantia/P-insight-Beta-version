def test_portfolio_full_empty_uploaded_contract(client):
    response = client.get("/api/v1/portfolio/full?mode=uploaded")

    assert response.status_code == 200
    payload = response.json()
    assert payload["holdings"] == []
    assert payload["sectors"] == []
    assert payload["risk_snapshot"] is None
    assert payload["summary"]["num_holdings"] == 0
    assert payload["summary"]["data_source"] == "uploaded"
    assert payload["meta"]["mode"] == "uploaded"
    assert payload["meta"]["lifecycle_state"] == "empty"


def test_portfolio_full_seeded_uploaded_contract(client, seed_uploaded_portfolio):
    portfolio = seed_uploaded_portfolio()

    response = client.get("/api/v1/portfolio/full?mode=uploaded")

    assert response.status_code == 200
    payload = response.json()
    assert len(payload["holdings"]) == 2
    assert payload["summary"]["num_holdings"] == 2
    assert payload["summary"]["total_value"] > 0
    assert payload["sectors"]
    assert payload["risk_snapshot"] is not None
    assert payload["fundamentals_summary"]["total_holdings"] == 2
    assert payload["meta"]["portfolio_id"] == portfolio.id
    assert payload["meta"]["portfolio_name"] == portfolio.name
    assert payload["meta"]["lifecycle_state"] in {"empty", "enriching", "degraded", "ready"}

    first_holding = payload["holdings"][0]
    for key in ("market_value", "pnl", "pnl_pct", "weight"):
        assert key in first_holding
    assert first_holding["price_status"] in {"live", "uploaded_current_price"}
    assert "price_coverage" in payload["meta"]


def test_portfolio_full_marks_missing_price_as_partial_fallback(client):
    from app.db.database import SessionLocal
    from app.models.portfolio import Holding, Portfolio

    db = SessionLocal()
    try:
        portfolio = Portfolio(
            name="Missing Price Portfolio",
            source="uploaded",
            is_active=True,
            upload_filename="missing-price.csv",
        )
        db.add(portfolio)
        db.flush()
        db.add(
            Holding(
                portfolio_id=portfolio.id,
                ticker="BADTICKER",
                name="Bad Ticker",
                quantity=3,
                average_cost=100,
                current_price=None,
                price_status="missing",
                price_source="yfinance",
                price_failure_reason="yfinance returned no price",
                sector="Unknown",
                asset_class="Equity",
                currency="INR",
                enrichment_status="partial",
                fundamentals_status="unavailable",
                peers_status="none",
            )
        )
        db.commit()
    finally:
        db.close()

    response = client.get("/api/v1/portfolio/full?mode=uploaded")

    assert response.status_code == 200
    payload = response.json()
    holding = payload["holdings"][0]
    assert holding["current_price"] is None
    assert holding["price_status"] == "missing"
    assert holding["market_value"] == 300
    assert holding["market_value_uses_fallback"] is True
    assert holding["pnl"] is None
    assert payload["meta"]["partial_data"] is True
    assert payload["meta"]["lifecycle_state"] == "degraded"
    assert payload["meta"]["price_coverage"]["missing"] == 1


def test_portfolio_full_marks_old_provider_price_stale_and_falls_back(client):
    from datetime import datetime, timedelta, timezone

    from app.db.database import SessionLocal
    from app.models.portfolio import Holding, Portfolio

    db = SessionLocal()
    try:
        portfolio = Portfolio(
            name="Stale Price Portfolio",
            source="uploaded",
            is_active=True,
            upload_filename="stale-price.csv",
        )
        db.add(portfolio)
        db.flush()
        db.add(
            Holding(
                portfolio_id=portfolio.id,
                ticker="OLDPRICE",
                name="Old Price",
                quantity=2,
                average_cost=100,
                current_price=130,
                price_status="live",
                price_source="yfinance",
                price_timestamp=datetime.now(timezone.utc) - timedelta(days=10),
                sector="Unknown",
                asset_class="Equity",
                currency="INR",
                enrichment_status="enriched",
                fundamentals_status="fetched",
                peers_status="found",
            )
        )
        db.commit()
    finally:
        db.close()

    response = client.get("/api/v1/portfolio/full?mode=uploaded")

    assert response.status_code == 200
    payload = response.json()
    holding = payload["holdings"][0]
    assert holding["current_price"] == 130
    assert holding["price_status"] == "stale"
    assert holding["market_value"] == 200
    assert holding["market_value_uses_fallback"] is True
    assert holding["pnl"] is None
    assert payload["meta"]["price_coverage"]["stale"] == 1
    assert payload["meta"]["lifecycle_state"] == "degraded"
