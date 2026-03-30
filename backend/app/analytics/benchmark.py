"""
Benchmark Data Provider — NIFTY 50 (^NSEI)
-------------------------------------------
Fetches or generates benchmark price history for risk-relative metrics.

Live mode:  yfinance → ^NSEI (NIFTY 50 index)
Mock mode:  Synthetic GBM series, seeded for reproducibility.

Cache: in-process, 1-hour TTL for live data.
"""

import time
import logging
import numpy as np
from datetime import date, timedelta
from typing import Optional

logger = logging.getLogger(__name__)

BENCHMARK_TICKER = "^NSEI"
BENCHMARK_NAME   = "NIFTY 50"
BENCHMARK_TTL    = 3_600.0   # 1 hour

# Mock parameters (calibrated to realistic NIFTY 50 long-run stats)
NIFTY_DRIFT        = 0.13 / 252       # ~13% annualised return
NIFTY_SIGMA        = 0.175 / (252**0.5)  # ~17.5% annualised volatility
NIFTY_BASE_PRICE   = 19_500.0         # approximate recent NIFTY level
NIFTY_MOCK_SEED    = 20_240           # fixed seed for reproducibility

_CACHE: dict[str, tuple[dict, float]] = {}


def _from_cache(key: str) -> Optional[dict]:
    entry = _CACHE.get(key)
    if entry and (time.time() - entry[1]) < BENCHMARK_TTL:
        return entry[0]
    return None


def _to_cache(key: str, data: dict) -> None:
    _CACHE[key] = (data, time.time())


# ─── Mock benchmark ───────────────────────────────────────────────────────────

def generate_mock_benchmark(period: str = "1y") -> dict:
    """
    Deterministic synthetic NIFTY 50 series using GBM.
    Seeded → same data on every call. Suitable for reproducible mock analytics.
    """
    n_target = {"1y": 252, "6mo": 126, "3mo": 63, "2y": 504}.get(period, 252)
    rng = np.random.default_rng(seed=NIFTY_MOCK_SEED)

    # Generate enough calendar days to find n_target trading days
    today = date.today()
    records = []
    price = NIFTY_BASE_PRICE
    day_count = 0
    cal_day = 0

    while day_count < n_target:
        cal_day += 1
        d = today - timedelta(days=(n_target * 2) - cal_day)
        if d > today or d.weekday() >= 5:   # skip weekends and future dates
            continue
        ret = rng.normal(NIFTY_DRIFT, NIFTY_SIGMA)
        price = price * (1 + ret)
        records.append({"date": d.isoformat(), "close": round(float(price), 2)})
        day_count += 1

    # Scale so the last point is near NIFTY_BASE_PRICE (anchors mock to known level)
    if records:
        scale = NIFTY_BASE_PRICE / records[-1]["close"]
        for r in records:
            r["close"] = round(r["close"] * scale, 2)

    return {
        "ticker": BENCHMARK_TICKER,
        "name":   BENCHMARK_NAME,
        "period": period,
        "data":   records,
        "source": "mock",
    }


# ─── Live benchmark ───────────────────────────────────────────────────────────

def fetch_benchmark_live(period: str = "1y") -> dict:
    """
    Fetch NIFTY 50 history from Yahoo Finance.
    Falls back to mock on any error.
    """
    cache_key = f"{BENCHMARK_TICKER}_{period}"
    cached = _from_cache(cache_key)
    if cached:
        return cached

    try:
        import yfinance as yf

        data = yf.Ticker(BENCHMARK_TICKER).history(
            period=period,
            interval="1d",
            auto_adjust=True,
        )
        if data.empty:
            raise ValueError("Empty data returned for ^NSEI")

        records = [
            {"date": str(dt.date()), "close": round(float(row["Close"]), 2)}
            for dt, row in data.iterrows()
        ]

        result = {
            "ticker": BENCHMARK_TICKER,
            "name":   BENCHMARK_NAME,
            "period": period,
            "data":   records,
            "source": "yfinance",
        }
        _to_cache(cache_key, result)
        return result

    except ImportError:
        logger.warning("yfinance not installed — using mock benchmark")
        return generate_mock_benchmark(period)
    except Exception as e:
        logger.warning(f"Benchmark fetch failed ({e}) — using mock benchmark")
        return generate_mock_benchmark(period)


def get_benchmark(mode: str = "mock", period: str = "1y") -> dict:
    """
    Public entry point. Routes to live or mock based on provider mode.
    """
    if mode == "live":
        return fetch_benchmark_live(period)
    return generate_mock_benchmark(period)
