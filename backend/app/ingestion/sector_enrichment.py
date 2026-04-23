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

    fundamentals_status:
      "fetched"        — yfinance returned full fundamentals; stored in cache
      "unavailable"    — yfinance failed or not installed
      "pending"        — not attempted (e.g. no enrichment needed for this holding)

    enrichment_status (overall):
      "enriched"       — sector + name both resolved; fundamentals fetched
      "partial"        — sector or name unknown, OR fundamentals unavailable
      "failed"         — sector unknown AND name is ticker fallback

    attempted_sources: ordered list of sources that were tried for this ticker.
    enrichment_reason: free-text explanation, populated on failure.
    last_enriched_at:  unix timestamp when enrichment completed.
    """
    ticker:              str
    normalized_ticker:   str                    # yfinance-resolved variant (e.g. "TCS.NS")
    sector_status:       str  = "unknown"       # from_file | yfinance | fmp | static_map | unknown
    name_status:         str  = "ticker_fallback"
    sector_source:       Optional[str] = None   # actual value written (or None if unknown)
    name_source:         Optional[str] = None   # actual value written (or None if fallback)
    industry_source:     Optional[str] = None
    attempted_sources:   list[str] = field(default_factory=list)
    enrichment_reason:   Optional[str] = None   # populated on failure
    fundamentals_status: str  = "pending"       # fetched | unavailable | pending
    last_enriched_at:    Optional[float] = None # unix timestamp

    @property
    def enrichment_status(self) -> str:
        """Overall enrichment quality — persisted to DB as enrichment_status."""
        sector_ok = self.sector_status not in ("unknown",)
        name_ok   = self.name_status not in ("ticker_fallback",)
        # ETFs and similar instruments intentionally skip fundamentals
        fund_ok   = self.fundamentals_status in ("fetched", "not_applicable")
        if sector_ok and name_ok and fund_ok:
            return "enriched"
        if not sector_ok and not name_ok:
            return "failed"
        return "partial"

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
            "ticker":              self.ticker,
            "normalized_ticker":   self.normalized_ticker,
            "sector_status":       self.sector_status,
            "name_status":         self.name_status,
            "attempted_sources":   self.attempted_sources,
            "enrichment_reason":   self.enrichment_reason,
            "fundamentals_status": self.fundamentals_status,
            "enrichment_status":   self.enrichment_status,
        }


# ─── Static maps ──────────────────────────────────────────────────────────────

_STATIC_SECTOR_MAP: dict[str, str] = {
    # ── Information Technology ────────────────────────────────────────────────
    "TCS": "Information Technology",         "TCS.NS": "Information Technology",
    "INFY": "Information Technology",        "INFY.NS": "Information Technology",
    "WIPRO": "Information Technology",       "WIPRO.NS": "Information Technology",
    "HCLTECH": "Information Technology",     "HCLTECH.NS": "Information Technology",
    "TECHM": "Information Technology",       "TECHM.NS": "Information Technology",
    "LTIM": "Information Technology",        "LTIM.NS": "Information Technology",
    "LTIMINDTREE": "Information Technology", "LTIMINDTREE.NS": "Information Technology",
    "COFORGE": "Information Technology",     "COFORGE.NS": "Information Technology",
    "PERSISTENT": "Information Technology",  "PERSISTENT.NS": "Information Technology",
    "MPHASIS": "Information Technology",     "MPHASIS.NS": "Information Technology",
    "HEXAWARE": "Information Technology",    "HEXAWARE.NS": "Information Technology",
    "KPITTECH": "Information Technology",    "KPITTECH.NS": "Information Technology",
    "TATAELXSI": "Information Technology",   "TATAELXSI.NS": "Information Technology",
    "TANLA": "Information Technology",       "TANLA.NS": "Information Technology",
    "ROUTE": "Information Technology",       "ROUTE.NS": "Information Technology",
    "MASTEK": "Information Technology",      "MASTEK.NS": "Information Technology",
    "ECLERX": "Information Technology",      "ECLERX.NS": "Information Technology",
    "SONATSOFTW": "Information Technology",  "SONATSOFTW.NS": "Information Technology",
    "RATEGAIN": "Information Technology",    "RATEGAIN.NS": "Information Technology",
    "INTELLECT": "Information Technology",   "INTELLECT.NS": "Information Technology",
    "LATENTVIEW": "Information Technology",  "LATENTVIEW.NS": "Information Technology",
    "HAPPYMINDS": "Information Technology",  "HAPPYMINDS.NS": "Information Technology",
    "BIRLASOFT": "Information Technology",   "BIRLASOFT.NS": "Information Technology",
    "FSL": "Information Technology",         "FSL.NS": "Information Technology",
    "KAYNES": "Information Technology",      "KAYNES.NS": "Information Technology",
    "DIXON": "Information Technology",       "DIXON.NS": "Information Technology",
    "REDINGTON": "Information Technology",   "REDINGTON.NS": "Information Technology",
    "ZENSARTECH": "Information Technology",  "ZENSARTECH.NS": "Information Technology",
    "CYIENT": "Information Technology",      "CYIENT.NS": "Information Technology",
    "OFSS": "Information Technology",        "OFSS.NS": "Information Technology",
    # ── Financials — Banks ────────────────────────────────────────────────────
    "HDFCBANK": "Financials",    "HDFCBANK.NS": "Financials",
    "ICICIBANK": "Financials",   "ICICIBANK.NS": "Financials",
    "KOTAKBANK": "Financials",   "KOTAKBANK.NS": "Financials",
    "SBIN": "Financials",        "SBIN.NS": "Financials",
    "AXISBANK": "Financials",    "AXISBANK.NS": "Financials",
    "INDUSINDBK": "Financials",  "INDUSINDBK.NS": "Financials",
    "PNB": "Financials",         "PNB.NS": "Financials",
    "BANKBARODA": "Financials",  "BANKBARODA.NS": "Financials",
    "FEDERALBNK": "Financials",  "FEDERALBNK.NS": "Financials",
    "IDFCFIRSTB": "Financials",  "IDFCFIRSTB.NS": "Financials",
    "RBLBANK": "Financials",     "RBLBANK.NS": "Financials",
    "BANDHANBNK": "Financials",  "BANDHANBNK.NS": "Financials",
    "CANARABANK": "Financials",  "CANARABANK.NS": "Financials",
    "UNIONBANK": "Financials",   "UNIONBANK.NS": "Financials",
    "INDIANB": "Financials",     "INDIANB.NS": "Financials",
    "YESBANK": "Financials",     "YESBANK.NS": "Financials",
    "AUBANK": "Financials",      "AUBANK.NS": "Financials",
    "EQUITASBNK": "Financials",  "EQUITASBNK.NS": "Financials",
    "UJJIVANSFB": "Financials",  "UJJIVANSFB.NS": "Financials",
    "DCBBANK": "Financials",     "DCBBANK.NS": "Financials",
    "KTKBANK": "Financials",     "KTKBANK.NS": "Financials",
    # ── Financials — NBFCs / Insurers / AMCs ─────────────────────────────────
    "BAJFINANCE": "Financials",  "BAJFINANCE.NS": "Financials",
    "BAJAJFINSV": "Financials",  "BAJAJFINSV.NS": "Financials",
    "SBICARD": "Financials",     "SBICARD.NS": "Financials",
    "HDFCLIFE": "Financials",    "HDFCLIFE.NS": "Financials",
    "ICICIPRU": "Financials",    "ICICIPRU.NS": "Financials",
    "ICICIPRULI": "Financials",  "ICICIPRULI.NS": "Financials",
    "ICICIGI": "Financials",     "ICICIGI.NS": "Financials",
    "SBILIFE": "Financials",     "SBILIFE.NS": "Financials",
    "NIACL": "Financials",       "NIACL.NS": "Financials",
    "GICRE": "Financials",       "GICRE.NS": "Financials",
    "CHOLAFIN": "Financials",    "CHOLAFIN.NS": "Financials",
    "M&MFIN": "Financials",      "M&MFIN.NS": "Financials",
    "SHRIRAMFIN": "Financials",  "SHRIRAMFIN.NS": "Financials",
    "MUTHOOTFIN": "Financials",  "MUTHOOTFIN.NS": "Financials",
    "POONAWALLA": "Financials",  "POONAWALLA.NS": "Financials",
    "PFC": "Financials",         "PFC.NS": "Financials",
    "RECLTD": "Financials",      "RECLTD.NS": "Financials",
    "IRFC": "Financials",        "IRFC.NS": "Financials",
    "HDFCAMC": "Financials",     "HDFCAMC.NS": "Financials",
    "NAM-INDIA": "Financials",   "NAM-INDIA.NS": "Financials",
    "ANGELONE": "Financials",    "ANGELONE.NS": "Financials",
    "IIFL": "Financials",        "IIFL.NS": "Financials",
    "LICHSGFIN": "Financials",   "LICHSGFIN.NS": "Financials",
    "PNBHOUSING": "Financials",  "PNBHOUSING.NS": "Financials",
    "CANFINHOME": "Financials",  "CANFINHOME.NS": "Financials",
    "HOMEFIRST": "Financials",   "HOMEFIRST.NS": "Financials",
    "PAYTM": "Financials",       "PAYTM.NS": "Financials",
    "POLICYBZR": "Financials",   "POLICYBZR.NS": "Financials",
    "MOFSL": "Financials",       "MOFSL.NS": "Financials",
    "EDELWEISS": "Financials",   "EDELWEISS.NS": "Financials",
    "CREDITACC": "Financials",   "CREDITACC.NS": "Financials",
    # ── Energy — Oil, Gas & Pipelines ────────────────────────────────────────
    "RELIANCE": "Energy",        "RELIANCE.NS": "Energy",
    "ONGC": "Energy",            "ONGC.NS": "Energy",
    "BPCL": "Energy",            "BPCL.NS": "Energy",
    "IOC": "Energy",             "IOC.NS": "Energy",
    "HINDPETRO": "Energy",       "HINDPETRO.NS": "Energy",
    "HPCL": "Energy",            "HPCL.NS": "Energy",
    "GAIL": "Energy",            "GAIL.NS": "Energy",
    "PETRONET": "Energy",        "PETRONET.NS": "Energy",
    "OIL": "Energy",             "OIL.NS": "Energy",
    "MRPL": "Energy",            "MRPL.NS": "Energy",
    "GUJGAS": "Energy",          "GUJGAS.NS": "Energy",
    "IGL": "Energy",             "IGL.NS": "Energy",
    "MGL": "Energy",             "MGL.NS": "Energy",
    "GSPL": "Energy",            "GSPL.NS": "Energy",
    # ── Utilities ─────────────────────────────────────────────────────────────
    "POWERGRID": "Utilities",    "POWERGRID.NS": "Utilities",
    "NTPC": "Utilities",         "NTPC.NS": "Utilities",
    "ADANIGREEN": "Utilities",   "ADANIGREEN.NS": "Utilities",
    "ADANIPOWER": "Utilities",   "ADANIPOWER.NS": "Utilities",
    "TATAPOWER": "Utilities",    "TATAPOWER.NS": "Utilities",
    "TORNTPOWER": "Utilities",   "TORNTPOWER.NS": "Utilities",
    "CESC": "Utilities",         "CESC.NS": "Utilities",
    "NHPC": "Utilities",         "NHPC.NS": "Utilities",
    "SJVN": "Utilities",         "SJVN.NS": "Utilities",
    "JSWENERGY": "Utilities",    "JSWENERGY.NS": "Utilities",
    # ── Consumer Staples ──────────────────────────────────────────────────────
    "HINDUNILVR": "Consumer Staples",  "HINDUNILVR.NS": "Consumer Staples",
    "ITC": "Consumer Staples",         "ITC.NS": "Consumer Staples",
    "NESTLEIND": "Consumer Staples",   "NESTLEIND.NS": "Consumer Staples",
    "DABUR": "Consumer Staples",       "DABUR.NS": "Consumer Staples",
    "MARICO": "Consumer Staples",      "MARICO.NS": "Consumer Staples",
    "COLPAL": "Consumer Staples",      "COLPAL.NS": "Consumer Staples",
    "BRITANNIA": "Consumer Staples",   "BRITANNIA.NS": "Consumer Staples",
    "GODREJCP": "Consumer Staples",    "GODREJCP.NS": "Consumer Staples",
    "VBL": "Consumer Staples",         "VBL.NS": "Consumer Staples",
    "TATACONSUM": "Consumer Staples",  "TATACONSUM.NS": "Consumer Staples",
    "EMAMILTD": "Consumer Staples",    "EMAMILTD.NS": "Consumer Staples",
    "PGHH": "Consumer Staples",        "PGHH.NS": "Consumer Staples",
    "JYOTHYLAB": "Consumer Staples",   "JYOTHYLAB.NS": "Consumer Staples",
    "ZYDUSWELL": "Consumer Staples",   "ZYDUSWELL.NS": "Consumer Staples",
    "RADICO": "Consumer Staples",      "RADICO.NS": "Consumer Staples",
    "UBL": "Consumer Staples",         "UBL.NS": "Consumer Staples",
    "PATANJALI": "Consumer Staples",   "PATANJALI.NS": "Consumer Staples",
    "HONASA": "Consumer Staples",      "HONASA.NS": "Consumer Staples",
    "GILLETTE": "Consumer Staples",    "GILLETTE.NS": "Consumer Staples",
    # ── Consumer Discretionary — Autos ────────────────────────────────────────
    "MARUTI": "Consumer Discretionary",     "MARUTI.NS": "Consumer Discretionary",
    "M&M": "Consumer Discretionary",        "M&M.NS": "Consumer Discretionary",
    "TATAMOTORS": "Consumer Discretionary", "TATAMOTORS.NS": "Consumer Discretionary",
    "EICHERMOT": "Consumer Discretionary",  "EICHERMOT.NS": "Consumer Discretionary",
    "BAJAJ-AUTO": "Consumer Discretionary", "BAJAJ-AUTO.NS": "Consumer Discretionary",
    "HEROMOTOCO": "Consumer Discretionary", "HEROMOTOCO.NS": "Consumer Discretionary",
    "ASHOKLEY": "Consumer Discretionary",   "ASHOKLEY.NS": "Consumer Discretionary",
    "TVSMOTOR": "Consumer Discretionary",   "TVSMOTOR.NS": "Consumer Discretionary",
    "MOTHERSON": "Consumer Discretionary",  "MOTHERSON.NS": "Consumer Discretionary",
    "BOSCHLTD": "Consumer Discretionary",   "BOSCHLTD.NS": "Consumer Discretionary",
    "APOLLOTYRE": "Consumer Discretionary", "APOLLOTYRE.NS": "Consumer Discretionary",
    "MRF": "Consumer Discretionary",        "MRF.NS": "Consumer Discretionary",
    "BALKRISIND": "Consumer Discretionary", "BALKRISIND.NS": "Consumer Discretionary",
    "CEATLTD": "Consumer Discretionary",    "CEATLTD.NS": "Consumer Discretionary",
    "EXIDEIND": "Consumer Discretionary",   "EXIDEIND.NS": "Consumer Discretionary",
    "AMARAJABAT": "Consumer Discretionary", "AMARAJABAT.NS": "Consumer Discretionary",
    "HYUNDAI": "Consumer Discretionary",    "HYUNDAI.NS": "Consumer Discretionary",
    "OLECTRA": "Consumer Discretionary",    "OLECTRA.NS": "Consumer Discretionary",
    # ── Consumer Discretionary — Retail / Lifestyle ───────────────────────────
    "TITAN": "Consumer Discretionary",      "TITAN.NS": "Consumer Discretionary",
    "TRENT": "Consumer Discretionary",      "TRENT.NS": "Consumer Discretionary",
    "ZOMATO": "Consumer Discretionary",     "ZOMATO.NS": "Consumer Discretionary",
    "NYKAA": "Consumer Discretionary",      "NYKAA.NS": "Consumer Discretionary",
    "DMART": "Consumer Discretionary",      "DMART.NS": "Consumer Discretionary",
    "JUBLFOOD": "Consumer Discretionary",   "JUBLFOOD.NS": "Consumer Discretionary",
    "CROMPTON": "Consumer Discretionary",   "CROMPTON.NS": "Consumer Discretionary",
    "VOLTAS": "Consumer Discretionary",     "VOLTAS.NS": "Consumer Discretionary",
    "PAGEIND": "Consumer Discretionary",    "PAGEIND.NS": "Consumer Discretionary",
    "ABFRL": "Consumer Discretionary",      "ABFRL.NS": "Consumer Discretionary",
    "VEDANT": "Consumer Discretionary",     "VEDANT.NS": "Consumer Discretionary",
    "PVRINOX": "Consumer Discretionary",    "PVRINOX.NS": "Consumer Discretionary",
    "WHIRLPOOL": "Consumer Discretionary",  "WHIRLPOOL.NS": "Consumer Discretionary",
    "BLUESTAR": "Consumer Discretionary",   "BLUESTAR.NS": "Consumer Discretionary",
    "HAVELLS": "Consumer Discretionary",    "HAVELLS.NS": "Consumer Discretionary",
    "BAJAJELEC": "Consumer Discretionary",  "BAJAJELEC.NS": "Consumer Discretionary",
    "AMBER": "Consumer Discretionary",      "AMBER.NS": "Consumer Discretionary",
    "NAZARA": "Consumer Discretionary",     "NAZARA.NS": "Consumer Discretionary",
    "EASEMYTRIP": "Consumer Discretionary", "EASEMYTRIP.NS": "Consumer Discretionary",
    # ── Healthcare ────────────────────────────────────────────────────────────
    "SUNPHARMA": "Healthcare",    "SUNPHARMA.NS": "Healthcare",
    "DRREDDY": "Healthcare",      "DRREDDY.NS": "Healthcare",
    "CIPLA": "Healthcare",        "CIPLA.NS": "Healthcare",
    "DIVISLAB": "Healthcare",     "DIVISLAB.NS": "Healthcare",
    "APOLLOHOSP": "Healthcare",   "APOLLOHOSP.NS": "Healthcare",
    "LUPIN": "Healthcare",        "LUPIN.NS": "Healthcare",
    "TORNTPHARM": "Healthcare",   "TORNTPHARM.NS": "Healthcare",
    "ALKEM": "Healthcare",        "ALKEM.NS": "Healthcare",
    "MAXHEALTH": "Healthcare",    "MAXHEALTH.NS": "Healthcare",
    "AUROPHARMA": "Healthcare",   "AUROPHARMA.NS": "Healthcare",
    "BIOCON": "Healthcare",       "BIOCON.NS": "Healthcare",
    "LALPATHLAB": "Healthcare",   "LALPATHLAB.NS": "Healthcare",
    "METROPOLIS": "Healthcare",   "METROPOLIS.NS": "Healthcare",
    "FORTIS": "Healthcare",       "FORTIS.NS": "Healthcare",
    "NH": "Healthcare",           "NH.NS": "Healthcare",
    "ASTER": "Healthcare",        "ASTER.NS": "Healthcare",
    "KIMS": "Healthcare",         "KIMS.NS": "Healthcare",
    "IPCA": "Healthcare",         "IPCA.NS": "Healthcare",
    "GLENMARK": "Healthcare",     "GLENMARK.NS": "Healthcare",
    "ABBOTINDIA": "Healthcare",   "ABBOTINDIA.NS": "Healthcare",
    "PFIZER": "Healthcare",       "PFIZER.NS": "Healthcare",
    "AJANTPHARM": "Healthcare",   "AJANTPHARM.NS": "Healthcare",
    "GRANULES": "Healthcare",     "GRANULES.NS": "Healthcare",
    "NATCOPHARM": "Healthcare",   "NATCOPHARM.NS": "Healthcare",
    "NEULANDLAB": "Healthcare",   "NEULANDLAB.NS": "Healthcare",
    "ERIS": "Healthcare",         "ERIS.NS": "Healthcare",
    "THYROCARE": "Healthcare",    "THYROCARE.NS": "Healthcare",
    "MEDANTA": "Healthcare",      "MEDANTA.NS": "Healthcare",
    "POLYMED": "Healthcare",      "POLYMED.NS": "Healthcare",
    # ── Industrials — Engineering / Capital Goods ─────────────────────────────
    "LT": "Industrials",          "LT.NS": "Industrials",
    "ULTRACEMCO": "Industrials",  "ULTRACEMCO.NS": "Industrials",
    "ADANIENT": "Industrials",    "ADANIENT.NS": "Industrials",
    "ADANIPORTS": "Industrials",  "ADANIPORTS.NS": "Industrials",
    "SIEMENS": "Industrials",     "SIEMENS.NS": "Industrials",
    "ABB": "Industrials",         "ABB.NS": "Industrials",
    "BHEL": "Industrials",        "BHEL.NS": "Industrials",
    "HAL": "Industrials",         "HAL.NS": "Industrials",
    "BEL": "Industrials",         "BEL.NS": "Industrials",
    "BDL": "Industrials",         "BDL.NS": "Industrials",
    "MAZDOCK": "Industrials",     "MAZDOCK.NS": "Industrials",
    "GRSE": "Industrials",        "GRSE.NS": "Industrials",
    "COCHINSHIP": "Industrials",  "COCHINSHIP.NS": "Industrials",
    "MTAR": "Industrials",        "MTAR.NS": "Industrials",
    "DATAPATTNS": "Industrials",  "DATAPATTNS.NS": "Industrials",
    "IDEAFORGE": "Industrials",   "IDEAFORGE.NS": "Industrials",
    "SCHAEFFLER": "Industrials",  "SCHAEFFLER.NS": "Industrials",
    "CGPOWER": "Industrials",     "CGPOWER.NS": "Industrials",
    "CUMMINSIND": "Industrials",  "CUMMINSIND.NS": "Industrials",
    "THERMAX": "Industrials",     "THERMAX.NS": "Industrials",
    "BHARATFORG": "Industrials",  "BHARATFORG.NS": "Industrials",
    "TIINDIA": "Industrials",     "TIINDIA.NS": "Industrials",
    "SCHAEFFLER": "Industrials",  "SCHAEFFLER.NS": "Industrials",
    "KEC": "Industrials",         "KEC.NS": "Industrials",
    "POLYCAB": "Industrials",     "POLYCAB.NS": "Industrials",
    "APAR": "Industrials",        "APAR.NS": "Industrials",
    "SUZLON": "Industrials",      "SUZLON.NS": "Industrials",
    "RVNL": "Industrials",        "RVNL.NS": "Industrials",
    "IRCON": "Industrials",       "IRCON.NS": "Industrials",
    "IRCTC": "Industrials",       "IRCTC.NS": "Industrials",
    "TITAGARH": "Industrials",    "TITAGARH.NS": "Industrials",
    "CONCOR": "Industrials",      "CONCOR.NS": "Industrials",
    "DELHIVERY": "Industrials",   "DELHIVERY.NS": "Industrials",
    # ── Materials ─────────────────────────────────────────────────────────────
    "TATASTEEL": "Materials",     "TATASTEEL.NS": "Materials",
    "JSWSTEEL": "Materials",      "JSWSTEEL.NS": "Materials",
    "HINDALCO": "Materials",      "HINDALCO.NS": "Materials",
    "VEDL": "Materials",          "VEDL.NS": "Materials",
    "COALINDIA": "Materials",     "COALINDIA.NS": "Materials",
    "NMDC": "Materials",          "NMDC.NS": "Materials",
    "JSPL": "Materials",          "JSPL.NS": "Materials",
    "NATIONALUM": "Materials",    "NATIONALUM.NS": "Materials",
    "HINDZINC": "Materials",      "HINDZINC.NS": "Materials",
    "SAIL": "Materials",          "SAIL.NS": "Materials",
    "APLAPOLLO": "Materials",     "APLAPOLLO.NS": "Materials",
    "RATNAMANI": "Materials",     "RATNAMANI.NS": "Materials",
    "SHREECEM": "Materials",      "SHREECEM.NS": "Materials",
    "ACC": "Materials",           "ACC.NS": "Materials",
    "AMBUJACEM": "Materials",     "AMBUJACEM.NS": "Materials",
    "AMBUJA": "Materials",        "AMBUJA.NS": "Materials",
    "GRASIM": "Materials",        "GRASIM.NS": "Materials",
    "DALMIA": "Materials",        "DALMIA.NS": "Materials",
    "RAMCOCEM": "Materials",      "RAMCOCEM.NS": "Materials",
    "JKCEMENT": "Materials",      "JKCEMENT.NS": "Materials",
    "JKLAKSHMI": "Materials",     "JKLAKSHMI.NS": "Materials",
    "ASIANPAINT": "Materials",    "ASIANPAINT.NS": "Materials",
    "PIDILITIND": "Materials",    "PIDILITIND.NS": "Materials",
    "BERGER": "Materials",        "BERGER.NS": "Materials",
    "KANSAINER": "Materials",     "KANSAINER.NS": "Materials",
    "SRF": "Materials",           "SRF.NS": "Materials",
    "DEEPAKNTR": "Materials",     "DEEPAKNTR.NS": "Materials",
    "AARTI": "Materials",         "AARTI.NS": "Materials",
    "CLEAN": "Materials",         "CLEAN.NS": "Materials",
    "TATACHEM": "Materials",      "TATACHEM.NS": "Materials",
    "GNFC": "Materials",          "GNFC.NS": "Materials",
    "COROMANDEL": "Materials",    "COROMANDEL.NS": "Materials",
    "CHAMBALFERT": "Materials",   "CHAMBALFERT.NS": "Materials",
    "FLUOROCHEM": "Materials",    "FLUOROCHEM.NS": "Materials",
    "FINEORG": "Materials",       "FINEORG.NS": "Materials",
    "ROSSARI": "Materials",       "ROSSARI.NS": "Materials",
    "SOLARINDS": "Materials",     "SOLARINDS.NS": "Materials",
    "MOIL": "Materials",          "MOIL.NS": "Materials",
    "INDIGOPNTS": "Materials",    "INDIGOPNTS.NS": "Materials",
    # ── Communication Services ────────────────────────────────────────────────
    "BHARTIARTL": "Communication Services", "BHARTIARTL.NS": "Communication Services",
    "ZEEL": "Communication Services",       "ZEEL.NS": "Communication Services",
    "INDIAMART": "Communication Services",  "INDIAMART.NS": "Communication Services",
    "NAUKRI": "Communication Services",     "NAUKRI.NS": "Communication Services",
    "JUSTDIAL": "Communication Services",   "JUSTDIAL.NS": "Communication Services",
    "TATACOMM": "Communication Services",   "TATACOMM.NS": "Communication Services",
    "HFCL": "Communication Services",       "HFCL.NS": "Communication Services",
    "STLTECH": "Communication Services",    "STLTECH.NS": "Communication Services",
    "CARTRADE": "Communication Services",   "CARTRADE.NS": "Communication Services",
    "RAILTEL": "Communication Services",    "RAILTEL.NS": "Communication Services",
    # ── Real Estate ───────────────────────────────────────────────────────────
    "DLF": "Real Estate",         "DLF.NS": "Real Estate",
    "GODREJPROP": "Real Estate",  "GODREJPROP.NS": "Real Estate",
    "OBEROIRLTY": "Real Estate",  "OBEROIRLTY.NS": "Real Estate",
    "PRESTIGE": "Real Estate",    "PRESTIGE.NS": "Real Estate",
    "LODHA": "Real Estate",       "LODHA.NS": "Real Estate",
    "BRIGADE": "Real Estate",     "BRIGADE.NS": "Real Estate",
    "PHOENIXLTD": "Real Estate",  "PHOENIXLTD.NS": "Real Estate",
    "SOBHA": "Real Estate",       "SOBHA.NS": "Real Estate",
    "KOLTEPATIL": "Real Estate",  "KOLTEPATIL.NS": "Real Estate",
}

_STATIC_NAME_MAP: dict[str, str] = {
    # ── IT ────────────────────────────────────────────────────────────────────
    "TCS": "Tata Consultancy Services",          "TCS.NS": "Tata Consultancy Services",
    "INFY": "Infosys",                            "INFY.NS": "Infosys",
    "WIPRO": "Wipro",                             "WIPRO.NS": "Wipro",
    "HCLTECH": "HCL Technologies",               "HCLTECH.NS": "HCL Technologies",
    "TECHM": "Tech Mahindra",                    "TECHM.NS": "Tech Mahindra",
    "LTIM": "LTIMindtree",                       "LTIM.NS": "LTIMindtree",
    "COFORGE": "Coforge",                        "COFORGE.NS": "Coforge",
    "MPHASIS": "Mphasis",                        "MPHASIS.NS": "Mphasis",
    "PERSISTENT": "Persistent Systems",          "PERSISTENT.NS": "Persistent Systems",
    "HEXAWARE": "Hexaware Technologies",         "HEXAWARE.NS": "Hexaware Technologies",
    "KPITTECH": "KPIT Technologies",             "KPITTECH.NS": "KPIT Technologies",
    "TATAELXSI": "Tata Elxsi",                   "TATAELXSI.NS": "Tata Elxsi",
    "TANLA": "Tanla Platforms",                  "TANLA.NS": "Tanla Platforms",
    "OFSS": "Oracle Financial Services",         "OFSS.NS": "Oracle Financial Services",
    "BIRLASOFT": "Birlasoft",                    "BIRLASOFT.NS": "Birlasoft",
    "CYIENT": "Cyient",                          "CYIENT.NS": "Cyient",
    "DIXON": "Dixon Technologies",               "DIXON.NS": "Dixon Technologies",
    "KAYNES": "Kaynes Technology India",         "KAYNES.NS": "Kaynes Technology India",
    # ── Financials ────────────────────────────────────────────────────────────
    "HDFCBANK": "HDFC Bank",                     "HDFCBANK.NS": "HDFC Bank",
    "ICICIBANK": "ICICI Bank",                   "ICICIBANK.NS": "ICICI Bank",
    "KOTAKBANK": "Kotak Mahindra Bank",          "KOTAKBANK.NS": "Kotak Mahindra Bank",
    "SBIN": "State Bank of India",               "SBIN.NS": "State Bank of India",
    "AXISBANK": "Axis Bank",                     "AXISBANK.NS": "Axis Bank",
    "BAJFINANCE": "Bajaj Finance",               "BAJFINANCE.NS": "Bajaj Finance",
    "BAJAJFINSV": "Bajaj Finserv",               "BAJAJFINSV.NS": "Bajaj Finserv",
    "HDFCLIFE": "HDFC Life Insurance",           "HDFCLIFE.NS": "HDFC Life Insurance",
    "SBILIFE": "SBI Life Insurance",             "SBILIFE.NS": "SBI Life Insurance",
    "ICICIPRULI": "ICICI Prudential Life",       "ICICIPRULI.NS": "ICICI Prudential Life",
    "CHOLAFIN": "Cholamandalam Investment",      "CHOLAFIN.NS": "Cholamandalam Investment",
    "MUTHOOTFIN": "Muthoot Finance",             "MUTHOOTFIN.NS": "Muthoot Finance",
    "SHRIRAMFIN": "Shriram Finance",             "SHRIRAMFIN.NS": "Shriram Finance",
    "PFC": "Power Finance Corporation",          "PFC.NS": "Power Finance Corporation",
    "RECLTD": "REC Limited",                     "RECLTD.NS": "REC Limited",
    "IRFC": "Indian Railway Finance Corp",       "IRFC.NS": "Indian Railway Finance Corp",
    "HDFCAMC": "HDFC AMC",                       "HDFCAMC.NS": "HDFC AMC",
    "ANGELONE": "Angel One",                     "ANGELONE.NS": "Angel One",
    "PAYTM": "Paytm (One 97 Communications)",    "PAYTM.NS": "Paytm (One 97 Communications)",
    "POLICYBZR": "PB Fintech (Policybazaar)",    "POLICYBZR.NS": "PB Fintech (Policybazaar)",
    "PNB": "Punjab National Bank",               "PNB.NS": "Punjab National Bank",
    "BANKBARODA": "Bank of Baroda",              "BANKBARODA.NS": "Bank of Baroda",
    "FEDERALBNK": "Federal Bank",               "FEDERALBNK.NS": "Federal Bank",
    "IDFCFIRSTB": "IDFC First Bank",             "IDFCFIRSTB.NS": "IDFC First Bank",
    "CANARABANK": "Canara Bank",                 "CANARABANK.NS": "Canara Bank",
    "YESBANK": "Yes Bank",                       "YESBANK.NS": "Yes Bank",
    "AUBANK": "AU Small Finance Bank",           "AUBANK.NS": "AU Small Finance Bank",
    # ── Energy / Utilities ────────────────────────────────────────────────────
    "RELIANCE": "Reliance Industries",           "RELIANCE.NS": "Reliance Industries",
    "ONGC": "Oil and Natural Gas Corporation",   "ONGC.NS": "Oil and Natural Gas Corporation",
    "BPCL": "Bharat Petroleum Corporation",      "BPCL.NS": "Bharat Petroleum Corporation",
    "IOC": "Indian Oil Corporation",             "IOC.NS": "Indian Oil Corporation",
    "HINDPETRO": "Hindustan Petroleum Corp",     "HINDPETRO.NS": "Hindustan Petroleum Corp",
    "GAIL": "GAIL India",                        "GAIL.NS": "GAIL India",
    "IGL": "Indraprastha Gas",                   "IGL.NS": "Indraprastha Gas",
    "MGL": "Mahanagar Gas",                      "MGL.NS": "Mahanagar Gas",
    "NTPC": "NTPC Limited",                      "NTPC.NS": "NTPC Limited",
    "POWERGRID": "Power Grid Corporation",       "POWERGRID.NS": "Power Grid Corporation",
    "TATAPOWER": "Tata Power",                   "TATAPOWER.NS": "Tata Power",
    "ADANIGREEN": "Adani Green Energy",          "ADANIGREEN.NS": "Adani Green Energy",
    "ADANIPOWER": "Adani Power",                 "ADANIPOWER.NS": "Adani Power",
    "NHPC": "NHPC Limited",                      "NHPC.NS": "NHPC Limited",
    "SJVN": "SJVN Limited",                      "SJVN.NS": "SJVN Limited",
    "JSWENERGY": "JSW Energy",                   "JSWENERGY.NS": "JSW Energy",
    # ── Consumer Staples ──────────────────────────────────────────────────────
    "HINDUNILVR": "Hindustan Unilever",          "HINDUNILVR.NS": "Hindustan Unilever",
    "ITC": "ITC Limited",                        "ITC.NS": "ITC Limited",
    "NESTLEIND": "Nestle India",                 "NESTLEIND.NS": "Nestle India",
    "BRITANNIA": "Britannia Industries",         "BRITANNIA.NS": "Britannia Industries",
    "DABUR": "Dabur India",                      "DABUR.NS": "Dabur India",
    "MARICO": "Marico",                          "MARICO.NS": "Marico",
    "GODREJCP": "Godrej Consumer Products",      "GODREJCP.NS": "Godrej Consumer Products",
    "COLPAL": "Colgate-Palmolive India",         "COLPAL.NS": "Colgate-Palmolive India",
    "TATACONSUM": "Tata Consumer Products",      "TATACONSUM.NS": "Tata Consumer Products",
    "VBL": "Varun Beverages",                    "VBL.NS": "Varun Beverages",
    # ── Consumer Discretionary ────────────────────────────────────────────────
    "MARUTI": "Maruti Suzuki India",             "MARUTI.NS": "Maruti Suzuki India",
    "M&M": "Mahindra & Mahindra",               "M&M.NS": "Mahindra & Mahindra",
    "TATAMOTORS": "Tata Motors",                 "TATAMOTORS.NS": "Tata Motors",
    "EICHERMOT": "Eicher Motors",               "EICHERMOT.NS": "Eicher Motors",
    "BAJAJ-AUTO": "Bajaj Auto",                  "BAJAJ-AUTO.NS": "Bajaj Auto",
    "HEROMOTOCO": "Hero MotoCorp",              "HEROMOTOCO.NS": "Hero MotoCorp",
    "ASHOKLEY": "Ashok Leyland",                "ASHOKLEY.NS": "Ashok Leyland",
    "TVSMOTOR": "TVS Motor Company",            "TVSMOTOR.NS": "TVS Motor Company",
    "MRF": "MRF",                               "MRF.NS": "MRF",
    "APOLLOTYRE": "Apollo Tyres",               "APOLLOTYRE.NS": "Apollo Tyres",
    "TITAN": "Titan Company",                    "TITAN.NS": "Titan Company",
    "ZOMATO": "Zomato",                          "ZOMATO.NS": "Zomato",
    "NYKAA": "Nykaa (FSN E-Commerce)",          "NYKAA.NS": "Nykaa (FSN E-Commerce)",
    "DMART": "Avenue Supermarts (D-Mart)",       "DMART.NS": "Avenue Supermarts (D-Mart)",
    "TRENT": "Trent",                            "TRENT.NS": "Trent",
    "JUBLFOOD": "Jubilant FoodWorks",            "JUBLFOOD.NS": "Jubilant FoodWorks",
    "HAVELLS": "Havells India",                  "HAVELLS.NS": "Havells India",
    "VOLTAS": "Voltas",                          "VOLTAS.NS": "Voltas",
    "CROMPTON": "Crompton Greaves Consumer",     "CROMPTON.NS": "Crompton Greaves Consumer",
    # ── Healthcare ────────────────────────────────────────────────────────────
    "SUNPHARMA": "Sun Pharmaceutical",           "SUNPHARMA.NS": "Sun Pharmaceutical",
    "DRREDDY": "Dr. Reddy's Laboratories",       "DRREDDY.NS": "Dr. Reddy's Laboratories",
    "CIPLA": "Cipla",                            "CIPLA.NS": "Cipla",
    "DIVISLAB": "Divi's Laboratories",           "DIVISLAB.NS": "Divi's Laboratories",
    "APOLLOHOSP": "Apollo Hospitals",            "APOLLOHOSP.NS": "Apollo Hospitals",
    "LUPIN": "Lupin",                            "LUPIN.NS": "Lupin",
    "ALKEM": "Alkem Laboratories",              "ALKEM.NS": "Alkem Laboratories",
    "AUROPHARMA": "Aurobindo Pharma",            "AUROPHARMA.NS": "Aurobindo Pharma",
    "BIOCON": "Biocon",                          "BIOCON.NS": "Biocon",
    "MAXHEALTH": "Max Healthcare",              "MAXHEALTH.NS": "Max Healthcare",
    "LALPATHLAB": "Dr. Lal PathLabs",            "LALPATHLAB.NS": "Dr. Lal PathLabs",
    "FORTIS": "Fortis Healthcare",              "FORTIS.NS": "Fortis Healthcare",
    "NH": "Narayana Hrudayalaya",               "NH.NS": "Narayana Hrudayalaya",
    # ── Industrials ───────────────────────────────────────────────────────────
    "LT": "Larsen & Toubro",                     "LT.NS": "Larsen & Toubro",
    "SIEMENS": "Siemens India",                  "SIEMENS.NS": "Siemens India",
    "ABB": "ABB India",                          "ABB.NS": "ABB India",
    "BHEL": "Bharat Heavy Electricals",          "BHEL.NS": "Bharat Heavy Electricals",
    "HAL": "Hindustan Aeronautics",              "HAL.NS": "Hindustan Aeronautics",
    "BEL": "Bharat Electronics",                 "BEL.NS": "Bharat Electronics",
    "BDL": "Bharat Dynamics",                    "BDL.NS": "Bharat Dynamics",
    "MAZDOCK": "Mazagon Dock Shipbuilders",      "MAZDOCK.NS": "Mazagon Dock Shipbuilders",
    "GRSE": "Garden Reach Shipbuilders",         "GRSE.NS": "Garden Reach Shipbuilders",
    "COCHINSHIP": "Cochin Shipyard",             "COCHINSHIP.NS": "Cochin Shipyard",
    "MTAR": "MTAR Technologies",                "MTAR.NS": "MTAR Technologies",
    "DATAPATTNS": "Data Patterns (India)",       "DATAPATTNS.NS": "Data Patterns (India)",
    "ADANIENT": "Adani Enterprises",             "ADANIENT.NS": "Adani Enterprises",
    "ADANIPORTS": "Adani Ports & SEZ",           "ADANIPORTS.NS": "Adani Ports & SEZ",
    "CGPOWER": "CG Power & Industrial",          "CGPOWER.NS": "CG Power & Industrial",
    "POLYCAB": "Polycab India",                  "POLYCAB.NS": "Polycab India",
    "RVNL": "Rail Vikas Nigam",                  "RVNL.NS": "Rail Vikas Nigam",
    "IRCON": "Ircon International",              "IRCON.NS": "Ircon International",
    "IRCTC": "Indian Railway Catering & Tourism","IRCTC.NS": "Indian Railway Catering & Tourism",
    "CONCOR": "Container Corporation (CONCOR)",  "CONCOR.NS": "Container Corporation (CONCOR)",
    "DELHIVERY": "Delhivery",                    "DELHIVERY.NS": "Delhivery",
    # ── Materials ─────────────────────────────────────────────────────────────
    "COALINDIA": "Coal India",                   "COALINDIA.NS": "Coal India",
    "JSWSTEEL": "JSW Steel",                     "JSWSTEEL.NS": "JSW Steel",
    "TATASTEEL": "Tata Steel",                   "TATASTEEL.NS": "Tata Steel",
    "HINDALCO": "Hindalco Industries",           "HINDALCO.NS": "Hindalco Industries",
    "VEDL": "Vedanta",                           "VEDL.NS": "Vedanta",
    "SAIL": "Steel Authority of India",          "SAIL.NS": "Steel Authority of India",
    "JSPL": "Jindal Steel & Power",              "JSPL.NS": "Jindal Steel & Power",
    "NMDC": "NMDC",                              "NMDC.NS": "NMDC",
    "ULTRACEMCO": "UltraTech Cement",            "ULTRACEMCO.NS": "UltraTech Cement",
    "AMBUJACEM": "Ambuja Cements",               "AMBUJACEM.NS": "Ambuja Cements",
    "AMBUJA": "Ambuja Cements",                  "AMBUJA.NS": "Ambuja Cements",
    "ACC": "ACC",                                "ACC.NS": "ACC",
    "SHREECEM": "Shree Cement",                  "SHREECEM.NS": "Shree Cement",
    "GRASIM": "Grasim Industries",               "GRASIM.NS": "Grasim Industries",
    "ASIANPAINT": "Asian Paints",                "ASIANPAINT.NS": "Asian Paints",
    "PIDILITIND": "Pidilite Industries",         "PIDILITIND.NS": "Pidilite Industries",
    "TATACHEM": "Tata Chemicals",                "TATACHEM.NS": "Tata Chemicals",
    "SRF": "SRF Limited",                        "SRF.NS": "SRF Limited",
    "DEEPAKNTR": "Deepak Nitrite",               "DEEPAKNTR.NS": "Deepak Nitrite",
    "COROMANDEL": "Coromandel International",    "COROMANDEL.NS": "Coromandel International",
    "SOLARINDS": "Solar Industries India",       "SOLARINDS.NS": "Solar Industries India",
    # ── Communication Services ────────────────────────────────────────────────
    "BHARTIARTL": "Bharti Airtel",               "BHARTIARTL.NS": "Bharti Airtel",
    "NAUKRI": "Info Edge India (Naukri.com)",    "NAUKRI.NS": "Info Edge India (Naukri.com)",
    "INDIAMART": "IndiaMart InterMESH",          "INDIAMART.NS": "IndiaMart InterMESH",
    "TATACOMM": "Tata Communications",           "TATACOMM.NS": "Tata Communications",
    "RAILTEL": "RailTel Corporation",            "RAILTEL.NS": "RailTel Corporation",
    # ── Real Estate ───────────────────────────────────────────────────────────
    "DLF": "DLF Limited",                        "DLF.NS": "DLF Limited",
    "GODREJPROP": "Godrej Properties",           "GODREJPROP.NS": "Godrej Properties",
    "OBEROIRLTY": "Oberoi Realty",               "OBEROIRLTY.NS": "Oberoi Realty",
    "PRESTIGE": "Prestige Estates",              "PRESTIGE.NS": "Prestige Estates",
    "LODHA": "Lodha Group (Macrotech)",          "LODHA.NS": "Lodha Group (Macrotech)",
    "BRIGADE": "Brigade Enterprises",            "BRIGADE.NS": "Brigade Enterprises",
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
    # Banks — explicit subtype for fundamentals handling
    "PNB": "Public Sector Bank",          "PNB.NS": "Public Sector Bank",
    "BANKBARODA": "Public Sector Bank",   "BANKBARODA.NS": "Public Sector Bank",
    "CANARABANK": "Public Sector Bank",   "CANARABANK.NS": "Public Sector Bank",
    "YESBANK": "Private Sector Bank",     "YESBANK.NS": "Private Sector Bank",
    "FEDERALBNK": "Private Sector Bank",  "FEDERALBNK.NS": "Private Sector Bank",
    "IDFCFIRSTB": "Private Sector Bank",  "IDFCFIRSTB.NS": "Private Sector Bank",
    "AUBANK": "Small Finance Bank",       "AUBANK.NS": "Small Finance Bank",
    # NBFCs
    "BAJAJFINSV": "NBFC",                 "BAJAJFINSV.NS": "NBFC",
    "CHOLAFIN": "NBFC",                   "CHOLAFIN.NS": "NBFC",
    "MUTHOOTFIN": "NBFC",                 "MUTHOOTFIN.NS": "NBFC",
    "SHRIRAMFIN": "NBFC",                 "SHRIRAMFIN.NS": "NBFC",
    "PFC": "Government NBFC",             "PFC.NS": "Government NBFC",
    "RECLTD": "Government NBFC",          "RECLTD.NS": "Government NBFC",
    "IRFC": "Government NBFC",            "IRFC.NS": "Government NBFC",
    # Insurance
    "HDFCLIFE": "Life Insurance",         "HDFCLIFE.NS": "Life Insurance",
    "SBILIFE": "Life Insurance",          "SBILIFE.NS": "Life Insurance",
    "ICICIPRULI": "Life Insurance",       "ICICIPRULI.NS": "Life Insurance",
    # AMCs / brokerages
    "HDFCAMC": "Asset Management",        "HDFCAMC.NS": "Asset Management",
    "ANGELONE": "Stock Broking",          "ANGELONE.NS": "Stock Broking",
}


# ─── ETF / Index Fund detection ───────────────────────────────────────────────
#
# ETFs do not have meaningful fundamentals (PE, PB, ROE, etc.) — they are
# baskets of securities.  Correctly classifying them prevents sector="Unknown"
# and avoids poisoning weighted fundamentals with fund-level zeros.
#
# Detection hierarchy:
#  1. Exact ticker match in _ETF_EXACT_TICKERS
#  2. Suffix pattern (BEES family — Benchmark ETF Series / Mirae Asset etc.)
#  3. Keyword in ticker: "ETF", "LIQUIDCASE", "GOLDETF", etc.
#
# Sector set to "ETF" so the sector breakdown shows it explicitly rather than
# lumping it into "Unknown".  asset_class is set to "ETF" in the holding record.

_ETF_EXACT_TICKERS: set[str] = {
    # Nippon India (formerly Benchmark / Reliance) BeES series
    "NIFTYBEES", "NIFTYBEES.NS",
    "JUNIORBEES", "JUNIORBEES.NS",
    "BANKBEES", "BANKBEES.NS",
    "GOLDBEES", "GOLDBEES.NS",
    "LIQUIDBEES", "LIQUIDBEES.NS",
    "ITBEES", "ITBEES.NS",
    "PHARMABEES", "PHARMABEES.NS",
    "SILVERBEES", "SILVERBEES.NS",
    "MIDCAPBEES", "MIDCAPBEES.NS",
    "INFRABEES", "INFRABEES.NS",
    "PSUBANKBEES", "PSUBANKBEES.NS",
    "CPSE", "CPSE.NS",
    # Mirae / UTI / SBI / HDFC ETFs
    "MON100", "MON100.NS",
    "MAFANG", "MAFANG.NS",
    "NETFIT", "NETFIT.NS",
    "NIFTYIETF", "NIFTYIETF.NS",
    "SETFNIFBK", "SETFNIFBK.NS",
    "SETFNIF50", "SETFNIF50.NS",
    "UTINIFTETF", "UTINIFTETF.NS",
    "ICICIB22", "ICICIB22.NS",
    # Kotak ETFs
    "KOTAKSILVER", "KOTAKSILVER.NS",
    "KOTAKGOLD", "KOTAKGOLD.NS",
    "KOTAK50", "KOTAK50.NS",
    "KOTAKNIFTY", "KOTAKNIFTY.NS",
    # Other common ETFs / liquid funds
    "LIQUIDCASE", "LIQUIDCASE.NS",
    "LIQUIDETF", "LIQUIDETF.NS",
    "HDFCSENSEX", "HDFCSENSEX.NS",
    "HDFCNIFTY", "HDFCNIFTY.NS",
}

_ETF_NAME_MAP: dict[str, str] = {
    "NIFTYBEES": "Nippon India Nifty 50 BeES ETF",
    "NIFTYBEES.NS": "Nippon India Nifty 50 BeES ETF",
    "JUNIORBEES": "Nippon India Junior BeES ETF",
    "JUNIORBEES.NS": "Nippon India Junior BeES ETF",
    "BANKBEES": "Nippon India Bank BeES ETF",
    "BANKBEES.NS": "Nippon India Bank BeES ETF",
    "GOLDBEES": "Nippon India Gold BeES ETF",
    "GOLDBEES.NS": "Nippon India Gold BeES ETF",
    "LIQUIDBEES": "Nippon India Liquid BeES ETF",
    "LIQUIDBEES.NS": "Nippon India Liquid BeES ETF",
    "SILVERBEES": "Nippon India Silver BeES ETF",
    "SILVERBEES.NS": "Nippon India Silver BeES ETF",
    "MIDCAPBEES": "Nippon India Midcap 150 BeES ETF",
    "MIDCAPBEES.NS": "Nippon India Midcap 150 BeES ETF",
    "MON100": "Motilal Oswal Nasdaq 100 ETF",
    "MON100.NS": "Motilal Oswal Nasdaq 100 ETF",
    "MAFANG": "Mirae Asset NYSE FANG+ ETF",
    "MAFANG.NS": "Mirae Asset NYSE FANG+ ETF",
    "CPSE": "CPSE ETF (PSU basket)",
    "CPSE.NS": "CPSE ETF (PSU basket)",
}


def _is_etf(ticker: str) -> bool:
    """
    Return True if this ticker is a known or likely ETF/index fund.
    Detection is conservative — prefer known ETFs over guessing.
    """
    upper = ticker.upper()

    # 1. Exact match in known ETF set
    if upper in _ETF_EXACT_TICKERS:
        return True

    # Strip .NS / .BO suffix for pattern checks
    base = upper.replace(".NS", "").replace(".BO", "")

    # 2. BeES suffix (Benchmark ETF Series naming convention)
    if base.endswith("BEES"):
        return True

    # 3. ETF / LIQUIDCASE / LIQUIDETF keywords in base ticker
    keywords = ("ETF", "LIQUIDCASE", "GOLDETF", "SILVERETF", "NIFTYETF")
    if any(kw in base for kw in keywords):
        return True

    return False


def _lookup_static(ticker: str) -> tuple[Optional[str], Optional[str], Optional[str]]:
    """Return (sector, name, industry) from static maps, or (None, None, None)."""
    upper = ticker.upper()
    return (
        _STATIC_SECTOR_MAP.get(upper),
        _STATIC_NAME_MAP.get(upper),
        _STATIC_INDUSTRY_MAP.get(upper),
    )


def _resolve_etf(ticker: str) -> tuple[str, str, str]:
    """
    Return (sector, name, industry) for a confirmed ETF ticker.
    Sector is "ETF" so it shows distinctly in sector breakdowns.
    Name comes from _ETF_NAME_MAP if known, else a generic label.
    """
    upper = ticker.upper()
    name = _ETF_NAME_MAP.get(upper, f"{ticker} (ETF / Index Fund)")
    return "ETF", name, "Exchange Traded Fund"


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

        # ── Step 0: ETF fast-path ─────────────────────────────────────────────
        # ETFs have no meaningful fundamentals.  Resolve sector/name from our
        # known ETF maps and skip the yfinance / FMP chain entirely.
        if _is_etf(h.ticker):
            etf_sector, etf_name, etf_industry = _resolve_etf(h.ticker)
            if needs_sector:
                updates["sector"]   = etf_sector
                updates["asset_class"] = "ETF"
                rec.sector_status   = "static_map"
                rec.sector_source   = etf_sector
                needs_sector        = False
            if needs_name:
                updates["name"]     = etf_name
                rec.name_status     = "static_map"
                rec.name_source     = etf_name
                needs_name          = False
            if needs_industry:
                updates["industry"] = etf_industry
                rec.industry_source = etf_industry
                needs_industry      = False

            # ETFs intentionally skip fundamentals
            rec.fundamentals_status = "not_applicable"
            rec.attempted_sources.append("etf_map")
            logger.info("ETF detected for %s — sector=ETF, fundamentals skipped", h.ticker)

            # Apply updates and move on — skip the entire yfinance/FMP chain
            if updates:
                result[idx] = h.model_copy(update=updates)
                enriched_count += 1
            records.append(rec)
            continue

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
                        rec.fundamentals_status = "fetched"

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

        # Mark fundamentals unavailable if yfinance was tried but didn't fetch
        if rec.fundamentals_status == "pending" and "yfinance" in rec.attempted_sources:
            rec.fundamentals_status = "unavailable"

        # Stamp enrichment timestamp
        import time as _time
        rec.last_enriched_at = _time.time()

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
