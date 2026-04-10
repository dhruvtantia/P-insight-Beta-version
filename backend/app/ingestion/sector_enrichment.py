"""
Sector Enrichment
------------------
Resolves sector and company name for holdings during upload ingestion.

Fallback chain (in order):
  1. yfinance fundamentals (LiveAPIProvider)
  2. Financial Modeling Prep (FMP) — requires FMP_API_KEY
  3. Static sector map for common NSE tickers
  4. "Unknown" (final fallback — never leaves sector as None)

This module is called from the /upload/confirm endpoint after normalisation.
Import is never blocked by enrichment failures; any exception is logged and
"Unknown" is used instead.

Usage:
    from app.ingestion.sector_enrichment import enrich_holdings
    enriched_holdings, count, note = enrich_holdings(holdings)
"""

from __future__ import annotations

import concurrent.futures
import logging
from typing import Optional

from app.schemas.portfolio import HoldingBase

# Per-ticker yfinance timeout.  yf.Ticker().info has no native timeout; without
# this guard a single slow/ratelimited ticker can hang the whole enrichment step.
_YFINANCE_TIMEOUT_SEC = 5

logger = logging.getLogger(__name__)

# ─── Static sector map (NSE tickers, no ".NS" suffix required) ───────────────
# Covers the most common NIFTY 50 / NIFTY 100 tickers.
# Used as a last resort when both yfinance and FMP fail.
# Ticker keys are uppercased, with and without ".NS".

_STATIC_SECTOR_MAP: dict[str, str] = {
    # ── Information Technology ───────────────────────────────────────────────
    "TCS": "Information Technology",     "TCS.NS": "Information Technology",
    "INFY": "Information Technology",    "INFY.NS": "Information Technology",
    "WIPRO": "Information Technology",   "WIPRO.NS": "Information Technology",
    "HCLTECH": "Information Technology", "HCLTECH.NS": "Information Technology",
    "TECHM": "Information Technology",   "TECHM.NS": "Information Technology",
    "LTIM": "Information Technology",    "LTIM.NS": "Information Technology",
    "LTIMINDTREE": "Information Technology", "LTIMINDTREE.NS": "Information Technology",
    "COFORGE": "Information Technology", "COFORGE.NS": "Information Technology",
    "PERSISTENT": "Information Technology", "PERSISTENT.NS": "Information Technology",
    "MPHASIS": "Information Technology", "MPHASIS.NS": "Information Technology",
    "HEXAWARE": "Information Technology",
    # ── Financials ───────────────────────────────────────────────────────────
    "HDFCBANK": "Financials",    "HDFCBANK.NS": "Financials",
    "ICICIBANK": "Financials",   "ICICIBANK.NS": "Financials",
    "KOTAKBANK": "Financials",   "KOTAKBANK.NS": "Financials",
    "SBIN": "Financials",        "SBIN.NS": "Financials",
    "AXISBANK": "Financials",    "AXISBANK.NS": "Financials",
    "INDUSINDBK": "Financials",  "INDUSINDBK.NS": "Financials",
    "BAJFINANCE": "Financials",  "BAJFINANCE.NS": "Financials",
    "BAJAJFINSV": "Financials",  "BAJAJFINSV.NS": "Financials",
    "SBICARD": "Financials",     "SBICARD.NS": "Financials",
    "HDFCLIFE": "Financials",    "HDFCLIFE.NS": "Financials",
    "ICICIPRU": "Financials",    "ICICIPRU.NS": "Financials",
    "SBILIFE": "Financials",     "SBILIFE.NS": "Financials",
    "CHOLAFIN": "Financials",    "CHOLAFIN.NS": "Financials",
    "M&MFIN": "Financials",      "M&MFIN.NS": "Financials",
    "PFC": "Financials",         "PFC.NS": "Financials",
    "RECLTD": "Financials",      "RECLTD.NS": "Financials",
    # ── Energy ───────────────────────────────────────────────────────────────
    "RELIANCE": "Energy",        "RELIANCE.NS": "Energy",
    "ONGC": "Energy",            "ONGC.NS": "Energy",
    "BPCL": "Energy",            "BPCL.NS": "Energy",
    "IOC": "Energy",             "IOC.NS": "Energy",
    "POWERGRID": "Utilities",    "POWERGRID.NS": "Utilities",
    "NTPC": "Utilities",         "NTPC.NS": "Utilities",
    "ADANIGREEN": "Utilities",   "ADANIGREEN.NS": "Utilities",
    "ADANIPOWER": "Utilities",   "ADANIPOWER.NS": "Utilities",
    "TATAPOWER": "Utilities",    "TATAPOWER.NS": "Utilities",
    "TORNTPOWER": "Utilities",   "TORNTPOWER.NS": "Utilities",
    # ── Consumer Staples ─────────────────────────────────────────────────────
    "HINDUNILVR": "Consumer Staples", "HINDUNILVR.NS": "Consumer Staples",
    "ITC": "Consumer Staples",        "ITC.NS": "Consumer Staples",
    "NESTLEIND": "Consumer Staples",  "NESTLEIND.NS": "Consumer Staples",
    "DABUR": "Consumer Staples",      "DABUR.NS": "Consumer Staples",
    "MARICO": "Consumer Staples",     "MARICO.NS": "Consumer Staples",
    "COLPAL": "Consumer Staples",     "COLPAL.NS": "Consumer Staples",
    "BRITANNIA": "Consumer Staples",  "BRITANNIA.NS": "Consumer Staples",
    "GODREJCP": "Consumer Staples",   "GODREJCP.NS": "Consumer Staples",
    "VBL": "Consumer Staples",        "VBL.NS": "Consumer Staples",
    # ── Consumer Discretionary ───────────────────────────────────────────────
    "MARUTI": "Consumer Discretionary",    "MARUTI.NS": "Consumer Discretionary",
    "M&M": "Consumer Discretionary",       "M&M.NS": "Consumer Discretionary",
    "TATAMOTORS": "Consumer Discretionary","TATAMOTORS.NS": "Consumer Discretionary",
    "EICHERMOT": "Consumer Discretionary", "EICHERMOT.NS": "Consumer Discretionary",
    "BAJAJ-AUTO": "Consumer Discretionary","BAJAJ-AUTO.NS": "Consumer Discretionary",
    "HEROMOTOCO": "Consumer Discretionary","HEROMOTOCO.NS": "Consumer Discretionary",
    "TITAN": "Consumer Discretionary",     "TITAN.NS": "Consumer Discretionary",
    "ASIANPAINT": "Consumer Discretionary","ASIANPAINT.NS": "Consumer Discretionary",
    "TRENT": "Consumer Discretionary",     "TRENT.NS": "Consumer Discretionary",
    "ZOMATO": "Consumer Discretionary",    "ZOMATO.NS": "Consumer Discretionary",
    "NYKAA": "Consumer Discretionary",     "NYKAA.NS": "Consumer Discretionary",
    "DMART": "Consumer Discretionary",     "DMART.NS": "Consumer Discretionary",
    # ── Healthcare ───────────────────────────────────────────────────────────
    "SUNPHARMA": "Healthcare",    "SUNPHARMA.NS": "Healthcare",
    "DRREDDY": "Healthcare",      "DRREDDY.NS": "Healthcare",
    "CIPLA": "Healthcare",        "CIPLA.NS": "Healthcare",
    "DIVISLAB": "Healthcare",     "DIVISLAB.NS": "Healthcare",
    "APOLLOHOSP": "Healthcare",   "APOLLOHOSP.NS": "Healthcare",
    "LUPIN": "Healthcare",        "LUPIN.NS": "Healthcare",
    "TORNTPHARM": "Healthcare",   "TORNTPHARM.NS": "Healthcare",
    "ALKEM": "Healthcare",        "ALKEM.NS": "Healthcare",
    "MAXHEALTH": "Healthcare",    "MAXHEALTH.NS": "Healthcare",
    # ── Industrials ──────────────────────────────────────────────────────────
    "LT": "Industrials",           "LT.NS": "Industrials",
    "ULTRACEMCO": "Industrials",   "ULTRACEMCO.NS": "Industrials",
    "ADANIENT": "Industrials",     "ADANIENT.NS": "Industrials",
    "ADANIPORTS": "Industrials",   "ADANIPORTS.NS": "Industrials",
    "SIEMENS": "Industrials",      "SIEMENS.NS": "Industrials",
    "ABB": "Industrials",          "ABB.NS": "Industrials",
    "BHEL": "Industrials",         "BHEL.NS": "Industrials",
    "HAL": "Industrials",          "HAL.NS": "Industrials",
    "BEL": "Industrials",          "BEL.NS": "Industrials",
    "SCHAEFFLER": "Industrials",   "SCHAEFFLER.NS": "Industrials",
    # ── Materials ────────────────────────────────────────────────────────────
    "TATASTEEL": "Materials",   "TATASTEEL.NS": "Materials",
    "JSWSTEEL": "Materials",    "JSWSTEEL.NS": "Materials",
    "HINDALCO": "Materials",    "HINDALCO.NS": "Materials",
    "VEDL": "Materials",        "VEDL.NS": "Materials",
    "COALINDIA": "Materials",   "COALINDIA.NS": "Materials",
    "NMDC": "Materials",        "NMDC.NS": "Materials",
    "SHREECEM": "Materials",    "SHREECEM.NS": "Materials",
    "ACC": "Materials",         "ACC.NS": "Materials",
    "AMBUJA": "Materials",      "AMBUJA.NS": "Materials",
    # ── Communication Services ───────────────────────────────────────────────
    "BHARTIARTL": "Communication Services", "BHARTIARTL.NS": "Communication Services",
    "VODAFONE": "Communication Services",
    "DEN": "Communication Services",
    "ZEEL": "Communication Services",  "ZEEL.NS": "Communication Services",
    # ── Real Estate ──────────────────────────────────────────────────────────
    "DLF": "Real Estate",          "DLF.NS": "Real Estate",
    "GODREJPROP": "Real Estate",   "GODREJPROP.NS": "Real Estate",
    "OBEROIRLTY": "Real Estate",   "OBEROIRLTY.NS": "Real Estate",
    "PRESTIGE": "Real Estate",     "PRESTIGE.NS": "Real Estate",
    "LODHA": "Real Estate",        "LODHA.NS": "Real Estate",
    "BRIGADE": "Real Estate",      "BRIGADE.NS": "Real Estate",
}

# ─── Static company-name map (subset of common tickers) ──────────────────────

_STATIC_NAME_MAP: dict[str, str] = {
    "TCS": "Tata Consultancy Services",          "TCS.NS": "Tata Consultancy Services",
    "INFY": "Infosys",                            "INFY.NS": "Infosys",
    "WIPRO": "Wipro",                             "WIPRO.NS": "Wipro",
    "HCLTECH": "HCL Technologies",               "HCLTECH.NS": "HCL Technologies",
    "TECHM": "Tech Mahindra",                    "TECHM.NS": "Tech Mahindra",
    "RELIANCE": "Reliance Industries",           "RELIANCE.NS": "Reliance Industries",
    "HDFCBANK": "HDFC Bank",                     "HDFCBANK.NS": "HDFC Bank",
    "ICICIBANK": "ICICI Bank",                   "ICICIBANK.NS": "ICICI Bank",
    "KOTAKBANK": "Kotak Mahindra Bank",          "KOTAKBANK.NS": "Kotak Mahindra Bank",
    "SBIN": "State Bank of India",               "SBIN.NS": "State Bank of India",
    "AXISBANK": "Axis Bank",                     "AXISBANK.NS": "Axis Bank",
    "BAJFINANCE": "Bajaj Finance",               "BAJFINANCE.NS": "Bajaj Finance",
    "HINDUNILVR": "Hindustan Unilever",          "HINDUNILVR.NS": "Hindustan Unilever",
    "ITC": "ITC Limited",                        "ITC.NS": "ITC Limited",
    "NESTLEIND": "Nestle India",                 "NESTLEIND.NS": "Nestle India",
    "LT": "Larsen & Toubro",                     "LT.NS": "Larsen & Toubro",
    "SUNPHARMA": "Sun Pharmaceutical",           "SUNPHARMA.NS": "Sun Pharmaceutical",
    "MARUTI": "Maruti Suzuki India",             "MARUTI.NS": "Maruti Suzuki India",
    "TITAN": "Titan Company",                    "TITAN.NS": "Titan Company",
    "ASIANPAINT": "Asian Paints",                "ASIANPAINT.NS": "Asian Paints",
    "BHARTIARTL": "Bharti Airtel",               "BHARTIARTL.NS": "Bharti Airtel",
    "NTPC": "NTPC Limited",                      "NTPC.NS": "NTPC Limited",
    "POWERGRID": "Power Grid Corporation",       "POWERGRID.NS": "Power Grid Corporation",
    "ONGC": "Oil and Natural Gas Corporation",   "ONGC.NS": "Oil and Natural Gas Corporation",
    "M&M": "Mahindra & Mahindra",               "M&M.NS": "Mahindra & Mahindra",
    "ADANIENT": "Adani Enterprises",             "ADANIENT.NS": "Adani Enterprises",
    "ADANIPORTS": "Adani Ports & SEZ",           "ADANIPORTS.NS": "Adani Ports & SEZ",
    "COALINDIA": "Coal India",                   "COALINDIA.NS": "Coal India",
    "JSWSTEEL": "JSW Steel",                     "JSWSTEEL.NS": "JSW Steel",
    "TATASTEEL": "Tata Steel",                   "TATASTEEL.NS": "Tata Steel",
    "TATAMOTORS": "Tata Motors",                 "TATAMOTORS.NS": "Tata Motors",
    "LTIM": "LTIMindtree",                       "LTIM.NS": "LTIMindtree",
    "DLF": "DLF Limited",                        "DLF.NS": "DLF Limited",
    "BAJAJ-AUTO": "Bajaj Auto",                  "BAJAJ-AUTO.NS": "Bajaj Auto",
    "EICHERMOT": "Eicher Motors",               "EICHERMOT.NS": "Eicher Motors",
    "ZOMATO": "Zomato",                          "ZOMATO.NS": "Zomato",
    "HAL": "Hindustan Aeronautics",              "HAL.NS": "Hindustan Aeronautics",
    "BEL": "Bharat Electronics",                 "BEL.NS": "Bharat Electronics",
}


def _lookup_static(ticker: str) -> tuple[Optional[str], Optional[str]]:
    """Return (sector, name) from the static maps, or (None, None) if not found."""
    upper = ticker.upper()
    sector = _STATIC_SECTOR_MAP.get(upper)
    name   = _STATIC_NAME_MAP.get(upper)
    return sector, name


def enrich_holdings(
    holdings: list[HoldingBase],
) -> tuple[list[HoldingBase], int, Optional[str]]:
    """
    Enrich holdings that are missing sector or have name == ticker.

    Fallback chain per holding:
      1. yfinance fundamentals (if available)
      2. FMP fundamentals      (if FMP_API_KEY is set)
      3. Static sector/name map
      4. sector="Unknown", name=ticker (final fallback)

    Returns:
        (enriched_holdings, enriched_count, human_readable_note)

    Never raises — all exceptions are caught and logged.
    """
    needs_enrichment = [
        (i, h) for i, h in enumerate(holdings)
        if not h.sector or not h.name or h.name == h.ticker
    ]

    if not needs_enrichment:
        return holdings, 0, None

    enriched_count  = 0
    unenriched: list[str] = []
    result = list(holdings)

    # Lazy-import live provider helpers to avoid circular imports
    try:
        from app.data_providers.live_provider import (
            YFINANCE_AVAILABLE,
            _fetch_fundamentals_single,
            _fetch_fmp_fundamentals,
            _fund_from_cache,
            _store_fund,
        )
        yfinance_ok = YFINANCE_AVAILABLE
    except ImportError:
        yfinance_ok = False
        _fetch_fundamentals_single = None  # type: ignore[assignment]
        _fetch_fmp_fundamentals    = None  # type: ignore[assignment]
        _fund_from_cache           = None  # type: ignore[assignment]
        _store_fund                = None  # type: ignore[assignment]

    for idx, h in needs_enrichment:
        updates: dict[str, str] = {}

        # ── Step 1: yfinance ──────────────────────────────────────────────────
        if yfinance_ok and _fetch_fundamentals_single:
            try:
                cached = _fund_from_cache(h.ticker) if _fund_from_cache else None
                if cached:
                    fund = cached
                else:
                    # Enforce a hard timeout: yf.Ticker().info can hang if yfinance
                    # is rate-limited or the network is slow.  We run it in a
                    # fresh single-worker pool so we can cancel via timeout.
                    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as _exe:
                        _fut = _exe.submit(_fetch_fundamentals_single, h.ticker)
                        try:
                            fund = _fut.result(timeout=_YFINANCE_TIMEOUT_SEC)
                        except concurrent.futures.TimeoutError:
                            logger.debug(
                                "yfinance timeout (%ds) for %s — falling back to static map",
                                _YFINANCE_TIMEOUT_SEC, h.ticker,
                            )
                            fund = {}
                if fund and fund.get("source") not in ("yfinance_error", "unavailable", None):
                    if not h.sector and fund.get("sector"):
                        updates["sector"] = fund["sector"]
                    if (not h.name or h.name == h.ticker) and (fund.get("longName") or fund.get("name")):
                        updates["name"] = fund.get("longName") or fund.get("name")
                    if _store_fund and fund:
                        _store_fund(h.ticker, fund)
            except Exception as exc:
                logger.debug("yfinance enrichment failed for %s: %s", h.ticker, exc)

        # ── Step 2: FMP (if yfinance didn't fill everything) ─────────────────
        if _fetch_fmp_fundamentals and (not updates.get("sector") and not h.sector):
            try:
                fmp_data = _fetch_fmp_fundamentals(h.ticker)
                if fmp_data and fmp_data.get("sector"):
                    updates["sector"] = fmp_data["sector"]
                if fmp_data and (not updates.get("name") and not h.name or h.name == h.ticker):
                    if fmp_data.get("companyName"):
                        updates["name"] = fmp_data["companyName"]
            except Exception as exc:
                logger.debug("FMP enrichment failed for %s: %s", h.ticker, exc)

        # ── Step 3: static map ───────────────────────────────────────────────
        if not updates.get("sector") and not h.sector:
            static_sector, static_name = _lookup_static(h.ticker)
            if static_sector:
                updates["sector"] = static_sector
                logger.debug("Sector for %s resolved from static map: %s", h.ticker, static_sector)
            if static_name and (not h.name or h.name == h.ticker) and not updates.get("name"):
                updates["name"] = static_name

        # ── Step 4: final fallback ───────────────────────────────────────────
        if not updates.get("sector") and not h.sector:
            updates["sector"] = "Unknown"
            unenriched.append(h.ticker)

        if updates:
            result[idx] = h.model_copy(update=updates)
            enriched_count += 1

    # Build human-readable enrichment note
    enrichment_note: Optional[str] = None
    if enriched_count > 0 and not unenriched:
        enrichment_note = (
            f"{enriched_count} holding(s) enriched with sector/company data. "
            f"Source: Yahoo Finance, static sector map."
        )
    elif enriched_count > 0 and unenriched:
        enrichment_note = (
            f"{enriched_count} holding(s) enriched. "
            f"Sector unavailable from any source for: {', '.join(unenriched)}. "
            f"These show as 'Unknown'."
        )
    elif unenriched:
        enrichment_note = (
            f"Could not resolve sector for: {', '.join(unenriched)}. "
            f"These show as 'Unknown'. Check ticker format (e.g. add '.NS' for NSE tickers)."
        )

    logger.info(
        "Sector enrichment: %d/%d enriched, unenriched=%s",
        enriched_count, len(needs_enrichment), unenriched or "none",
    )
    return result, enriched_count, enrichment_note
