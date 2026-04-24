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
