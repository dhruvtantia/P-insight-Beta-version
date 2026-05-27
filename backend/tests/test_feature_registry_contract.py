from fastapi import HTTPException
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.v1.router import api_router
from app.core.config import settings
from app.services.feature_registry import get_feature_registry, require_feature


def _assert_typed_boundary(response, feature_id: str):
    assert response.status_code == 503
    detail = response.json()["detail"]
    assert detail["feature_id"] == feature_id
    assert detail["status"] == "disabled"
    assert isinstance(detail["route_prefix"], str)
    assert isinstance(detail["dependencies"], list)
    assert isinstance(detail["failure_behavior"], str)
    assert isinstance(detail["disable_behavior"], str)
    return detail


def test_feature_registry_exposes_expected_contracts():
    registry = get_feature_registry()
    by_id = {feature.feature_id: feature for feature in registry.features}

    expected = {
        "portfolio_core",
        "upload_import",
        "watchlist",
        "risk_quant",
        "fundamentals",
        "history",
        "market_data",
        "news",
        "advisor",
        "broker_sync",
        "ai_chat",
        "screener",
        "legacy_frontier",
    }

    assert expected.issubset(by_id)
    assert by_id["portfolio_core"].status == "enabled"
    assert by_id["portfolio_core"].route_prefix == "/api/v1/portfolio"
    assert by_id["upload_import"].side_effects
    assert by_id["risk_quant"].frontend_owner_hook == "useQuantAnalytics"
    assert by_id["broker_sync"].status == "disabled"
    assert by_id["ai_chat"].status == "disabled"
    assert by_id["screener"].status == "disabled"
    assert by_id["legacy_frontier"].status == "disabled"


def test_disabled_feature_returns_typed_boundary(monkeypatch):
    monkeypatch.setattr(settings, "FEATURE_QUANT", False)

    feature = next(
        item for item in get_feature_registry().features
        if item.feature_id == "risk_quant"
    )
    assert feature.status == "disabled"

    try:
        require_feature("risk_quant")
    except HTTPException as exc:
        assert exc.status_code == 503
        assert exc.detail["feature_id"] == "risk_quant"
        assert exc.detail["status"] == "disabled"
        assert exc.detail["route_prefix"] == "/api/v1/quant"
        assert isinstance(exc.detail["dependencies"], list)
        assert "failure_behavior" in exc.detail
        assert "disable_behavior" in exc.detail
    else:
        raise AssertionError("Expected disabled feature to raise HTTPException")


def test_system_features_endpoint_contract():
    app = FastAPI()
    app.include_router(api_router)
    client = TestClient(app)

    response = client.get("/api/v1/system/features")

    assert response.status_code == 200
    payload = response.json()
    assert "features" in payload
    assert any(
        feature["feature_id"] == "portfolio_core"
        for feature in payload["features"]
    )


def test_disabled_portfolio_core_blocks_portfolio_routes(client, monkeypatch):
    monkeypatch.setattr(settings, "FEATURE_PORTFOLIO_CORE", False)

    read_response = client.get("/api/v1/portfolio/full?mode=uploaded")
    _assert_typed_boundary(read_response, "portfolio_core")

    management_response = client.get("/api/v1/portfolios/")
    _assert_typed_boundary(management_response, "portfolio_core")


def test_disabled_fundamentals_blocks_peer_comparison(client, monkeypatch):
    monkeypatch.setattr(settings, "FEATURE_FUNDAMENTALS", False)

    response = client.get("/api/v1/peers/TCS.NS?mode=uploaded")

    detail = _assert_typed_boundary(response, "fundamentals")
    assert detail["route_prefix"] == "/api/v1/analytics/ratios"


def test_disabled_history_blocks_snapshot_routes(client, monkeypatch):
    monkeypatch.setattr(settings, "FEATURE_HISTORY", False)

    response = client.get("/api/v1/portfolios/1/snapshots")

    _assert_typed_boundary(response, "history")


def test_disabled_scaffold_surfaces_block_backend_routes(client):
    ai_response = client.post(
        "/api/v1/ai-chat/",
        json={"message": "What changed?", "portfolio_context": {}},
    )
    _assert_typed_boundary(ai_response, "ai_chat")

    frontier_response = client.get("/api/v1/frontier/?mode=uploaded")
    _assert_typed_boundary(frontier_response, "legacy_frontier")
