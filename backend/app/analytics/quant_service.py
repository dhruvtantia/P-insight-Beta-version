"""
QuantAnalyticsService — Phase 3 (Hardened)
-------------------------------------------
Fetches price histories for all portfolio holdings, aligns them into a
price matrix, and computes the full set of market-based analytics.

Changes from Phase 2:
  - Handles benchmark source="unavailable" gracefully: portfolio-only metrics
    (vol, Sharpe, drawdown) still compute; beta/alpha/IR/benchmark metrics
    are null with benchmark_available=False in meta.
  - Adds ticker_status dict to meta: {"TCS.NS": "yfinance", "WIPRO.NS": "unavailable"}
  - invalid_tickers now includes tickers where get_price_history returned empty data[].

Computed analytics:
  - Risk metrics (volatility, beta, Sharpe, Sortino, drawdown, etc.)
  - Benchmark comparison (NIFTY 50, when available)
  - Cumulative return time series (portfolio vs benchmark)
  - Drawdown time series
  - Per-holding contribution stats
  - Correlation matrix

Mock mode:  Fast in-memory, seeded deterministic price histories.
Live mode:  yfinance via LiveAPIProvider.get_price_history(), TTL-cached.
            Unavailable tickers are skipped; unavailable benchmark means
            relative metrics are null — no silent synthetic substitution.
"""

import logging
import asyncio
import numpy as np
import pandas as pd
from datetime import datetime, timezone
from typing import Optional

from app.data_providers.base import BaseDataProvider
from app.analytics import returns as ret_utils
from app.analytics import risk as rsk
from app.analytics import benchmark as bm
from app.analytics import correlation as corr

logger = logging.getLogger(__name__)

RISK_FREE_RATE = 0.065
TRADING_DAYS   = 252

# ─── In-process result cache for quant computations ───────────────────────────
# Key: "{mode}_{period}"  |  Value: (result_dict, timestamp)
import time as _time
_QUANT_CACHE: dict[str, tuple[dict, float]] = {}
MOCK_QUANT_TTL = 3_600.0 * 24   # mock data is deterministic — cache 24h
LIVE_QUANT_TTL = 600.0           # live data — cache 10 minutes


def _cache_get(key: str) -> Optional[dict]:
    entry = _QUANT_CACHE.get(key)
    if not entry:
        return None
    ttl = MOCK_QUANT_TTL if key.startswith("mock_") else LIVE_QUANT_TTL
    if (_time.time() - entry[1]) < ttl:
        return entry[0]
    return None


def _cache_set(key: str, data: dict) -> None:
    _QUANT_CACHE[key] = (data, _time.time())


# ─── Cache pre-warmer (called from BackgroundTasks after upload) ───────────────

async def pre_warm_cache(provider: "BaseDataProvider", period: str = "1y") -> None:
    """
    Fire-and-forget coroutine: compute quant analytics in the background
    immediately after a portfolio is uploaded so the first visit to /quant
    or /risk is fast instead of triggering a fresh 30-60s yfinance fetch.

    Called from upload.py confirm endpoint via FastAPI BackgroundTasks.
    Errors are caught and logged — they must never crash the upload response.
    """
    try:
        svc = QuantAnalyticsService(provider)
        await svc.compute_all(period=period)
        logger.info("Quant cache pre-warmed: mode=%s period=%s", provider.mode_name, period)
    except Exception as exc:
        logger.warning("Quant cache pre-warm failed (non-fatal): %s", exc)


# ─── Main service class ───────────────────────────────────────────────────────

class QuantAnalyticsService:

    def __init__(self, provider: BaseDataProvider):
        self.provider = provider
        self.mode     = provider.mode_name
        self.period   = "1y"

    async def compute_all(self, period: str = "1y") -> dict:
        """
        Main entry point. Returns a comprehensive dict with all quant analytics.
        Results are cached to avoid repeated expensive fetches.
        """
        self.period = period
        cache_key   = f"{self.mode}_{period}"
        cached      = _cache_get(cache_key)
        if cached:
            logger.debug(f"Quant cache hit: {cache_key}")
            return cached

        result = await self._compute(period)
        _cache_set(cache_key, result)
        return result

    async def _compute(self, period: str) -> dict:
        # 1. Fetch all price histories
        holdings    = await self.provider.get_holdings()
        price_hists, ticker_status = await self._fetch_all_histories(holdings, period)

        # 2. Build price matrix
        price_df = ret_utils.build_price_matrix(price_hists)

        valid_tickers   = list(price_df.columns)
        invalid_tickers = [h.ticker for h in holdings if h.ticker not in valid_tickers]

        if price_df.empty or len(valid_tickers) < 2:
            return self._empty_result(
                valid_tickers, invalid_tickers, ticker_status,
                reason="Insufficient price history (need ≥ 2 tickers)",
            )

        # 3. Portfolio weights (normalised to valid tickers)
        total_value = sum(
            h.quantity * (h.current_price or h.average_cost)
            for h in holdings
            if h.ticker in valid_tickers
        )
        weights: dict[str, float] = {}
        for h in holdings:
            if h.ticker in valid_tickers and total_value > 0:
                weights[h.ticker] = (h.quantity * (h.current_price or h.average_cost)) / total_value
        w_sum = sum(weights.values())
        if w_sum > 0:
            weights = {t: w / w_sum for t, w in weights.items()}

        # 4. Portfolio daily return series
        portfolio_returns = ret_utils.portfolio_return_series(price_df, weights)

        # 5. Benchmark — handle unavailable gracefully
        bench_data        = bm.get_benchmark(self.mode, period)
        benchmark_ok      = bench_data.get("source") not in ("unavailable",) and bool(bench_data.get("data"))

        bench_df = ret_utils.build_price_matrix({
            bench_data["ticker"]: bench_data["data"]
        }) if benchmark_ok else pd.DataFrame()

        benchmark_returns = pd.Series(dtype=float)
        if not bench_df.empty:
            benchmark_returns = bench_df.iloc[:, 0].pct_change().dropna()

        # 6. Align portfolio ↔ benchmark on common dates
        if not benchmark_returns.empty:
            p_ret, b_ret = ret_utils.align_series(portfolio_returns, benchmark_returns)
        else:
            p_ret, b_ret = portfolio_returns, pd.Series(dtype=float)

        # 7. Risk metrics (portfolio only if benchmark unavailable)
        metrics = rsk.compute_full_risk_metrics(p_ret, b_ret, RISK_FREE_RATE)

        # 8. Benchmark standalone metrics (only when available)
        bench_metrics = {}
        if benchmark_ok and not b_ret.empty and len(b_ret) >= 20:
            bench_metrics = {
                "name":                  bench_data["name"],
                "ticker":                bench_data["ticker"],
                "annualized_return":     round(float((1 + b_ret.mean()) ** TRADING_DAYS - 1) * 100, 3),
                "annualized_volatility": round(float(b_ret.std() * np.sqrt(TRADING_DAYS)) * 100, 3),
                "sharpe_ratio":          round(rsk.compute_risk_metrics(b_ret, risk_free_rate=RISK_FREE_RATE).sharpe_ratio or 0, 3),
                "max_drawdown":          round(float(((1 + b_ret).cumprod() / (1 + b_ret).cumprod().cummax() - 1).min()) * 100, 3),
                "source":                bench_data["source"],
            }

        # 9. Cumulative return time series
        port_cum  = ret_utils.cumulative_returns(p_ret)
        bench_cum = ret_utils.cumulative_returns(b_ret) if not b_ret.empty else pd.Series(dtype=float)

        # 10. Drawdown series
        cum_val         = (1 + p_ret).cumprod()
        drawdown_series = (cum_val / cum_val.cummax() - 1)

        # 11. Per-holding contributions
        contributions = []
        returns_df    = price_df.pct_change().dropna()
        for ticker in valid_tickers:
            if ticker in returns_df.columns:
                t_ret = returns_df[ticker].dropna()
                stat  = rsk.compute_holding_stats(
                    ticker, t_ret, b_ret,
                    weights.get(ticker, 0.0),
                    RISK_FREE_RATE,
                )
                contributions.append(stat)

        # 12. Correlation matrix
        corr_result = corr.compute_correlation_matrix(price_df)

        # 13. Package result
        date_range = {}
        if not p_ret.empty:
            date_range = {
                "start": p_ret.index[0].strftime("%Y-%m-%d"),
                "end":   p_ret.index[-1].strftime("%Y-%m-%d"),
            }

        return {
            "metrics": {
                "portfolio": metrics,
                "benchmark": bench_metrics,
            },
            "performance": {
                "portfolio": [
                    {"date": d.strftime("%Y-%m-%d"), "value": round(float(v) * 100, 4)}
                    for d, v in port_cum.items()
                ],
                "benchmark": [
                    {"date": d.strftime("%Y-%m-%d"), "value": round(float(v) * 100, 4)}
                    for d, v in bench_cum.items()
                ] if not bench_cum.empty else [],
            },
            "drawdown": [
                {"date": d.strftime("%Y-%m-%d"), "value": round(float(v) * 100, 4)}
                for d, v in drawdown_series.items()
            ],
            "correlation":   corr_result,
            "contributions": contributions,
            "meta": {
                "provider_mode":       self.mode,
                "period":              period,
                "valid_tickers":       valid_tickers,
                "invalid_tickers":     invalid_tickers,
                "ticker_status":       ticker_status,
                "data_points":         len(p_ret),
                "date_range":          date_range,
                "benchmark_ticker":    bench_data["ticker"],
                "benchmark_name":      bench_data["name"],
                "benchmark_source":    bench_data["source"],
                "benchmark_available": benchmark_ok,
                "risk_free_rate":      RISK_FREE_RATE,
                "cached":              False,
                # ── Integrity metadata ───────────────────────────────────────
                "incomplete":          len(invalid_tickers) > 0,
                "excluded_reason":     {
                    t: s for t, s in ticker_status.items() if s == "unavailable"
                },
                "as_of":               datetime.now(timezone.utc).isoformat(),
            },
        }

    # ─── Price history fetching ────────────────────────────────────────────────

    async def _fetch_all_histories(
        self,
        holdings: list,
        period: str,
    ) -> tuple[dict[str, list[dict]], dict[str, str]]:
        """
        Fetch price histories for all holdings concurrently.
        Returns:
          price_hists:   {ticker: [{"date": ..., "close": ...}]}  — only non-empty
          ticker_status: {ticker: source_string}  — e.g. "yfinance" / "unavailable" / "mock"
        """
        async def _fetch_one(h) -> tuple[str, list[dict], str]:
            try:
                result = await self.provider.get_price_history(h.ticker, period=period)
                data   = result.get("data", [])
                source = result.get("source", "unknown")

                # Normalise key name: both "close" and "Close" accepted
                normalised = []
                for row in data:
                    close = row.get("close") or row.get("Close")
                    if close is not None:
                        normalised.append({"date": row["date"], "close": float(close)})

                return h.ticker, normalised, source if normalised else "unavailable"
            except Exception as e:
                logger.warning(f"Price history error for {h.ticker}: {e}")
                return h.ticker, [], "unavailable"

        tasks   = [_fetch_one(h) for h in holdings]
        results = await asyncio.gather(*tasks)

        price_hists:   dict[str, list[dict]] = {}
        ticker_status: dict[str, str]        = {}

        for ticker, data, source in results:
            ticker_status[ticker] = source
            if data:
                price_hists[ticker] = data

        return price_hists, ticker_status

    # ─── Empty / error result ──────────────────────────────────────────────────

    @staticmethod
    def _empty_result(
        valid_tickers:   list[str],
        invalid_tickers: list[str],
        ticker_status:   dict[str, str],
        reason:          str = "No data",
    ) -> dict:
        return {
            "metrics":       {"portfolio": None, "benchmark": None},
            "performance":   {"portfolio": [], "benchmark": []},
            "drawdown":      [],
            "correlation":   {
                "tickers": [], "matrix": [],
                "average_pairwise": None, "min_pair": None, "max_pair": None,
                "interpretation": None,
            },
            "contributions": [],
            "meta": {
                "provider_mode":       None,
                "period":              "1y",
                "valid_tickers":       valid_tickers,
                "invalid_tickers":     invalid_tickers,
                "ticker_status":       ticker_status,
                "data_points":         0,
                "date_range":          None,
                "benchmark_ticker":    "^NSEI",
                "benchmark_name":      "NIFTY 50",
                "benchmark_source":    None,
                "benchmark_available": False,
                "risk_free_rate":      RISK_FREE_RATE,
                # ── Integrity metadata ───────────────────────────────────────
                "incomplete":          len(invalid_tickers) > 0,
                "excluded_reason":     {
                    t: s for t, s in ticker_status.items() if s == "unavailable"
                },
                "as_of":               datetime.now(timezone.utc).isoformat(),
                "error":               reason,
            },
        }
