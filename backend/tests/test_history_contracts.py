CANONICAL_HISTORY_STATES = {"building", "complete", "failed", "not_started"}
LEGACY_INTERNAL_STATES = {"pending", "done", "unknown"}


def test_history_status_mapping_does_not_leak_internal_states():
    from app.api.v1.endpoints.history import (
        _resolve_canonical_daily_state,
        _resolve_canonical_history_status,
    )

    assert _resolve_canonical_history_status("pending", 0) == "building"
    assert _resolve_canonical_history_status("building", 0) == "building"
    assert _resolve_canonical_history_status("done", 0) == "complete"
    assert _resolve_canonical_history_status("failed", 0) == "failed"
    assert _resolve_canonical_history_status("unknown", 3) == "complete"
    assert _resolve_canonical_history_status("unknown", 0) == "not_started"

    assert _resolve_canonical_daily_state("pending", False) == "building"
    assert _resolve_canonical_daily_state("building", False) == "building"
    assert _resolve_canonical_daily_state("done", False) == "failed"
    assert _resolve_canonical_daily_state("unknown", False) == "not_started"
    assert _resolve_canonical_daily_state("failed", True) == "complete"


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
    assert payload["build_status"] in CANONICAL_HISTORY_STATES
    assert payload["build_status"] not in LEGACY_INTERNAL_STATES
    assert isinstance(payload["points"], list)
    assert isinstance(payload["count"], int)
    assert isinstance(payload["has_data"], bool)
    assert "build_status" in payload
    assert "as_of" in payload
