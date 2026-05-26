import sys
import types

from app.api.v1.endpoints import market as market_endpoint
from app.core.config import settings


def test_market_overview_route_returns_expected_contract(client, monkeypatch):
    monkeypatch.setattr(market_endpoint, "_from_cache", lambda _key: None)
    monkeypatch.setattr(market_endpoint, "_to_cache", lambda _key, _data: None)

    dummy_yfinance = types.ModuleType("yfinance")
    monkeypatch.setitem(sys.modules, "yfinance", dummy_yfinance)

    def fake_fetch_single_index(sym: str, name: str) -> dict:
        return {
            "symbol": sym,
            "name": name,
            "status": "last_close",
            "unavailable": False,
            "value": 100.0,
            "change": 1.5,
            "change_pct": 1.52,
            "data_date": "2026-05-26",
            "last_updated": "2026-05-26T10:00:00+00:00",
            "source": "yfinance",
        }

    monkeypatch.setattr(market_endpoint, "_fetch_single_index", fake_fetch_single_index)
    monkeypatch.setattr(
        market_endpoint,
        "_fetch_gainers_losers",
        lambda: (
            [{"ticker": "TCS", "symbol": "TCS.NS", "price": 100.0, "change_pct": 1.0}],
            [{"ticker": "INFY", "symbol": "INFY.NS", "price": 90.0, "change_pct": -1.0}],
            {"status": "ok", "reason": None, "source": "yfinance"},
        ),
    )

    response = client.get("/api/v1/market/overview")

    assert response.status_code == 200
    payload = response.json()

    assert set(payload) == {
        "available",
        "market_status",
        "main_indices",
        "sector_indices",
        "top_gainers",
        "top_losers",
        "movers_status",
        "fetched_at",
        "source",
    }
    assert payload["source"] == "yfinance"
    assert isinstance(payload["main_indices"], list)
    assert isinstance(payload["sector_indices"], list)
    assert isinstance(payload["top_gainers"], list)
    assert isinstance(payload["top_losers"], list)
    assert payload["movers_status"]["status"] == "ok"
    assert "headlines" not in payload

    status = payload["market_status"]
    assert set(status).issuperset({"open", "note", "checked_at_ist"})


def test_market_overview_degraded_contract_when_yfinance_missing(monkeypatch):
    monkeypatch.delitem(sys.modules, "yfinance", raising=False)

    real_import = __import__

    def fake_import(name, globals=None, locals=None, fromlist=(), level=0):
        if name == "yfinance":
            raise ImportError("yfinance missing for contract test")
        return real_import(name, globals, locals, fromlist, level)

    monkeypatch.setattr("builtins.__import__", fake_import)

    payload = market_endpoint._fetch_overview()

    assert payload["available"] is False
    assert payload["source"] == "none"
    assert payload["main_indices"] == []
    assert payload["sector_indices"] == []
    assert payload["top_gainers"] == []
    assert payload["top_losers"] == []
    assert payload["movers_status"]["status"] == "unavailable"
    assert payload["movers_status"]["reason"] == "yfinance_not_installed"
    assert "headlines" not in payload

    status = payload["market_status"]
    assert status["open"] is False
    assert isinstance(status["note"], str) and status["note"]
    assert isinstance(status["checked_at_ist"], str) and status["checked_at_ist"]
    assert status["reason"] == "yfinance_not_installed"


def test_market_overview_route_blocked_when_feature_disabled(client, monkeypatch):
    monkeypatch.setattr(settings, "FEATURE_MARKET_DATA", False)

    response = client.get("/api/v1/market/overview")

    assert response.status_code == 503
    detail = response.json()["detail"]
    assert detail["feature_id"] == "market_data"
    assert detail["route_prefix"] == "/api/v1/market"


def test_market_overview_mover_failure_includes_reason(monkeypatch):
    monkeypatch.setattr(market_endpoint, "_from_cache", lambda _key: None)
    monkeypatch.setattr(market_endpoint, "_to_cache", lambda _key, _data: None)

    def fake_fetch_single_index(sym: str, name: str) -> dict:
        return {
            "symbol": sym,
            "name": name,
            "status": "last_close",
            "unavailable": False,
            "value": 100.0,
            "change": 1.5,
            "change_pct": 1.52,
            "data_date": "2026-05-26",
            "last_updated": "2026-05-26T10:00:00+00:00",
            "source": "yfinance",
        }

    monkeypatch.setitem(sys.modules, "yfinance", types.ModuleType("yfinance"))
    monkeypatch.setattr(market_endpoint, "_fetch_single_index", fake_fetch_single_index)
    monkeypatch.setattr(
        market_endpoint,
        "_fetch_gainers_losers",
        lambda: ([], [], {"status": "unavailable", "reason": "no_data_returned", "source": "yfinance"}),
    )

    payload = market_endpoint._fetch_overview()

    assert payload["top_gainers"] == []
    assert payload["top_losers"] == []
    assert payload["movers_status"] == {
        "status": "unavailable",
        "reason": "no_data_returned",
        "source": "yfinance",
    }
