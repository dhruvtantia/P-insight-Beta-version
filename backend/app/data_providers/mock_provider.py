"""
Mock Data Provider
--------------------
Serves static data from mock_data/portfolio.json.
Always available — no external dependencies required.
Used as the default mode for local development and demos.
"""

import json
import logging
from pathlib import Path
from typing import Optional

from app.data_providers.base import BaseDataProvider
from app.schemas.portfolio import HoldingBase
from app.core.config import settings

logger = logging.getLogger(__name__)

MOCK_DATA_PATH = Path(__file__).parent.parent.parent / "mock_data"


class MockDataProvider(BaseDataProvider):

    @property
    def mode_name(self) -> str:
        return "mock"

    @property
    def is_available(self) -> bool:
        return False  # Mock mode is intentionally disabled

    @property
    def unavailable_reason(self) -> str:
        return "Mock data mode is disabled. Please upload a portfolio CSV or connect a broker account."

    def _load_portfolio(self) -> dict:
        path = MOCK_DATA_PATH / "portfolio.json"
        with open(path, "r") as f:
            return json.load(f)

    async def get_holdings(self) -> list[HoldingBase]:
        data = self._load_portfolio()
        return [HoldingBase(**h) for h in data["holdings"]]

    async def get_price_history(
        self,
        ticker: str,
        period: str = "1y",
        interval: str = "1d",
    ) -> dict:
        """
        Returns a seeded, reproducible mock price series using a two-factor model:
          r_i(t) = beta_i * r_market(t) + eps_i(t)

        The market factor uses a fixed seed → same market across all tickers.
        Each ticker has a deterministic idiosyncratic seed → same noise across calls.
        This produces realistic correlation structure in mock mode:
          - IT stocks cluster together (high beta to market)
          - Defensives (FMCG, Pharma) have lower market beta → lower correlation
        """
        import numpy as np
        from datetime import date, timedelta

        # ── Period → target trading days ──────────────────────────────────────
        n_target = {"1y": 252, "6mo": 126, "3mo": 63, "2y": 504}.get(period, 252)

        # ── Find anchor price ────────────────────────────────────────────────
        data = self._load_portfolio()
        holdings = data["holdings"]
        current = float(next(
            (h["current_price"] for h in holdings if h["ticker"] == ticker),
            1000.0,
        ))

        # ── Factor model parameters ──────────────────────────────────────────
        # Approximate betas for each holding (calibrated to sector behaviour)
        MOCK_BETAS: dict[str, float] = {
            "RELIANCE.NS":   0.95,
            "TCS.NS":        0.85,
            "HDFCBANK.NS":   1.10,
            "INFY.NS":       0.90,
            "ICICIBANK.NS":  1.15,
            "HINDUNILVR.NS": 0.50,   # defensive FMCG — low beta
            "BHARTIARTL.NS": 0.80,
            "WIPRO.NS":      0.85,
            "MARUTI.NS":     1.20,
            "SUNPHARMA.NS":  0.60,   # defensive pharma — low beta
        }
        beta = MOCK_BETAS.get(ticker.upper(), 1.0)

        # Market factor: shared seed → same realisation for all tickers
        market_rng  = np.random.default_rng(seed=20_241)
        mu_m        = 0.13 / 252
        sigma_m     = 0.175 / (252 ** 0.5)
        market_rets = market_rng.normal(mu_m, sigma_m, n_target)

        # Idiosyncratic factor: deterministic per-ticker seed
        ticker_seed = sum(ord(c) * (i + 1) for i, c in enumerate(ticker)) % (2 ** 31)
        idio_rng    = np.random.default_rng(seed=ticker_seed)
        sigma_idio  = 0.10 / (252 ** 0.5)
        idio_rets   = idio_rng.normal(0, sigma_idio, n_target)

        # Combine
        returns = beta * market_rets + idio_rets

        # Build price series that terminates at ~current_price
        cum   = np.cumprod(1 + returns)
        scale = current / cum[-1]      # anchor last price to current
        prices_arr = cum * scale

        # ── Assemble date-indexed records ─────────────────────────────────────
        today = date.today()
        records = []
        day_count = 0

        for offset in range(n_target * 3):   # enough calendar days
            d = today - timedelta(days=(n_target * 3) - offset)
            if d >= today or d.weekday() >= 5:
                continue
            p = float(prices_arr[day_count])
            records.append({
                "date":   d.isoformat(),
                "close":  round(p, 2),
                "open":   round(p * float(idio_rng.uniform(0.990, 1.010)), 2),
                "high":   round(p * float(idio_rng.uniform(1.000, 1.015)), 2),
                "low":    round(p * float(idio_rng.uniform(0.985, 1.000)), 2),
                "volume": int(idio_rng.integers(300_000, 5_000_000)),
            })
            day_count += 1
            if day_count >= n_target:
                break

        return {
            "ticker":   ticker,
            "period":   period,
            "interval": interval,
            "data":     records,
            "source":   "mock",
        }

    async def get_fundamentals(self, ticker: str) -> dict:
        data = self._load_portfolio()
        # Check portfolio fundamentals first; fall back to peer_fundamentals
        all_fundamentals = {
            **data.get("fundamentals", {}),
            **data.get("peer_fundamentals", {}),
        }
        defaults: dict = {
            "name": ticker,
            "sector": None,
            "industry": None,
            "pe_ratio": None,
            "forward_pe": None,
            "pb_ratio": None,
            "ev_ebitda": None,
            "peg_ratio": None,
            "market_cap": None,
            "dividend_yield": None,
            "roe": None,
            "roa": None,
            "revenue_growth": None,
            "earnings_growth": None,
            "operating_margin": None,
            "profit_margin": None,
            "debt_to_equity": None,
        }
        ticker_data = {**defaults, **all_fundamentals.get(ticker, {})}
        return {"ticker": ticker, "source": "mock", **ticker_data}

    async def get_news(
        self,
        tickers: list[str],
        event_type: Optional[str] = None,
    ) -> list[dict]:
        """
        Returns real news from NewsAPI when NEWS_API_KEY is configured.
        Returns an empty list when the key is absent — no fake articles are shown.
        """
        if settings.NEWS_API_KEY:
            # Delegate to the shared NewsAPI helper (same as live mode)
            from app.data_providers.live_provider import _fetch_newsapi_articles
            return _fetch_newsapi_articles(tickers, event_type)
        logger.debug("MockDataProvider.get_news: NEWS_API_KEY not configured; returning []")
        return []

    async def get_events(
        self,
        tickers: list[str],
        event_type: Optional[str] = None,
    ) -> list[dict]:
        """
        Corporate events require a live events API — not available in mock mode.
        Returns empty list rather than static fake events.
        """
        return []

    async def get_peers(self, ticker: str) -> list[str]:
        """
        Returns 3–4 meaningful industry peers for each portfolio holding.
        Peers that are also in the portfolio (e.g. INFY vs TCS) are included —
        the comparison is intentionally cross-portfolio where relevant.
        """
        peer_map: dict[str, list[str]] = {
            "RELIANCE.NS":   ["ONGC.NS",     "BPCL.NS",     "IOC.NS"                             ],
            "TCS.NS":        ["INFY.NS",      "HCLTECH.NS",  "WIPRO.NS",   "TECHM.NS"             ],
            "HDFCBANK.NS":   ["ICICIBANK.NS", "KOTAKBANK.NS","AXISBANK.NS"                         ],
            "INFY.NS":       ["TCS.NS",       "HCLTECH.NS",  "WIPRO.NS",   "TECHM.NS"             ],
            "ICICIBANK.NS":  ["HDFCBANK.NS",  "KOTAKBANK.NS","AXISBANK.NS"                         ],
            "HINDUNILVR.NS": ["NESTLEIND.NS", "DABUR.NS",    "MARICO.NS"                          ],
            "BHARTIARTL.NS": ["IDEA.NS",      "TATACOMM.NS"                                       ],
            "WIPRO.NS":      ["TCS.NS",       "INFY.NS",     "HCLTECH.NS", "TECHM.NS"             ],
            "MARUTI.NS":     ["TATAMOTORS.NS","M&M.NS"                                             ],
            "SUNPHARMA.NS":  ["DRREDDY.NS",   "CIPLA.NS",    "DIVISLAB.NS"                        ],
        }
        return peer_map.get(ticker, [])
