"""
Portfolio History Service
--------------------------
Fetches and persists daily portfolio value and benchmark history.

Called once at upload time (background task).  Data is then reused by
any page that needs a time series — no repeated yfinance calls.

What gets fetched:
  - 1-year daily OHLCV for every holding ticker via yfinance batch download
  - 1-year daily close for the default benchmark (^NSEI)

What gets computed:
  - Daily portfolio value = sum(holding.quantity × ticker_close_on_that_day)
    Forward-filled across weekends/holidays.

What gets stored:
  - portfolio_history: (portfolio_id, date, total_value) — one row per trading day
  - benchmark_history: (ticker, date, close_price) — shared across all portfolios

Build status tracking:
  - HistoryBuildStatusStore: in-memory status store keyed by portfolio_id
  - Values: 'pending' | 'building' | 'done' | 'failed'
  - Set to 'pending' before background task is scheduled (upload.py)
  - Set to 'building' when the task starts, 'done'/'failed' on completion
  - Resets on server restart (acceptable: DB rows are the source of truth)
  - Exposed via get_history_build_status() so the history endpoint can
    include build_status in its response — lets the frontend distinguish
    "still building" from "failed" from "never triggered"

Pages that benefit immediately:
  - Changes page: smooth 1-year line chart instead of N-snapshot step function
  - (Future) Dashboard history widget, peer comparison, etc.

IMPORTANT — honest labelling:
  The daily portfolio value is *synthetic*: it assumes current quantities were
  held throughout the year.  This is clearly labelled in the API response so
  the frontend can display the right caveat to the user.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Optional

from sqlalchemy.orm import Session
from app.services.cache_service import HistoryBuildStatusStore

if TYPE_CHECKING:
    from app.schemas.portfolio import HoldingBase

logger = logging.getLogger(__name__)

# Default benchmark — Nifty 50 index
_DEFAULT_BENCHMARK = "^NSEI"


# ─── Build Status Tracking ─────────────────────────────────────────────────────
# Lightweight in-memory status store.  Keyed by portfolio_id (int).
# Survives within a server process; resets on restart.
# The DB rows (portfolio_history table) are the durable source of truth —
# this is only for surfacing live build progress to the frontend.

_HISTORY_BUILD_STATUS = HistoryBuildStatusStore()


def set_history_build_status(
    portfolio_id: int,
    status: str,               # 'pending' | 'building' | 'done' | 'failed'
    *,
    rows_written: int = 0,
    benchmark_rows: int = 0,
    error: Optional[str] = None,
    note: Optional[str] = None,
) -> None:
    """
    Update the in-memory build status for a portfolio.
    Called by upload.py (to set 'pending') and by the background task
    itself (to set 'building' → 'done' / 'failed').
    """
    _HISTORY_BUILD_STATUS.set_status(
        portfolio_id,
        status,
        rows_written=rows_written,
        benchmark_rows=benchmark_rows,
        error=error,
        note=note,
    )


def get_history_build_status(portfolio_id: int) -> dict:
    """
    Return the current build status for a portfolio.

    Returns a dict with keys:
      status:         'pending' | 'building' | 'done' | 'failed' | 'unknown'
      rows_written:   int
      benchmark_rows: int
      error:          str | None
      note:           str | None
      started_at:     ISO str | None
      finished_at:    ISO str | None

    'unknown' means no upload has been triggered in this server session
    (the DB may still have data from a prior session).
    """
    return _HISTORY_BUILD_STATUS.get_status(portfolio_id)


# ─── Build + Store ─────────────────────────────────────────────────────────────

def build_and_store_portfolio_history(
    portfolio_id: int,
    holdings: "list[HoldingBase]",
    db_factory,                     # callable → Session  (e.g. SessionLocal)
    window: str = "1y",
    benchmark: str = _DEFAULT_BENCHMARK,
) -> dict:
    """
    Background task: fetch 1-year historical prices, compute daily portfolio value,
    persist to portfolio_history + benchmark_history tables.

    Called via FastAPI BackgroundTasks after upload confirm, so it runs after the
    HTTP response is already returned to the user.

    db_factory is a callable that returns a new Session.  We cannot reuse the
    request-scoped session because background tasks outlive the request.

    Returns a summary dict {rows_written, benchmark_rows, error, note}.
    """
    # Mark as 'building' — replaces the 'pending' set by upload.py
    set_history_build_status(portfolio_id, "building")

    try:
        import yfinance as yf
        import pandas as pd
    except ImportError:
        logger.warning("yfinance not installed — skipping portfolio history build")
        set_history_build_status(portfolio_id, "failed", error="yfinance not available")
        return {"rows_written": 0, "benchmark_rows": 0, "error": "yfinance not available"}

    tickers = [h.ticker for h in holdings]
    quantities: dict[str, float] = {h.ticker: h.quantity for h in holdings}

    if not tickers:
        set_history_build_status(portfolio_id, "failed", error="no tickers")
        return {"rows_written": 0, "benchmark_rows": 0, "error": "no tickers", "note": None}

    logger.info(
        "Building portfolio history for %d tickers (portfolio_id=%s, window=%s)",
        len(tickers), portfolio_id, window,
    )

    try:
        # ── 1. Batch download ──────────────────────────────────────────────────
        # Download holdings + benchmark in one call.
        all_tickers = list(dict.fromkeys(tickers + [benchmark]))   # deduplicated, order preserved
        raw = yf.download(
            all_tickers,
            period=window,
            auto_adjust=True,
            progress=False,
            threads=True,
        )

        if raw is None or (hasattr(raw, 'empty') and raw.empty):
            logger.warning("yfinance returned empty DataFrame (portfolio_id=%s)", portfolio_id)
            set_history_build_status(portfolio_id, "failed", error="empty yfinance response")
            return {"rows_written": 0, "benchmark_rows": 0, "error": "empty yfinance response", "note": None}

        import pandas as pd  # ensure available after try block

        # ── 2. Extract close prices ────────────────────────────────────────────
        # yfinance column structure varies by version:
        #   Multi-ticker: MultiIndex columns — outer level is metric OR ticker
        #   Single-ticker: flat columns (Open, High, Low, Close, Volume)
        closes: dict[str, pd.Series] = _extract_closes(raw, all_tickers)

        if not closes:
            logger.warning("Could not extract any close prices (portfolio_id=%s)", portfolio_id)
            set_history_build_status(portfolio_id, "failed", error="no close prices extracted")
            return {"rows_written": 0, "benchmark_rows": 0, "error": "no close prices extracted", "note": None}

        # ── 3. Compute daily portfolio value ───────────────────────────────────
        holding_closes = {t: s for t, s in closes.items() if t in quantities}

        if not holding_closes:
            logger.warning(
                "No close data for any holding ticker (portfolio_id=%s). "
                "Got closes for: %s. Expected: %s",
                portfolio_id, list(closes.keys()), tickers,
            )
            set_history_build_status(portfolio_id, "failed", error="no holding price data")
            return {"rows_written": 0, "benchmark_rows": 0, "error": "no holding price data", "note": None}

        df_closes = pd.DataFrame(holding_closes)
        df_closes = df_closes.ffill().bfill()   # fill weekends/holidays

        qty_series = pd.Series(quantities)
        common = df_closes.columns.intersection(qty_series.index)
        if len(common) == 0:
            set_history_build_status(portfolio_id, "failed", error="ticker mismatch after download")
            return {"rows_written": 0, "benchmark_rows": 0, "error": "ticker mismatch after download", "note": None}

        daily_values: pd.Series = (df_closes[common] * qty_series[common]).sum(axis=1)
        daily_values = daily_values[daily_values > 0]   # drop zero-value rows

        # ── 4. Persist portfolio history ───────────────────────────────────────
        from app.models.history import PortfolioHistory, BenchmarkHistory

        db: Session = db_factory()
        rows_written = 0
        benchmark_rows = 0
        try:
            # Wipe old data for this portfolio (fresh recompute on re-upload)
            db.query(PortfolioHistory).filter(
                PortfolioHistory.portfolio_id == portfolio_id
            ).delete(synchronize_session=False)

            history_rows = []
            for date_idx, value in daily_values.items():
                date_str = (
                    date_idx.strftime("%Y-%m-%d")
                    if hasattr(date_idx, "strftime")
                    else str(date_idx)[:10]
                )
                history_rows.append(
                    PortfolioHistory(
                        portfolio_id=portfolio_id,
                        date=date_str,
                        total_value=float(value),
                    )
                )

            db.add_all(history_rows)
            db.commit()
            rows_written = len(history_rows)
            logger.info(
                "Stored %d daily portfolio history rows (portfolio_id=%s)",
                rows_written, portfolio_id,
            )

            # ── 5. Persist benchmark history ───────────────────────────────────
            if benchmark in closes:
                bench_series = closes[benchmark].dropna()
                bench_series = bench_series[bench_series > 0]

                # Only clear + rewrite if we got fresh data
                if not bench_series.empty:
                    db.query(BenchmarkHistory).filter(
                        BenchmarkHistory.ticker == benchmark
                    ).delete(synchronize_session=False)

                    bench_rows = []
                    for date_idx, price in bench_series.items():
                        date_str = (
                            date_idx.strftime("%Y-%m-%d")
                            if hasattr(date_idx, "strftime")
                            else str(date_idx)[:10]
                        )
                        bench_rows.append(
                            BenchmarkHistory(
                                ticker=benchmark,
                                date=date_str,
                                close_price=float(price),
                            )
                        )
                    db.add_all(bench_rows)
                    db.commit()
                    benchmark_rows = len(bench_rows)
                    logger.info(
                        "Stored %d benchmark history rows (ticker=%s)",
                        benchmark_rows, benchmark,
                    )

        finally:
            db.close()

        note = (
            f"Daily value estimated from current holdings × historical prices. "
            f"Covers {rows_written} trading days. "
            f"Assumes current quantities were held throughout the period."
        )
        set_history_build_status(
            portfolio_id, "done",
            rows_written=rows_written,
            benchmark_rows=benchmark_rows,
            note=note,
        )
        return {
            "rows_written": rows_written,
            "benchmark_rows": benchmark_rows,
            "error": None,
            "note": note,
        }

    except Exception as exc:
        logger.warning(
            "Failed to build portfolio history (portfolio_id=%s): %s",
            portfolio_id, exc, exc_info=True,
        )
        set_history_build_status(portfolio_id, "failed", error=str(exc))
        return {"rows_written": 0, "benchmark_rows": 0, "error": str(exc), "note": None}


def _extract_closes(raw, tickers: list[str]) -> "dict[str, pd.Series]":
    """
    Extract per-ticker Close series from a yfinance download result.

    Handles the three common column layouts:
      (a) Single-ticker: flat columns ['Open', 'High', 'Low', 'Close', 'Volume']
      (b) Multi-ticker, (metric, ticker): raw['Close'] → DataFrame
      (c) Multi-ticker, (ticker, metric): raw[ticker]['Close'] → Series
    """
    import pandas as pd

    closes: dict[str, pd.Series] = {}

    if not isinstance(raw.columns, pd.MultiIndex):
        # Case (a): single ticker download
        if len(tickers) == 1 and "Close" in raw.columns:
            closes[tickers[0]] = raw["Close"].dropna()
        return closes

    # Multi-ticker: inspect outer level of the MultiIndex
    outer_level = raw.columns.get_level_values(0).unique().tolist()

    if "Close" in outer_level:
        # Case (b): columns are (metric, ticker)
        close_df = raw["Close"]
        if isinstance(close_df, pd.Series):
            # Happens when only one ticker is in the MultiIndex
            if len(tickers) == 1:
                closes[tickers[0]] = close_df.dropna()
        else:
            for t in tickers:
                if t in close_df.columns:
                    closes[t] = close_df[t].dropna()
    else:
        # Case (c): columns are (ticker, metric)
        for t in tickers:
            try:
                if t in outer_level:
                    series = raw[t]["Close"] if "Close" in raw[t].columns else None
                    if series is not None:
                        closes[t] = series.dropna()
            except (KeyError, TypeError):
                pass

    return closes


# ─── Read ──────────────────────────────────────────────────────────────────────

def get_portfolio_history(
    portfolio_id: int,
    db: Session,
) -> list[dict]:
    """
    Return [{date, total_value}] sorted oldest → newest.
    Returns empty list if no data has been built yet.
    """
    from app.models.history import PortfolioHistory

    rows = (
        db.query(PortfolioHistory)
        .filter(PortfolioHistory.portfolio_id == portfolio_id)
        .order_by(PortfolioHistory.date.asc())
        .all()
    )
    return [{"date": r.date, "total_value": r.total_value} for r in rows]


def get_benchmark_history(
    ticker: str,
    db: Session,
) -> list[dict]:
    """
    Return [{date, close_price}] for the given benchmark ticker, sorted oldest → newest.
    """
    from app.models.history import BenchmarkHistory

    rows = (
        db.query(BenchmarkHistory)
        .filter(BenchmarkHistory.ticker == ticker)
        .order_by(BenchmarkHistory.date.asc())
        .all()
    )
    return [{"date": r.date, "close_price": r.close_price} for r in rows]


def get_portfolio_history_status(portfolio_id: int, db: Session) -> dict:
    """
    Return a lightweight status dict describing the portfolio history coverage.
    Used by the frontend to decide whether to show the daily chart or snapshot chart.
    """
    from app.models.history import PortfolioHistory

    count = (
        db.query(PortfolioHistory)
        .filter(PortfolioHistory.portfolio_id == portfolio_id)
        .count()
    )
    if count == 0:
        return {"has_data": False, "count": 0, "earliest": None, "latest": None}

    earliest = (
        db.query(PortfolioHistory.date)
        .filter(PortfolioHistory.portfolio_id == portfolio_id)
        .order_by(PortfolioHistory.date.asc())
        .scalar()
    )
    latest = (
        db.query(PortfolioHistory.date)
        .filter(PortfolioHistory.portfolio_id == portfolio_id)
        .order_by(PortfolioHistory.date.desc())
        .scalar()
    )
    return {"has_data": True, "count": count, "earliest": earliest, "latest": latest}
