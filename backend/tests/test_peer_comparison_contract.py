from typing import Optional

import pytest

from app.core.dependencies import get_data_provider
from app.data_providers.base import BaseDataProvider
from app.data_providers.file_provider import FileDataProvider
from app.main import app


class PeerContractProvider(BaseDataProvider):
    @property
    def mode_name(self) -> str:
        return "uploaded"

    @property
    def is_available(self) -> bool:
        return True

    async def get_holdings(self):
        return []

    async def get_price_history(
        self,
        ticker: str,
        period: str = "1y",
        interval: str = "1d",
    ) -> dict:
        return {"ticker": ticker, "period": period, "interval": interval, "data": [], "source": "test"}

    async def get_fundamentals(self, ticker: str) -> dict:
        if ticker == "UNKNOWN.NS":
            return {"ticker": ticker, "source": "unavailable", "error": "no fundamentals"}
        if ticker == "BADPEER.NS":
            return {"ticker": ticker, "source": "unavailable", "error": "peer unavailable"}
        return {
            "ticker": ticker,
            "name": ticker,
            "sector": "Information Technology",
            "industry": "IT Services",
            "pe_ratio": 20.0 if ticker == "TCS.NS" else 25.0,
            "pb_ratio": 4.0,
            "market_cap": 100.0,
            "roe": 30.0,
            "source": "yfinance",
        }

    async def get_news(
        self,
        tickers: list[str],
        event_type: Optional[str] = None,
    ) -> list[dict]:
        return []

    async def get_peers(self, ticker: str) -> list[str]:
        discovery = await self.get_peer_discovery(ticker)
        return discovery["tickers"]

    async def get_peer_discovery(self, ticker: str) -> dict:
        if ticker == "UNKNOWN.NS":
            return {
                "tickers": [],
                "peer_source": "none",
                "peer_source_label": "No peer universe found",
                "peer_discovery_status": "not_found",
                "peer_discovery_reason": "No test peers.",
                "peer_universe_static": False,
            }
        if ticker == "PARTIAL.NS":
            return {
                "tickers": ["INFY.NS", "BADPEER.NS"],
                "peer_source": "static_curated_map",
                "peer_source_label": "Static curated peer map",
                "peer_discovery_status": "found",
                "peer_discovery_reason": "Ticker matched the curated peer map.",
                "peer_universe_static": True,
            }
        return {
            "tickers": ["INFY.NS", "WIPRO.NS"],
            "peer_source": "static_curated_map",
            "peer_source_label": "Static curated peer map",
            "peer_discovery_status": "found",
            "peer_discovery_reason": "Ticker matched the curated peer map.",
            "peer_universe_static": True,
        }


class LegacyPeerProvider(PeerContractProvider):
    async def get_peers(self, ticker: str) -> list[str]:
        return ["INFY.NS"]

    get_peer_discovery = None


def test_peer_comparison_response_exposes_peer_discovery_metadata(client):
    app.dependency_overrides[get_data_provider] = lambda: PeerContractProvider()
    try:
        response = client.get("/api/v1/peers/TCS.NS?mode=uploaded")
    finally:
        app.dependency_overrides.pop(get_data_provider, None)

    assert response.status_code == 200
    payload = response.json()
    meta = payload["meta"]

    assert payload["peer_source"] == "static_curated_map"
    assert payload["provider_mode"] == "uploaded"
    assert payload["data_source"] == "yfinance"
    assert meta["peer_source"] == "static_curated_map"
    assert meta["peer_source_label"] == "Static curated peer map"
    assert meta["peer_discovery_status"] == "found"
    assert meta["peer_universe_static"] is True
    assert meta["selected_fundamentals_available"] is True
    assert meta["peer_count_requested"] == 2
    assert meta["peer_count_available"] == 2
    assert payload["selected"]["market_cap"] == 1_000_000_000


def test_peer_comparison_reports_partial_peer_fundamentals_failure(client):
    app.dependency_overrides[get_data_provider] = lambda: PeerContractProvider()
    try:
        response = client.get("/api/v1/peers/PARTIAL.NS?mode=uploaded")
    finally:
        app.dependency_overrides.pop(get_data_provider, None)

    assert response.status_code == 200
    payload = response.json()
    meta = payload["meta"]

    assert meta["incomplete"] is True
    assert meta["sparse_set"] is True
    assert meta["unavailable_peers"] == ["BADPEER.NS"]
    assert meta["peer_count_requested"] == 2
    assert meta["peer_count_available"] == 1
    assert payload["peers"][1]["source"] == "unavailable"
    assert payload["peers"][1]["error"] == "peer unavailable"


def test_peer_comparison_marks_missing_selected_fundamentals(client):
    app.dependency_overrides[get_data_provider] = lambda: PeerContractProvider()
    try:
        response = client.get("/api/v1/peers/UNKNOWN.NS?mode=uploaded")
    finally:
        app.dependency_overrides.pop(get_data_provider, None)

    assert response.status_code == 200
    payload = response.json()
    meta = payload["meta"]

    assert payload["peer_source"] == "none"
    assert meta["peer_discovery_status"] == "not_found"
    assert meta["selected_fundamentals_available"] is False
    assert meta["selected_fundamentals_error"] == "no fundamentals"
    assert meta["sparse_set"] is True


def test_peer_comparison_supports_legacy_get_peers_only_provider(client):
    app.dependency_overrides[get_data_provider] = lambda: LegacyPeerProvider()
    try:
        response = client.get("/api/v1/peers/TCS.NS?mode=uploaded")
    finally:
        app.dependency_overrides.pop(get_data_provider, None)

    assert response.status_code == 200
    payload = response.json()
    meta = payload["meta"]

    assert payload["peer_source"] == "unknown"
    assert meta["peer_source"] == "unknown"
    assert meta["peer_discovery_status"] == "unknown"
    assert meta["peer_count_requested"] == 1
    assert meta["peer_count_available"] == 1


@pytest.mark.asyncio
async def test_uploaded_peer_discovery_labels_static_map_without_fetching_fundamentals():
    discovery = await FileDataProvider().get_peer_discovery("TCS")

    assert discovery["peer_source"] == "static_curated_map"
    assert discovery["peer_discovery_status"] == "found"
    assert discovery["peer_universe_static"] is True
    assert "INFY.NS" in discovery["tickers"]
