"""
Sector Enrichment
------------------
Resolves sector, industry, and company name for holdings during upload ingestion.

Fallback chain (in order, per holding):
  1. yfinance fundamentals  — yf.Ticker(variant).info
  2. Financial Modeling Prep (FMP)  — requires FMP_API_KEY in .env
  3. Static sector / name map  — covers ~150 common NSE tickers
  4. "Unknown"  — final fallback — sector is NEVER left as None

Per-holding outcome is tracked in an EnrichmentRecord so the upload response
can report exactly what happened to each ticker.

Visibility:
  - yfinance timeout  → WARNING (previously DEBUG — was invisible)
  - FMP failure       → WARNING (previously DEBUG — was invisible)
  - Static map hit    → INFO
  - Final "Unknown"   → WARNING with ticker + attempted sources listed

Usage:
    from app.ingestion.sector_enrichment import enrich_holdings
    holdings, records, count, note = enrich_holdings(holdings)
"""

from __future__ import annotations

import concurrent.futures
import logging
from dataclasses import dataclass, field
from typing import Optional

from app.schemas.portfolio import HoldingBase

logger = logging.getLogger(__name__)

# Per-ticker yfinance timeout (seconds).
# yf.Ticker().info has no native timeout — without this guard one slow
# ticker can hang the entire enrichment step for the whole portfolio.
_YFINANCE_TIMEOUT_SEC = 5


# ─── EnrichmentRecord ─────────────────────────────────────────────────────────

@dataclass
class EnrichmentRecord:
    """
    Per-holding enrichment outcome.  Carried through to the API response and
    persisted to the DB so the result is transparent and survives restarts.

    sector_status / name_status:
      "from_file"      — value was present in the uploaded file; no enrichment needed
      "yfinance"       — resolved by yfinance
      "fmp"            — resolved by Financial Modeling Prep
      "static_map"     — resolved by the built-in static sector/name map
      "unknown"        — all sources failed; sector set to "Unknown"
      "ticker_fallback"— name set to ticker string as last resort (name_status only)

    attempted_sources: ordered list of sources that were tried for this ticker.
    enrichment_reason: free-text explanation, populated on failure.
    """
    ticker:            str
    normalized_ticker: str                    # yfinance-resolved variant (e.g. "TCS.NS")
    sector_status:     str  = "unknown"       # from_file | yfinance | fmp | static_map | unknown
    name_status:       str  = "ticker_fallback"
    sector_source:     Optional[str] = None   # actual value written (or None if unknown)
    name_source:       Optional[str] = None   # actual value written (or None if fallback)
    industry_source:   Optional[str] = None
    attempted_sources: list[str] = field(default_factory=list)
    enrichment_reason: Optional[str] = None   # populated on failure

    @property
    def fully_enriched(self) -> bool:
        return (
            self.sector_status not in ("unknown",)
            and self.name_status not in ("ticker_fallback",)
        )

    @property
    def partially_enriched(self) -> bool:
        return (
            not self.fully_enriched
            and self.sector_status != "unknown"
            or (self.sector_status == "unknown" and self.name_status not in ("ticker_fallback",))
        )

    def to_dict(self) -> dict:
        return {
            "ticker":            self.ticker,
            "normalized_ticker": self.normalized_ticker,
            "sector_status":     self.sector_status,
            "name_status":       self.name_status,
            "attempted_sources": self.attempted_sources,
            "enrichment_reason": self.enrichment_reason,
        }


# ─── Static maps ──────────────────────────────────────────────────────────────

_STATIC_SECTOR_MAP: dict[str, str] = {
    # ── Information Technology ────────────────────────────────────────────────
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
    # ── Financials ────────────────────────────────────────────────────────────
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
    # ── Energy ────────────────────────────────────────────────────────────────
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
    # ── Consumer Staples ──────────────────────────────────────────────────────
    "HINDUNILVR": "Consumer Staples", "HINDUNILVR.NS": "Consumer Staples",
    "ITC": "Consumer Staples",        "ITC.NS": "Consumer Staples",
    "NESTLEIND": "Consumer Staples",  "NESTLEIND.NS": "Consumer Staples",
    "DABUR": "Consumer Staples",      "DABUR.NS": "Consumer Staples",
    "MARICO": "Consumer Staples",     "MARICO.NS": "Consumer Staples",
    "COLPAL": "Consumer Staples",     "COLPAL.NS": "Consumer Staples",
    "BRITANNIA": "Consumer Staples",  "BRITANNIA.NS": "Consumer Staples",
    "GODREJCP": "Consumer Staples",   "GODREJCP.NS": "Consumer Staples",
    "VBL": "Consumer Staples",        "VBL.NS": "Consumer Staples",
    # ── Consumer Discretionary ────────────────────────────────────────────────
    "MARUTI": "Consumer Discretionary",     "MARUTI.NS": "Consumer Discretionary",
    "M&M": "Consumer Discretionary",        "M&M.NS": "Consumer Discretionary",
    "TATAMOTORS": "Consumer Discretionary", "TATAMOTORS.NS": "Consumer Discretionary",
    "EICHERMOT": "Consumer Discretionary",  "EICHERMOT.NS": "Consumer Discretionary",
    "BAJAJ-AUTO": "Consumer Discretionary", "BAJAJ-AUTO.NS": "Consumer Discretionary",
    "HEROMOTOCO": "Consumer Discretionary", "HEROMOTOCO.NS": "Consumer Discretionary",
    "TITAN": "Consumer Discretionary",      "TITAN.NS": "Consumer Discretionary",
    "ASIANPAINT": "Consumer Discretionary", "ASIANPAINT.NS": "Consumer Discretionary",
    "TRENT": "Consumer Discretionary",      "TRENT.NS": "Consumer Discretionary",
    "ZOMATO": "Consumer Discretionary",     "ZOMATO.NS": "Consumer Discretionary",
    "NYKAA": "Consumer Discretionary",      "NYKAA.NS": "Consumer Discretionary",
    "DMART": "Consumer Discretionary",      "DMART.NS": "Consumer Discretionary",
    # ── Healthcare ────────────────────────────────────────────────────────────
    "SUNPHARMA": "Healthcare",  "SUNPHARMA.NS": "Healthcare",
    "DRREDDY": "Healthcare",    "DRREDDY.NS": "Healthcare",
    "CIPLA": "Healthcare",      "CIPLA.NS": "Healthcare",
    "DIVISLAB": "Healthcare",   "DIVISLAB.NS": "Healthcare",
    "APOLLOHOSP": "Healthcare", "APOLLOHOSP.NS": "Healthcare",
    "LUPIN": "Healthcare",      "LUPIN.NS": "Healthcare",
    "TORNTPHARM": "Healthcare", "TORNTPHARM.NS": "Healthcare",
    "ALKEM": "Healthcare",      "ALKEM.NS": "Healthcare",
    "MAXHEALTH": "Healthcare",  "MAXHEALTH.NS": "Healthcare",
    # ── Industrials ───────────────────────────────────────────────────────────
    "LT": "Industrials",         "LT.NS": "Industrials",
    "ULTRACEMCO": "Industrials", "ULTRACEMCO.NS": "Industrials",
    "ADANIENT": "Industrials",   "ADANIENT.NS": "Industrials",
    "ADANIPORTS": "Industrials", "ADANIPORTS.NS": "Industrials",
    "SIEMENS": "Industrials",    "SIEMENS.NS": "Industrials",
    "ABB": "Industrials",        "ABB.NS": "Industrials",
    "BHEL": "Industrials",       "BHEL.NS": "Industrials",
    "HAL": "Industrials",        "HAL.NS": "Industrials",
    "BEL": "Industrials",        "BEL.NS": "Industrials",
    "SCHAEFFLER": "Industrials", "SCHAEFFLER.NS": "Industrials",
    # ── Materials ─────────────────────────────────────────────────────────────
    "TATASTEEL": "Materials",  "TATASTEEL.NS": "Materials",
    "JSWSTEEL": "Materials",   "JSWSTEEL.NS": "Materials",
    "HINDALCO": "Materials",   "HINDALCO.NS": "Materials",
    "VEDL": "Materials",       "VEDL.NS": "Materials",
    "COALINDIA": "Materials",  "COALINDIA.NS": "Materials",
    "NMDC": "Materials",       "NMDC.NS": "Materials",
    "SHREECEM": "Materials",   "SHREECEM.NS": "Materials",
    "ACC": "Materials",        "ACC.NS": "Materials",
    "AMBUJA": "Materials",     "AMBUJA.NS": "Materials",
    # ── Communication Services ────────────────────────────────────────────────
    "BHARTIARTL": "Communication Services", "BHARTIARTL.NS": "Communication Services",
    "VODAFONE": "Communication Services",
    "DEN": "Communication Services",
    "ZEEL": "Communication Services",  "ZEEL.NS": "Communication Services",
    # ── Real Estate ───────────────────────────────────────────────────────────
    "DLF": "Real Estate",        "DLF.NS": "Real Estate",
    "GODREJPROP": "Real Estate", "GODREJPROP.NS": "Real Estate",
    "OBEROIRLTY": "Real Estate", "OBEROIRLTY.NS": "Real Estate",
    "PRESTIGE": "Real Estate",   "PRESTIGE.NS": "Real Estate",
    "LODHA": "Real Estate",      "LODHA.NS": "Real Estate",
    "BRIGADE": "Real Estate",    "BRIGADE.NS": "Real Estate",
}

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

_STATIC_INDUSTRY_MAP: dict[str, str] = {
    "TCS": "IT Services & Consulting",    "TCS.NS": "IT Services & Consulting",
    "INFY": "IT Services & Consulting",   "INFY.NS": "IT Services & Consulting",
    "WIPRO": "IT Services & Consulting",  "WIPRO.NS": "IT Services & Consulting",
    "HCLTECH": "IT Services & Consulting","HCLTECH.NS": "IT Services & Consulting",
    "HDFCBANK": "Private Sector Bank",    "HDFCBANK.NS": "Private Sector Bank",
    "ICICIBANK": "Private Sector Bank",   "ICICIBANK.NS": "Private Sector Bank",
    "KOTAKBANK": "Private Sector Bank",   "KOTAKBANK.NS": "Private Sector Bank",
    "SBIN": "Public Sector Bank",         "SBIN.NS": "Public Sector Bank",
    "AXISBANK": "Private Sector Bank",    "AXISBANK.NS": "Private Sector Bank",
    "RELIANCE": "Oil Refining & Marketing","RELIANCE.NS": "Oil Refining & Marketing",
    "LT": "Construction & Engineering",   "LT.NS": "Construction & Engineering",
    "SUNPHARMA": "Pharmaceuticals",       "SUNPHARMA.NS": "Pharmaceuticals",
    "BAJFINANCE": "NBFC",                 "BAJFINANCE.NS": "NBFC",
    "HINDUNILVR": "FMCG",                 "HINDUNILVR.NS": "FMCG",
    "ITC": "Diversified FMCG",            "ITC.NS": "Diversified FMCG",
}


def _lookup_static(ticker: str) -> tuple[Optional[str], Optional[str], Optional[str]]:
    """Return (sector, name, industry) from static maps, or (None, None, None)."""
    upper = ticker.upper()
    return (
        _STATIC_SECTOR_MAP.get(upper),
        _STATIC_NAME_MAP.get(upper),
        _STATIC_INDUSTRY_MAP.get(upper),
    )


# ─── Main enrichment function ─────────────────────────────────────────────────

def enrich_holdings(
    holdings: list[HoldingBase],
) -> tuple[list[HoldingBase], list[EnrichmentRecord], int, Optional[str]]:
    """
    Enrich holdings that are missing sector, industry, or have name == ticker.

    Fallback chain per holding (stopped as soon as all fields are resolved):
      1. yfinance fundamentals (if available)
      2. FMP fundamentals      (if FMP_API_KEY is set)
      3. Static sector/name/industry map
      4. sector="Unknown", name=ticker (final — never leaves sector as None)

    Per-holding outcome recorded in EnrichmentRecord.

    Returns:
        (enriched_holdings, records, enriched_count, human_readable_note)

    Never raises — all exceptions are caught and logged.
    """
    needs_enrichment = [
        (i, h) for i, h in enumerate(holdings)
        if not h.sector or not h.industry or not h.name or h.name == h.ticker
    ]

    records: list[EnrichmentRecord] = []

    # Holdings that don't need enrichment still get a "from_file" record
    for i, h in enumerate(holdings):
        if (i, h) not in [(ni, nh) for ni, nh in needs_enrichment]:
            records.append(EnrichmentRecord(
                ticker=h.ticker,
                normalized_ticker=h.ticker,
                sector_status="from_file" if h.sector else "unknown",
                name_status="from_file" if (h.name and h.name != h.ticker) else "ticker_fallback",
                sector_source=h.sector,
                name_source=h.name,
            ))

    if not needs_enrichment:
        return holdings, records, 0, None

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

    enriched_count  = 0
    result = list(holdings)

    for idx, h in needs_enrichment:
        rec = EnrichmentRecord(
            ticker=h.ticker,
            normalized_ticker=h.ticker,   # will be updated if yfinance resolves a variant
        )

        needs_sector   = not h.sector
        needs_name     = not h.name or h.name == h.ticker
        needs_industry = not h.industry

        # Pre-fill status for fields already present in the file
        if not needs_sector:
            rec.sector_status = "from_file"
            rec.sector_source = h.sector
        if not needs_name:
            rec.name_status = "from_file"
            rec.name_source = h.name
        if not needs_industry:
            rec.industry_source = h.industry

        updates: dict[str, str] = {}

        # ── Step 1: yfinance ──────────────────────────────────────────────────
        if yfinance_ok and _fetch_fundamentals_single:
            rec.attempted_sources.append("yfinance")
            try:
                cached = _fund_from_cache(h.ticker) if _fund_from_cache else None
                if cached:
                    fund = cached
                else:
                    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as ex:
                        fut = ex.submit(_fetch_fundamentals_single, h.ticker)
                        try:
                            fund = fut.result(timeout=_YFINANCE_TIMEOUT_SEC)
                        except concurrent.futures.TimeoutError:
                            logger.warning(
                                "yfinance timeout (%ds) for %s — trying FMP/static map",
                                _YFINANCE_TIMEOUT_SEC, h.ticker,
                            )
                            fund = {}

                if fund and fund.get("source") not in ("yfinance_error", "unavailable", None):
                    # Record the resolved ticker variant (e.g. bare "TCS" → "TCS.NS")
                    if fund.get("resolved_ticker"):
                        rec.normalized_ticker = fund["resolved_ticker"]

                    if needs_sector and fund.get("sector"):
                        updates["sector"] = fund["sector"]
                        rec.sector_status = "yfinance"
                        rec.sector_source = fund["sector"]
                        needs_sector = False

                    if needs_name and (fund.get("longName") or fund.get("name")):
                        n = fund.get("longName") or fund.get("name")
                        updates["name"] = n
                        rec.name_status = "yfinance"
                        rec.name_source = n
                        needs_name = False

                    if needs_industry and fund.get("industry"):
                        updates["industry"] = fund["industry"]
                        rec.industry_source = fund["industry"]
                        needs_industry = False

                    if _store_fund and fund:
                        _store_fund(h.ticker, fund)

            except Exception as exc:
                logger.warning("yfinance enrichment failed for %s: %s", h.ticker, exc)

        # ── Step 2: FMP ───────────────────────────────────────────────────────
        if _fetch_fmp_fundamentals and (needs_sector or needs_name or needs_industry):
            rec.attempted_sources.append("fmp")
            try:
                fmp = _fetch_fmp_fundamentals(h.ticker)
                if fmp:
                    if needs_sector and fmp.get("sector"):
                        updates["sector"] = fmp["sector"]
                        rec.sector_status = "fmp"
                        rec.sector_source = fmp["sector"]
                        needs_sector = False
                    if needs_name and fmp.get("companyName"):
                        updates["name"] = fmp["companyName"]
                        rec.name_status = "fmp"
                        rec.name_source = fmp["companyName"]
                        needs_name = False
                    if needs_industry and fmp.get("industry"):
                        updates["industry"] = fmp["industry"]
                        rec.industry_source = fmp["industry"]
                        needs_industry = False
            except Exception as exc:
                logger.warning("FMP enrichment failed for %s: %s", h.ticker, exc)

        # ── Step 3: static map ────────────────────────────────────────────────
        if needs_sector or needs_name or needs_industry:
            static_sector, static_name, static_industry = _lookup_static(h.ticker)

            if needs_sector and static_sector:
                updates["sector"] = static_sector
                rec.sector_status = "static_map"
                rec.sector_source = static_sector
                needs_sector = False
                logger.info("Sector for %s resolved from static map: %s", h.ticker, static_sector)

            if needs_name and static_name:
                updates["name"] = static_name
                rec.name_status = "static_map"
                rec.name_source = static_name
                needs_name = False

            if needs_industry and static_industry:
                updates["industry"] = static_industry
                rec.industry_source = static_industry
                needs_industry = False

            if static_sector or static_name or static_industry:
                rec.attempted_sources.append("static_map")

        # ── Step 4: final fallbacks ───────────────────────────────────────────
        if needs_sector:
            updates["sector"] = "Unknown"
            rec.sector_status = "unknown"
            rec.enrichment_reason = (
                f"Tried: {', '.join(rec.attempted_sources) or 'none'}. "
                f"Sector unavailable. Check ticker format — e.g. add .NS for NSE."
            )
            logger.warning(
                "Sector unresolved for %s (tried %s) — set to 'Unknown'",
                h.ticker, rec.attempted_sources or "no sources",
            )

        if needs_name:
            # name = ticker is acceptable as a last resort; the holding still loads
            rec.name_status = "ticker_fallback"

        if updates:
            result[idx] = h.model_copy(update=updates)
            enriched_count += 1

        records.append(rec)

    # ── Build summary note ────────────────────────────────────────────────────
    unknown = [r.ticker for r in records if r.sector_status == "unknown"]
    fully   = sum(1 for r in records if r.fully_enriched)
    note: Optional[str] = None

    if enriched_count > 0 and not unknown:
        note = (
            f"{enriched_count} holding(s) enriched with sector/company data. "
            f"All sectors resolved."
        )
    elif enriched_count > 0 and unknown:
        note = (
            f"{enriched_count} holding(s) enriched. "
            f"Sector could not be resolved for: {', '.join(unknown)}. "
            f"These show as 'Unknown'. Verify ticker format (add .NS for NSE)."
        )
    elif unknown:
        note = (
            f"Could not resolve sector for: {', '.join(unknown)}. "
            f"These show as 'Unknown'. Verify ticker format (add .NS for NSE)."
        )

    logger.info(
        "Enrichment complete: %d/%d rows updated, %d fully enriched, unknown=%s",
        enriched_count, len(needs_enrichment), fully, unknown or "none",
    )
    return result, records, enriched_count, note
