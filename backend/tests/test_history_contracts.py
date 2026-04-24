CANONICAL_HISTORY_STATES = {"building", "complete", "failed", "not_started"}
LEGACY_INTERNAL_STATES = {"pending", "done", "unknown"}


def test_history_status_contract_for_new_portfolio(client, seed_uploaded_portfolio):
    portfolio = seed_uploaded_portfolio()

    response = client.get(f"/api/v1/history/{portfolio.id}/status")

    assert response.status_code == 200
    payload = response.json()
    assert payload["portfolio_id"] == portfolio.id
    assert payload["status"] in CANONICAL_HISTORY_STATES
    assert payload["status"] not in LEGACY_INTERNAL_STATES
    assert isinstance(payload["rows"], int)
    assert isinstance(payload["is_building"], bool)
    assert isinstance(payload["has_data"], bool)
    assert "as_of" in payload


def test_history_daily_contract_for_new_portfolio(client, seed_uploaded_portfolio):
    portfolio = seed_uploaded_portfolio()

    response = client.get(f"/api/v1/history/{portfolio.id}/daily")

    assert response.status_code == 200
    payload = response.json()
    assert payload["portfolio_id"] == portfolio.id
    assert payload["state"] in CANONICAL_HISTORY_STATES
    assert payload["state"] not in LEGACY_INTERNAL_STATES
    assert isinstance(payload["points"], list)
    assert isinstance(payload["count"], int)
    assert isinstance(payload["has_data"], bool)
    assert "build_status" in payload
    assert "as_of" in payload
