"""
QuantAnalyticsService — Phase 3 (Hardened + Canonical Contract)
-----------------------------------------------------------------
Fetches price histories for all portfolio holdings, aligns them into a
price matrix, and computes the full set of market-based analytics.

Phase 3 changes:
  - Adds excluded_tickers (canonical) alongside invalid_tickers (compat).
  - Adds portfolio_usable: False when < 2 tickers have usable price history.
  - Fixes cached flag: was always False even on cache hits. Now correctly
    sets cached=True and cache_age_seconds when returning a cached result.
  - Improves excluded_reason: per-ticker human-readable failure messages
    instead of a blanket "unavailable" string for all exclusions.

Prior phase changes:
  - Handles benchmark source="unavailable" gracefully: portfolio-only metrics
    (vol, Sharpe, drawdown) still compute; beta/alpha/IR/benchmark metrics
    are null with benchmark_available=False in meta.
  - Adds ticker_status dict to meta: {"TCS.NS": "yfinance", "WIPRO.NS": "unavailable"}

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
from app.services.cache_service import TimedMemoryCache

logger = logging.getLogger(__name__)

RISK_FREE_RATE = 0.065
TRADING_DAYS   = 252

# ─── In-process result cache for quant computations ───────────────────────────
# Key: "{mode}_{period}"  |  Value: result_dict
MOCK_QUANT_TTL = 3_600.0 * 24   # mock data is deterministic — cache 24h
LIVE_QUANT_TTL = 600.0           # live data — cache 10 minutes


def _quant_cache_ttl(key: str) -> float:
    return MOCK_QUANT_TTL if key.startswith("mock_") else LIVE_QUANT_TTL


_QUANT_CACHE = TimedMemoryCache(_quant_cache_ttl)


def _cache_get(key: str) -> Optional[dict]:
    return _QUANT_CACHE.get(key)


def _cache_set(key: str, data: dict) -> None:
    _QUANT_CACHE.set(key, data)


# ─── Raw price history cache (Part 3 — avoids re-downloading on period switch) ─
# Key: "{mode}"  |  Value: (raw_hists, ticker_status, failure_reasons)
# Always populated with the widest available fetch (1y). Shorter periods are
# derived by slicing this data — no extra network round-trips required.
from datetime import datetime as _dt, timedelta as _td


def _raw_cache_ttl(mode: str) -> float:
    return MOCK_QUANT_TTL if mode == "mock" else LIVE_QUANT_TTL


_RAW_HIST_CACHE = TimedMemoryCache(_raw_cache_ttl)


def _raw_cache_get(mode: str) -> Optional[tuple[dict, dict, dict]]:
    """Return (raw_hists, ticker_status, failure_reasons) if cache is fresh."""
    return _RAW_HIST_CACHE.get(mode)


def _raw_cache_set(mode: str, raw_hists: dict, ticker_status: dict, failure_reasons: dict) -> None:
    _RAW_HIST_CACHE.set(mode, (raw_hists, ticker_status, failure_reasons))


def _slice_histories_to_period(
    raw_hists: dict[str, list[dict]],
    period: str,
) -> dict[str, list[dict]]:
    """
    Given a full (1y) price history dict, return a copy sliced to the requested period.
    Operates on the ISO date strings; no re-download needed.
    """
    if period == "1y":
        return raw_hists  # nothing to slice

    lookback = {"6mo": 182, "3mo": 91}.get(period, 365)
    sliced: dict[str, list[dict]] = {}

    for ticker, rows in raw_hists.items():
        if not rows:
            continue
        try:
            end_dt    = _dt.strptime(rows[-1]["date"], "%Y-%m-%d")
            cutoff_dt = end_dt - _td(days=lookback)
            kept      = [r for r in rows if _dt.strptime(r["date"], "%Y-%m-%d") >= cutoff_dt]
            if kept:
                sliced[ticker] = kept
        except Exception:
            sliced[ticker] = rows   # fallback: keep full data for this ticker

    return sliced


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

        Cache behaviour (Phase 3 fix):
          - On a cache hit, meta.cached is set to True and meta.cache_age_seconds
            is populated with the seconds elapsed since the result was stored.
          - The cached dict itself is NOT mutated — a shallow copy of meta is made
            so repeated reads don't accumulate stale age values in the stored entry.
        """
        self.period = period
        cache_key   = f"{self.mode}_{period}"
        cached      = _QUANT_CACHE.get_with_age(cache_key)

        if cached is not None:
            stored_result, age = cached
            logger.debug(f"Quant cache hit: {cache_key} (age={age:.0f}s)")
            # Return a view with accurate cache metadata — shallow-copy meta only.
            result = dict(stored_result)
            result["meta"] = {
                **stored_result["meta"],
                "cached":            True,
                "cache_age_seconds": round(age, 1),
            }
            return result

        result = await self._compute(period)
        _cache_set(cache_key, result)
        return result

    async def _compute(self, period: str) -> dict:
        # 1. Fetch all price histories
        holdings    = await self.provider.get_holdings()
        price_hists, ticker_status, failure_reasons = await self._fetch_all_histories(holdings, period)

        # 2. Build price matrix
        price_df = ret_utils.build_price_matrix(price_hists)

        valid_tickers    = list(price_df.columns)
        invalid_tickers  = [h.ticker for h in holdings if h.ticker not in valid_tickers]
        excluded_tickers = invalid_tickers   # canonical alias
        portfolio_usable = len(valid_tickers) >= 2

        if price_df.empty or not portfolio_usable:
            return self._empty_result(
                valid_tickers, invalid_tickers, ticker_status, failure_reasons,
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
                # ── Excluded tickers (canonical) ─────────────────────────────
                "excluded_tickers":    excluded_tickers,
                # Kept for backward compat
                "invalid_tickers":     invalid_tickers,
                "ticker_status":       ticker_status,
                "data_points":         len(p_ret),
                "date_range":          date_range,
                "benchmark_ticker":    bench_data["ticker"],
                "benchmark_name":      bench_data["name"],
                "benchmark_source":    bench_data["source"],
                "benchmark_available": benchmark_ok,
                "risk_free_rate":      RISK_FREE_RATE,
                # cached / cache_age_seconds are set in compute_all() on cache hit;
                # freshly computed results always start as cached=False, age=None.
                "cached":              False,
                "cache_age_seconds":   None,
                # ── Integrity metadata ───────────────────────────────────────
                "incomplete":          len(excluded_tickers) > 0,
                "portfolio_usable":    portfolio_usable,
                # Human-readable per-ticker exclusion reasons (not just "unavailable")
                "excluded_reason":     failure_reasons,
                # Coverage — % of portfolio holdings with sufficient price history.
                # Mirrors /analytics/ratios meta.coverage_pct.
                "coverage_pct":        round(
                    len(valid_tickers) / len(holdings) * 100, 1
                ) if holdings else None,
                "as_of":               datetime.now(timezone.utc).isoformat(),
            },
        }

    # ─── Price history fetching ────────────────────────────────────────────────

    async def _fetch_all_histories(
        self,
        holdings: list,
        period: str,
    ) -> tuple[dict[str, list[dict]], dict[str, str], dict[str, str]]:
        """
        Return price histories for all holdings, sliced to the requested period.

        Part 3 cache strategy:
          1. Check the raw history cache (keyed by mode only, not period).
          2. On hit  → slice the cached 1y data to the requested period.
             This avoids a second yfinance round-trip just because the user
             switched from 1y to 3mo.
          3. On miss → fetch the full 1y window from the provider, store in
             the raw cache, then slice to the requested period.

        Returns:
          price_hists:     {ticker: [{"date": ..., "close": ...}]}  — only non-empty
          ticker_status:   {ticker: source_string}
          failure_reasons: {ticker: human-readable reason}  — only for failed tickers
        """
        # ── Check raw history cache first ─────────────────────────────────────
        cached_raw = _raw_cache_get(self.mode)
        if cached_raw is not None:
            raw_hists, ticker_status, failure_reasons = cached_raw
            logger.debug(f"Raw history cache hit: mode={self.mode}, slicing to {period}")
            sliced = _slice_histories_to_period(raw_hists, period)
            return sliced, ticker_status, failure_reasons

        # ── Cache miss — fetch the full 1y window ─────────────────────────────
        # Always fetch "1y" regardless of the requested period so the raw cache
        # is maximally reusable for future 6mo/3mo requests.
        fetch_period = "1y"

        async def _fetch_one(h) -> tuple[str, list[dict], str, str]:
            """Returns (ticker, normalised_data, source, failure_reason)."""
            try:
                result = await self.provider.get_price_history(h.ticker, period=fetch_period)
                data   = result.get("data", [])
                source = result.get("source", "unknown")

                # Normalise key name: both "close" and "Close" accepted
                normalised = []
                for row in data:
                    close = row.get("close") or row.get("Close")
                    if close is not None:
                        normalised.append({"date": row["date"], "close": float(close)})

                if not normalised:
                    reason = (
                        "no price data returned by provider"
                        if data else
                        "provider returned empty response"
                    )
                    return h.ticker, [], "unavailable", reason

                return h.ticker, normalised, source, ""

            except asyncio.TimeoutError:
                logger.warning(f"Price history timeout for {h.ticker}")
                return h.ticker, [], "unavailable", "fetch timed out"
            except Exception as e:
                logger.warning(f"Price history error for {h.ticker}: {e}")
                return h.ticker, [], "unavailable", f"fetch error ({type(e).__name__})"

        tasks   = [_fetch_one(h) for h in holdings]
        results = await asyncio.gather(*tasks)

        raw_hists:      dict[str, list[dict]] = {}
        ticker_status:  dict[str, str]        = {}
        failure_reasons: dict[str, str]       = {}

        for ticker, data, source, reason in results:
            ticker_status[ticker] = source
            if data:
                raw_hists[ticker] = data
            else:
                failure_reasons[ticker] = reason

        # Store the full 1y result in the raw cache
        _raw_cache_set(self.mode, raw_hists, ticker_status, failure_reasons)

        # Slice to the originally requested period before returning
        sliced = _slice_histories_to_period(raw_hists, period)
        return sliced, ticker_status, failure_reasons

    # ─── Empty / error result ──────────────────────────────────────────────────

    @staticmethod
    def _empty_result(
        valid_tickers:   list[str],
        invalid_tickers: list[str],
        ticker_status:   dict[str, str],
        failure_reasons: dict[str, str] | None = None,
        reason:          str = "No data",
    ) -> dict:
        excluded_tickers = invalid_tickers
        failure_reasons  = failure_reasons or {}
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
                "excluded_tickers":    excluded_tickers,
                "invalid_tickers":     invalid_tickers,
                "ticker_status":       ticker_status,
                "data_points":         0,
                "date_range":          None,
                "benchmark_ticker":    "^NSEI",
                "benchmark_name":      "NIFTY 50",
                "benchmark_source":    None,
                "benchmark_available": False,
                "risk_free_rate":      RISK_FREE_RATE,
                "cached":              False,
                "cache_age_seconds":   None,
                # ── Integrity metadata ───────────────────────────────────────
                "incomplete":          len(excluded_tickers) > 0,
                "portfolio_usable":    False,
                "excluded_reason":     failure_reasons,
                # Coverage — % of tickers with usable price history.
                "coverage_pct":        round(
                    len(valid_tickers) / (len(valid_tickers) + len(invalid_tickers)) * 100, 1
                ) if (valid_tickers or invalid_tickers) else None,
                "as_of":               datetime.now(timezone.utc).isoformat(),
                "error":               reason,
            },
        }
