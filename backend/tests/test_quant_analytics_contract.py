import math
from datetime import date, timedelta

import pandas as pd
import pytest

from app.analytics import quant_service
from app.analytics import risk as risk_utils
from app.analytics.quant_service import QuantAnalyticsService
from app.data_providers.base import BaseDataProvider
from app.schemas.portfolio import HoldingBase


def _history(start: float, daily_step: float, days: int = 45) -> list[dict]:
    base = date(2025, 1, 1)
    rows = []
    price = start
    for i in range(days):
        price += daily_step
        rows.append({"date": (base + timedelta(days=i)).isoformat(), "close": round(price, 4)})
    return rows


class FakeQuantProvider(BaseDataProvider):
    def __init__(self, holdings: list[HoldingBase], histories: dict[str, list[dict]], mode: str = "uploaded"):
        self._holdings = holdings
        self._histories = histories
        self._mode = mode
        self.fetch_count = 0

    @property
    def mode_name(self) -> str:
        return self._mode

    @property
    def is_available(self) -> bool:
        return True

    async def get_holdings(self) -> list[HoldingBase]:
        return self._holdings

    async def get_price_history(self, ticker: str, period: str = "1y", interval: str = "1d") -> dict:
        self.fetch_count += 1
        data = self._histories.get(ticker, [])
        return {
            "ticker": ticker,
            "period": period,
            "interval": interval,
            "data": data,
            "source": "test" if data else "unavailable",
        }

    async def get_fundamentals(self, ticker: str) -> dict:
        return {"ticker": ticker, "source": "test"}

    async def get_news(self, tickers: list[str], event_type: str | None = None) -> list[dict]:
        return []

    async def get_peers(self, ticker: str) -> list[str]:
        return []


def _holding(
    ticker: str,
    current_price: float | None = 100.0,
    price_status: str | None = "live",
    quantity: float = 1.0,
) -> HoldingBase:
    return HoldingBase(
        ticker=ticker,
        name=ticker,
        quantity=quantity,
        average_cost=90.0,
        current_price=current_price,
        price_status=price_status,
    )


@pytest.fixture(autouse=True)
def clear_quant_cache_fixture():
    quant_service.clear_quant_caches()
    yield
    quant_service.clear_quant_caches()


@pytest.fixture
def no_benchmark(monkeypatch):
    monkeypatch.setattr(
        quant_service.bm,
        "get_benchmark",
        lambda mode, period: {
            "ticker": "^NSEI",
            "name": "NIFTY 50",
            "period": period,
            "data": [],
            "source": "unavailable",
            "error": "benchmark offline",
        },
    )


@pytest.mark.asyncio
async def test_quant_cache_is_separated_by_holdings_fingerprint(no_benchmark):
    provider_a = FakeQuantProvider(
        [_holding("AAA"), _holding("BBB")],
        {"AAA": _history(100, 1), "BBB": _history(200, 1)},
    )
    result_a = await QuantAnalyticsService(provider_a).compute_all("1y")

    provider_b = FakeQuantProvider(
        [_holding("CCC"), _holding("DDD")],
        {"CCC": _history(300, 1), "DDD": _history(400, 1)},
    )
    result_b = await QuantAnalyticsService(provider_b).compute_all("1y")

    assert result_a["meta"]["valid_tickers"] == ["AAA", "BBB"]
    assert result_b["meta"]["valid_tickers"] == ["CCC", "DDD"]
    assert provider_b.fetch_count == 2


@pytest.mark.asyncio
async def test_valid_history_without_usable_weights_returns_degraded_result(no_benchmark):
    provider = FakeQuantProvider(
        [
            _holding("AAA", current_price=None, price_status="unknown"),
            _holding("BBB", current_price=None, price_status="unknown"),
        ],
        {"AAA": _history(100, 1), "BBB": _history(200, 1)},
    )

    result = await QuantAnalyticsService(provider).compute_all("1y")

    assert result["metrics"]["portfolio"] is None
    assert result["meta"]["portfolio_usable"] is False
    assert result["meta"]["weighting_status"] == "unavailable"
    assert "No usable portfolio weights" in result["meta"]["error"]


@pytest.mark.asyncio
async def test_benchmark_unavailable_keeps_portfolio_metrics_and_nulls_relative_metrics(no_benchmark):
    provider = FakeQuantProvider(
        [_holding("AAA"), _holding("BBB")],
        {"AAA": _history(100, 1), "BBB": _history(200, 2)},
    )

    result = await QuantAnalyticsService(provider).compute_all("1y")
    metrics = result["metrics"]["portfolio"]

    assert result["meta"]["benchmark_available"] is False
    assert result["meta"]["benchmark_error"] == "benchmark offline"
    assert metrics["annualized_return"] is not None
    assert metrics["annualized_volatility"] is not None
    assert metrics["beta"] is None
    assert metrics["tracking_error"] is None
    assert metrics["information_ratio"] is None
    assert metrics["alpha"] is None
    assert result["performance"]["portfolio"]
    assert result["performance"]["benchmark"] == []


@pytest.mark.asyncio
async def test_partial_bad_symbol_reports_exclusion(no_benchmark):
    provider = FakeQuantProvider(
        [_holding("AAA"), _holding("BBB"), _holding("BAD")],
        {"AAA": _history(100, 1), "BBB": _history(200, 1), "BAD": []},
    )

    result = await QuantAnalyticsService(provider).compute_all("1y")

    assert result["meta"]["portfolio_usable"] is True
    assert result["meta"]["incomplete"] is True
    assert result["meta"]["excluded_tickers"] == ["BAD"]
    assert result["meta"]["coverage_pct"] == 66.7
    assert result["meta"]["excluded_reason"]["BAD"] == "provider returned empty response"


def test_geometric_annualized_return_is_used_for_full_metrics():
    returns = pd.Series([0.01, -0.02, 0.015, 0.005] * 8)

    metrics = risk_utils.compute_full_risk_metrics(returns, pd.Series(dtype=float))
    expected = ((1 + returns).prod() ** (252 / len(returns)) - 1) * 100

    assert metrics["annualized_return"] == round(expected, 3)


def test_holding_stats_without_benchmark_has_no_nan_and_beta_null():
    returns = pd.Series([0.01, -0.005, 0.007, 0.002, -0.003] * 3)

    stats = risk_utils.compute_holding_stats("AAA", returns, pd.Series(dtype=float), 0.5)

    assert stats["beta"] is None
    assert stats["annualized_return"] is not None
    assert stats["volatility"] is not None
    assert all(not (isinstance(value, float) and math.isnan(value)) for value in stats.values())
