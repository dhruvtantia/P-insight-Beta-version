"""
OptimizerService — Phase 1 Orchestrator
-----------------------------------------
Fetches price histories (via the data provider), prepares optimization inputs,
runs the frontier computation, and packages a complete OptimizationOutputs object.

Design principles:
  - All I/O (price fetching) happens here, at the top of the call chain
  - Pure math lives in expected_returns, covariance, objectives, frontier
  - Results are cached (same TTLs as quant service)
  - The OptimizationOutputs dataclass is the canonical result — serialize it
    at the API layer, not here

This service is intentionally separate from QuantAnalyticsService so that:
  - Optimization can run independently (e.g. on a custom weight vector)
  - The simulation/rebalancing layer can call compute() with pre-built inputs
  - Expected returns / covariance methods can be swapped without touching the API
"""

from __future__ import annotations

import logging
import asyncio
import time as _time
from typing import Optional

import numpy as np
import pandas as pd

from app.data_providers.base import BaseDataProvider
from app.analytics.returns import build_price_matrix
from app.optimization.types import (
    OptimizationInputs,
    OptimizationOutputs,
    OptimizationConstraints,
    PortfolioPoint,
)
from app.optimization.expected_returns import get_expected_returns
from app.optimization.covariance import get_covariance, is_positive_definite, nearest_positive_definite
from app.optimization.objectives import (
    portfolio_return,
    portfolio_volatility,
    sharpe_ratio,
    normalise_weights,
    weight_from_dict,
    equal_weights,
)
from app.optimization.frontier import (
    minimize_variance,
    maximize_sharpe,
    compute_frontier,
    current_portfolio_point,
)

logger = logging.getLogger(__name__)

RISK_FREE_RATE = 0.065

# ── In-process result cache ────────────────────────────────────────────────────
_OPT_CACHE: dict[str, tuple[dict, float]] = {}
MOCK_OPT_TTL = 3_600.0 * 24   # mock is deterministic — cache 24h
LIVE_OPT_TTL = 600.0           # live — cache 10min


def _cache_get(key: str) -> Optional[dict]:
    entry = _OPT_CACHE.get(key)
    if not entry:
        return None
    ttl = MOCK_OPT_TTL if key.startswith("mock_") else LIVE_OPT_TTL
    if (_time.time() - entry[1]) < ttl:
        return entry[0]
    return None


def _cache_set(key: str, data: dict) -> None:
    _OPT_CACHE[key] = (data, _time.time())


def invalidate_cache() -> None:
    """Call this whenever holdings change (e.g. after upload)."""
    _OPT_CACHE.clear()


# ─── Main service ─────────────────────────────────────────────────────────────

class OptimizerService:

    DEFAULT_CONSTRAINTS = OptimizationConstraints(
        long_only=True,
        max_weight=0.40,    # max 40% in any single holding
        min_weight=0.0,
        fully_invested=True,
    )

    def __init__(self, provider: BaseDataProvider):
        self.provider = provider
        self.mode     = provider.mode_name

    # ── Public entry point ─────────────────────────────────────────────────────

    async def compute(
        self,
        period: str = "1y",
        expected_returns_method: str = "historical_mean",
        covariance_method: str = "auto",
        n_frontier_points: int = 40,
        constraints: OptimizationConstraints | None = None,
    ) -> dict:
        """
        Main entry point — returns a JSON-serializable dict.
        Caches results to avoid repeated price fetches.
        """
        cache_key = f"{self.mode}_{period}_{expected_returns_method}_{covariance_method}"
        cached    = _cache_get(cache_key)
        if cached:
            logger.debug(f"Optimizer cache hit: {cache_key}")
            return {**cached, "meta": {**cached["meta"], "cached": True}}

        if constraints is None:
            constraints = self.DEFAULT_CONSTRAINTS

        try:
            result = await self._compute(
                period, expected_returns_method, covariance_method,
                n_frontier_points, constraints,
            )
        except Exception as exc:
            logger.exception(f"Optimizer failed: {exc}")
            result = self._error_result(str(exc))

        _cache_set(cache_key, result)
        return result

    # ── Internal computation ───────────────────────────────────────────────────

    async def _compute(
        self,
        period: str,
        er_method: str,
        cov_method: str,
        n_frontier: int,
        constraints: OptimizationConstraints,
    ) -> dict:

        # 1. Fetch holdings
        holdings = await self.provider.get_holdings()
        if not holdings:
            return self._error_result("No holdings available")

        # 2. Fetch price histories concurrently
        price_hists, ticker_status = await self._fetch_all_histories(holdings, period)

        # 3. Build aligned price matrix
        price_df = build_price_matrix(price_hists)
        if price_df.empty:
            return self._error_result("No price data available")

        valid_tickers   = list(price_df.columns)
        invalid_tickers = [h.ticker for h in holdings if h.ticker not in valid_tickers]

        if len(valid_tickers) < 2:
            return self._error_result(
                f"Need ≥ 2 tickers with price data; got {len(valid_tickers)}"
            )

        # 4. Current portfolio weights (normalised to valid tickers)
        total_value = sum(
            h.quantity * (h.current_price or h.average_cost)
            for h in holdings if h.ticker in valid_tickers
        )
        weight_dict: dict[str, float] = {}
        for h in holdings:
            if h.ticker in valid_tickers and total_value > 0:
                weight_dict[h.ticker] = (h.quantity * (h.current_price or h.average_cost)) / total_value
        w_sum = sum(weight_dict.values())
        if w_sum > 0:
            weight_dict = {t: w / w_sum for t, w in weight_dict.items()}

        current_weights = np.array([weight_dict.get(t, 0.0) for t in valid_tickers])

        # 5. Expected returns
        mu, er_label = get_expected_returns(price_df, method=er_method)
        logger.info(f"Expected returns ({er_label}): {dict(zip(valid_tickers, np.round(mu * 100, 2)))}")

        # 6. Covariance matrix
        sigma, cov_label = get_covariance(price_df, method=cov_method)

        # Guard: ensure positive definite
        if not is_positive_definite(sigma):
            logger.warning("Covariance not positive definite — applying nearest PD fix")
            sigma = nearest_positive_definite(sigma)

        n_obs = len(price_df) - 1  # after pct_change

        # 7. Optimization inputs (stored for debug / downstream use)
        inputs = OptimizationInputs(
            tickers=valid_tickers,
            expected_returns=mu,
            covariance_matrix=sigma,
            risk_free_rate=RISK_FREE_RATE,
            current_weights=current_weights,
            constraints=constraints,
            expected_returns_method=er_label,
            covariance_method=cov_label,
            n_observations=n_obs,
        )

        # 8. Current portfolio point
        current_pt = current_portfolio_point(current_weights, mu, sigma, RISK_FREE_RATE)

        # 9. Optimised portfolios
        try:
            min_var_pt  = minimize_variance(mu, sigma, constraints, RISK_FREE_RATE)
            max_shr_pt  = maximize_sharpe(mu, sigma, constraints, RISK_FREE_RATE)
            frontier_pts = compute_frontier(mu, sigma, constraints, RISK_FREE_RATE, n_frontier)
        except Exception as exc:
            logger.exception(f"Optimization solve failed: {exc}")
            return self._error_result(f"Optimization failed: {exc}")

        # Determine which method was used + library availability
        try:
            from scipy.optimize import minimize as _sp_min  # noqa: F401
            scipy_available = True
            opt_method = "slsqp"
        except ImportError:
            scipy_available = False
            opt_method = "monte_carlo"

        try:
            from sklearn.covariance import OAS as _OAS  # noqa: F401
            sklearn_available = True
        except ImportError:
            sklearn_available = False

        # 10. Rebalance deltas (current → max Sharpe)
        deltas = []
        for i, ticker in enumerate(valid_tickers):
            cw = float(current_weights[i])
            tw = float(max_shr_pt.weights[i])
            d  = tw - cw
            if abs(d) >= 0.003:
                deltas.append({
                    "ticker":         ticker,
                    "current_weight": round(cw * 100, 2),
                    "target_weight":  round(tw * 100, 2),
                    "delta_pct":      round(d  * 100, 2),
                    "action":         "buy" if d > 0 else "sell",
                })
        deltas.sort(key=lambda x: abs(x["delta_pct"]), reverse=True)

        # 11. Constraints summary for debug
        constraints_applied = [
            "long_only" if constraints.long_only else "allow_short",
            f"max_weight_{int(constraints.max_weight * 100)}pct",
            "fully_invested",
        ]

        # 12. Serialize
        return {
            "current":      _serialize_point(current_pt,  valid_tickers),
            "min_variance": _serialize_point(min_var_pt,  valid_tickers),
            "max_sharpe":   _serialize_point(max_shr_pt,  valid_tickers),
            "frontier":     [_serialize_point(p, valid_tickers) for p in frontier_pts],
            "rebalance":    deltas,
            "inputs": {
                "expected_returns": {t: round(float(v) * 100, 4) for t, v in zip(valid_tickers, mu)},
                "covariance_diagonal": {t: round(float(sigma[i, i]), 6) for i, t in enumerate(valid_tickers)},
            },
            "meta": {
                "provider_mode":           self.mode,
                "period":                  period,
                "valid_tickers":           valid_tickers,
                "invalid_tickers":         invalid_tickers,
                # Per-ticker history source: "yfinance" / "mock" / "unavailable"
                "ticker_status":           ticker_status,
                "n_observations":          n_obs,
                "expected_returns_method": er_label,
                "covariance_method":       cov_label,
                "optimizer_method":        opt_method,
                "n_frontier_points":       len(frontier_pts),
                "risk_free_rate":          RISK_FREE_RATE,
                "constraints":             constraints_applied,
                "scipy_available":         scipy_available,
                "sklearn_available":       sklearn_available,
                "cached":                  False,
                "error":                   None,
            },
        }

    # ── Concurrent price fetching ──────────────────────────────────────────────

    async def _fetch_all_histories(
        self, holdings: list, period: str
    ) -> tuple[dict[str, list[dict]], dict[str, str]]:
        """
        Fetch price histories concurrently.
        Returns:
          price_hists:   {ticker: records}  — only tickers with non-empty data
          ticker_status: {ticker: source}   — "yfinance" / "mock" / "unavailable"
        Tickers with no data are excluded from optimization (not substituted).
        """
        async def _fetch_one(h) -> tuple[str, list[dict], str]:
            try:
                result = await self.provider.get_price_history(h.ticker, period=period)
                data   = result.get("data", [])
                source = result.get("source", "unknown")
                normalised = []
                for row in data:
                    close = row.get("close") or row.get("Close")
                    if close is not None:
                        normalised.append({"date": row["date"], "close": float(close)})
                return h.ticker, normalised, source if normalised else "unavailable"
            except Exception as e:
                logger.warning(f"Price history error for {h.ticker}: {e}")
                return h.ticker, [], "unavailable"

        results = await asyncio.gather(*[_fetch_one(h) for h in holdings])

        price_hists:   dict[str, list[dict]] = {}
        ticker_status: dict[str, str]        = {}
        for ticker, data, source in results:
            ticker_status[ticker] = source
            if data:
                price_hists[ticker] = data

        return price_hists, ticker_status

    # ── Error result ───────────────────────────────────────────────────────────

    @staticmethod
    def _error_result(reason: str) -> dict:
        return {
            "current":      None,
            "min_variance": None,
            "max_sharpe":   None,
            "frontier":     [],
            "rebalance":    [],
            "inputs":       {},
            "meta": {
                "provider_mode":           None,
                "period":                  "1y",
                "valid_tickers":           [],
                "invalid_tickers":         [],
                "ticker_status":           {},
                "n_observations":          0,
                "expected_returns_method": None,
                "covariance_method":       None,
                "optimizer_method":        None,
                "n_frontier_points":       0,
                "risk_free_rate":          RISK_FREE_RATE,
                "constraints":             [],
                "scipy_available":         None,
                "sklearn_available":       None,
                "cached":                  False,
                "error":                   reason,
            },
        }


# ─── Serialization helper ─────────────────────────────────────────────────────

def _serialize_point(pt: PortfolioPoint, tickers: list[str]) -> dict:
    return {
        "label":           pt.label,
        "expected_return": round(float(pt.expected_return), 4),
        "volatility":      round(float(pt.volatility), 4),
        "sharpe_ratio":    round(float(pt.sharpe_ratio), 4),
        "weights": {
            t: round(float(w), 6)
            for t, w in zip(tickers, pt.weights)
        },
    }
