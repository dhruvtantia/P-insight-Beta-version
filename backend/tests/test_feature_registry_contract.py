from fastapi import HTTPException
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.v1.router import api_router
from app.core.config import settings
from app.services.feature_registry import get_feature_registry, require_feature


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
    }

    assert expected.issubset(by_id)
    assert by_id["portfolio_core"].status == "enabled"
    assert by_id["portfolio_core"].route_prefix == "/api/v1/portfolio"
    assert by_id["upload_import"].side_effects
    assert by_id["risk_quant"].frontend_owner_hook == "useQuantAnalytics"


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
