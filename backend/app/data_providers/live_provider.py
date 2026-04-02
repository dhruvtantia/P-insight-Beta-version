"""
Live API Data Provider — Phase 3 (Hardened)
---------------------------------------------
Fetches live market data from Yahoo Finance via yfinance.

Holdings source:
  - Portfolio *positions* (ticker, quantity, cost, sector) come from the active
    portfolio in the database — NOT from mock_data/portfolio.json.
  - This means live mode works for any portfolio: uploaded, manual, or broker-synced.
  - Live *prices* overwrite current_price for each DB holding.
  - Holdings where yfinance returns no price get data_source="unavailable".

No silent mock fallback:
  - All methods return explicit unavailable / error states rather than delegating
    to MockDataProvider. If live data is unavailable, callers see it.

TTL caches:
  - Prices: 60 seconds (in-process dict)
  - Fundamentals: 4 hours (in-process dict)

To enable this provider:
  poetry add yfinance httpx      # from your backend terminal
  LIVE_API_ENABLED=true in .env (already default)
  Restart the backend.
"""

import time
import logging
from typing import Optional

from sqlalchemy.orm import Session

from app.data_providers.base import BaseDataProvider
from app.schemas.portfolio import HoldingBase
from app.core.config import settings

logger = logging.getLogger(__name__)

# ─── Graceful import — degrades if yfinance not installed ──────────────────────

try:
    import yfinance as yf
    YFINANCE_AVAILABLE = True
except ImportError:
    YFINANCE_AVAILABLE = False
    logger.warning(
        "yfinance is not installed. Live API mode will be unavailable. "
        "Run: poetry add yfinance httpx"
    )

# ─── Optional: Financial Modeling Prep (FMP) ──────────────────────────────────
# FMP is used as a fallback when yfinance returns empty fundamentals.
# Free tier: 250 requests/day. Set FINANCIAL_MODELING_PREP_API_KEY in .env.
# When the key is absent, FMP is silently skipped.

FMP_BASE = "https://financialmodelingprep.com/api/v3"


def _fetch_fmp_fundamentals(ticker: str) -> dict:
    """
    Fetch fundamentals from Financial Modeling Prep as a yfinance fallback.
    Only called when FINANCIAL_MODELING_PREP_API_KEY is configured.

    FMP uses US-style tickers. For Indian equities we try:
      TCS.NS  → query as TCS (FMP strips exchange suffix)
    If the company is listed in India but not on FMP, returns {}.
    """
    api_key = settings.FINANCIAL_MODELING_PREP_API_KEY
    if not api_key:
        return {}

    # Normalise ticker — FMP does not use .NS/.BO suffixes
    fmp_ticker = ticker.split(".")[0] if "." in ticker else ticker

    try:
        import httpx
        url = f"{FMP_BASE}/profile/{fmp_ticker}"
        resp = httpx.get(url, params={"apikey": api_key}, timeout=8)
        resp.raise_for_status()
        data = resp.json()
        if not data or not isinstance(data, list) or not data[0]:
            return {}
        p = data[0]

        def _sf(key: str, scale: float = 1.0) -> float | None:
            v = p.get(key)
            if v is None or v == 0:
                return None
            try:
                return round(float(v) * scale, 4)
            except (TypeError, ValueError):
                return None

        return {
            "name":            p.get("companyName"),
            "sector":          p.get("sector"),
            "industry":        p.get("industry"),
            "market_cap":      _sf("mktCap", scale=1e-7),       # crores
            "pe_ratio":        _sf("pe"),
            "pb_ratio":        _sf("priceToBookValueRatio"),
            "dividend_yield":  _sf("lastDiv"),
            "roe":             _sf("roe", scale=100),
            "profit_margin":   _sf("netProfitMargin", scale=100),
            "debt_to_equity":  _sf("debtToEquity"),
            "source":          "fmp",
            "resolved_ticker": fmp_ticker,
        }
    except Exception as exc:
        logger.debug("FMP fundamentals failed for %s: %s", fmp_ticker, exc)
        return {}


def _fetch_fmp_peers(ticker: str) -> list[str]:
    """
    Fetch peer list from FMP /stock_peers endpoint.
    Returns NSE-qualified symbols (appending .NS) if they look like Indian equities.
    Only called when FINANCIAL_MODELING_PREP_API_KEY is configured.
    """
    api_key = settings.FINANCIAL_MODELING_PREP_API_KEY
    if not api_key:
        return []

    fmp_ticker = ticker.split(".")[0] if "." in ticker else ticker
    is_indian   = ticker.endswith(".NS") or ticker.endswith(".BO")
    suffix      = ".NS" if is_indian else ""

    try:
        import httpx
        url = f"{FMP_BASE}/stock_peers"
        resp = httpx.get(url, params={"symbol": fmp_ticker, "apikey": api_key}, timeout=8)
        resp.raise_for_status()
        data = resp.json()
        if not data or not isinstance(data, list) or "peersList" not in data[0]:
            return []
        raw_peers: list[str] = data[0]["peersList"]
        # Re-add exchange suffix for Indian equities so downstream yfinance calls work
        peers = [f"{p}{suffix}" if suffix and "." not in p else p for p in raw_peers[:6]]
        return peers
    except Exception as exc:
        logger.debug("FMP peers failed for %s: %s", fmp_ticker, exc)
        return []

# ─── In-process TTL cache ─────────────────────────────────────────────────────
# Format: { ticker: (data, fetched_at_unix_timestamp) }

_PRICE_CACHE: dict[str, tuple[float, float]] = {}   # ticker → (price, ts)
_FUND_CACHE:  dict[str, tuple[dict,  float]] = {}   # ticker → (data,  ts)

PRICE_TTL = 60.0        # 1 minute for prices
FUND_TTL  = 14_400.0    # 4 hours  for fundamentals


def _price_from_cache(ticker: str) -> float | None:
    entry = _PRICE_CACHE.get(ticker)
    if entry and (time.time() - entry[1]) < PRICE_TTL:
        return entry[0]
    return None


def _fund_from_cache(ticker: str) -> dict | None:
    entry = _FUND_CACHE.get(ticker)
    if entry and (time.time() - entry[1]) < FUND_TTL:
        return entry[0]
    return None


def _store_price(ticker: str, price: float) -> None:
    _PRICE_CACHE[ticker] = (price, time.time())


def _store_fund(ticker: str, data: dict) -> None:
    _FUND_CACHE[ticker] = (data, time.time())


# ─── yfinance helpers ─────────────────────────────────────────────────────────

def _fetch_live_prices_batch(tickers: list[str]) -> dict[str, float]:
    """
    Batch-fetch last close prices for multiple tickers via yf.download().
    Returns {ticker: price}. Missing tickers are omitted from the result.
    This is ~10× faster than calling yf.Ticker(t).fast_info per ticker.
    """
    if not YFINANCE_AVAILABLE or not tickers:
        return {}

    result: dict[str, float] = {}
    try:
        raw = yf.download(
            tickers,
            period="2d",
            interval="1d",
            progress=False,
            auto_adjust=True,
            threads=True,
        )
        if raw.empty:
            return result

        if len(tickers) == 1:
            close_series = raw.get("Close")
            if close_series is not None and not close_series.empty:
                price = float(close_series.iloc[-1])
                if price and price > 0:
                    result[tickers[0]] = price
        else:
            close_df = raw.get("Close")
            if close_df is not None:
                for ticker in tickers:
                    col = close_df.get(ticker)
                    if col is not None:
                        last = col.dropna()
                        if not last.empty:
                            price = float(last.iloc[-1])
                            if price > 0:
                                result[ticker] = price

    except Exception as e:
        logger.warning(f"Batch price fetch failed: {e}")

    return result


def _resolve_ticker_variants(ticker: str) -> list[str]:
    """
    Return an ordered list of yfinance ticker symbols to try for a given ticker.

    Indian broker CSVs (Zerodha, Groww, Upstox, Angel) export bare tickers like
    "TCS", "INFY", "RELIANCE" without an exchange suffix. Yahoo Finance requires
    "TCS.NS" (NSE) or "TCS.BO" (BSE).

    Priority:
      - Bare ticker (no dot):  try <TICKER>.NS → <TICKER>.BO → <TICKER>
      - Already has .NS:       try <TICKER>.NS → <TICKER>.BO
      - Already has .BO:       try <TICKER>.BO → <TICKER>.NS
      - Other (e.g. AAPL):     try as-is only
    """
    if ".NS" in ticker:
        return [ticker, ticker.replace(".NS", ".BO")]
    elif ".BO" in ticker:
        return [ticker, ticker.replace(".BO", ".NS")]
    elif "." not in ticker:
        # Likely a bare Indian equity ticker from a broker export
        return [f"{ticker}.NS", f"{ticker}.BO", ticker]
    else:
        return [ticker]


def _fetch_fundamentals_single(ticker: str) -> dict:
    """
    Fetch fundamentals for a single ticker via yf.Ticker().info.
    Slow (1–2s) but comprehensive. Results are cached for FUND_TTL.

    Tries exchange-suffix variants automatically so that bare tickers from
    Indian broker CSVs (e.g. "TCS") resolve to "TCS.NS" without the caller
    needing to know the suffix.

    Returns {} on complete failure — caller handles this.
    """
    if not YFINANCE_AVAILABLE:
        return {}

    variants = _resolve_ticker_variants(ticker)
    info: dict = {}
    resolved_ticker = ticker

    for variant in variants:
        try:
            candidate = yf.Ticker(variant).info
            if candidate and (
                candidate.get("trailingPE") is not None
                or candidate.get("marketCap") is not None
                or candidate.get("longName") is not None
            ):
                info = candidate
                resolved_ticker = variant
                break
        except Exception as exc:
            logger.debug("Fundamentals attempt failed for %s: %s", variant, exc)

    # Last-resort: use whatever came back from the first variant (may be partial)
    if not info and variants:
        try:
            info = yf.Ticker(variants[0]).info or {}
            resolved_ticker = variants[0]
        except Exception as exc:
            logger.warning("Fundamentals fetch failed for all variants of %s: %s", ticker, exc)
            return {}

    if not info:
        # yfinance returned nothing — try FMP as a fallback if key is configured
        fmp_data = _fetch_fmp_fundamentals(ticker)
        if fmp_data:
            logger.debug("yfinance returned empty for %s; using FMP fallback", ticker)
            return fmp_data
        logger.warning(
            "Enrichment unavailable for %s: yfinance returned no data and FMP is %s",
            ticker,
            "unconfigured (no FINANCIAL_MODELING_PREP_API_KEY)" if not settings.FINANCIAL_MODELING_PREP_API_KEY else "not returning data",
        )
        return {}

    def _safe(key: str, scale: float = 1.0) -> float | None:
        val = info.get(key)
        if val is None or val == 0:
            return None
        try:
            return round(float(val) * scale, 4)
        except (TypeError, ValueError):
            return None

    result = {
        "name":             info.get("longName") or info.get("shortName"),
        "sector":           info.get("sector"),
        "industry":         info.get("industry"),
        "pe_ratio":         _safe("trailingPE"),
        "forward_pe":       _safe("forwardPE"),
        "pb_ratio":         _safe("priceToBook"),
        "ev_ebitda":        _safe("enterpriseToEbitda"),
        "peg_ratio":        _safe("pegRatio"),
        "market_cap":       _safe("marketCap", scale=1e-7),     # crores
        "dividend_yield":   _safe("dividendYield", scale=100),  # %
        "roe":              _safe("returnOnEquity", scale=100),  # %
        "roa":              _safe("returnOnAssets", scale=100),  # %
        "revenue_growth":   _safe("revenueGrowth", scale=100),
        "earnings_growth":  _safe("earningsGrowth", scale=100),
        "operating_margin": _safe("operatingMargins", scale=100),
        "profit_margin":    _safe("profitMargins", scale=100),
        "debt_to_equity":   _safe("debtToEquity"),
        "source":           "yfinance",
        "resolved_ticker":  resolved_ticker,
    }

    # ── Sector supplement via FMP ─────────────────────────────────────────────
    # If yfinance returned data but sector is None (common for some tickers),
    # try FMP to fill in sector, industry, and name — without replacing existing values.
    if result.get("sector") is None and settings.FINANCIAL_MODELING_PREP_API_KEY:
        fmp_data = _fetch_fmp_fundamentals(ticker)
        if fmp_data.get("sector"):
            logger.debug(
                "yfinance missing sector for %s; supplemented sector='%s' from FMP",
                ticker, fmp_data["sector"],
            )
            result["sector"]   = fmp_data["sector"]
            result["industry"] = result.get("industry") or fmp_data.get("industry")
            if not result.get("name"):
                result["name"] = fmp_data.get("name")
            result["sector_source"] = "fmp_supplement"
    elif result.get("sector") is None:
        logger.warning(
            "Sector unavailable for %s: yfinance returned no sector and FMP is not configured",
            ticker,
        )

    return result


# ─── Static peer map (no yfinance peer discovery API exists) ──────────────────
# Covers all major NIFTY 50 components plus large-caps across key sectors.
# Bare-ticker lookups (e.g. "TCS") are handled by get_peers() which normalises
# to ".NS" suffix before looking up this map.

_PEER_MAP: dict[str, list[str]] = {
    # ── Information Technology ────────────────────────────────────────────────
    "TCS.NS":        ["INFY.NS",       "HCLTECH.NS",  "WIPRO.NS",  "TECHM.NS",  "LTIM.NS"      ],
    "INFY.NS":       ["TCS.NS",        "HCLTECH.NS",  "WIPRO.NS",  "TECHM.NS",  "LTIM.NS"      ],
    "HCLTECH.NS":    ["TCS.NS",        "INFY.NS",     "WIPRO.NS",  "TECHM.NS",  "LTIM.NS"      ],
    "WIPRO.NS":      ["TCS.NS",        "INFY.NS",     "HCLTECH.NS","TECHM.NS",  "LTIM.NS"      ],
    "TECHM.NS":      ["TCS.NS",        "INFY.NS",     "HCLTECH.NS","WIPRO.NS",  "LTIM.NS"      ],
    "LTIM.NS":       ["TCS.NS",        "INFY.NS",     "HCLTECH.NS","WIPRO.NS",  "TECHM.NS"     ],
    "MPHASIS.NS":    ["LTIM.NS",       "COFORGE.NS",  "PERSISTENT.NS","HEXAWARE.NS"             ],
    "COFORGE.NS":    ["MPHASIS.NS",    "LTIM.NS",     "PERSISTENT.NS"                           ],
    "PERSISTENT.NS": ["MPHASIS.NS",    "COFORGE.NS",  "LTIM.NS"                                 ],

    # ── Banking & Financial Services ──────────────────────────────────────────
    "HDFCBANK.NS":   ["ICICIBANK.NS",  "KOTAKBANK.NS","AXISBANK.NS","SBIN.NS"                   ],
    "ICICIBANK.NS":  ["HDFCBANK.NS",   "KOTAKBANK.NS","AXISBANK.NS","SBIN.NS"                   ],
    "KOTAKBANK.NS":  ["HDFCBANK.NS",   "ICICIBANK.NS","AXISBANK.NS","INDUSINDBK.NS"             ],
    "AXISBANK.NS":   ["HDFCBANK.NS",   "ICICIBANK.NS","KOTAKBANK.NS","INDUSINDBK.NS"            ],
    "SBIN.NS":       ["HDFCBANK.NS",   "ICICIBANK.NS","BANKBARODA.NS","CANARABANK.NS"           ],
    "INDUSINDBK.NS": ["KOTAKBANK.NS",  "AXISBANK.NS", "FEDERALBNK.NS","BANDHANBNK.NS"          ],
    "BANDHANBNK.NS": ["INDUSINDBK.NS", "FEDERALBNK.NS","IDFCFIRSTB.NS"                         ],
    "BANKBARODA.NS": ["SBIN.NS",       "CANARABANK.NS","UNIONBANK.NS"                           ],
    "BAJFINANCE.NS": ["BAJAJFINSV.NS", "HDFCAMC.NS",  "CHOLAFIN.NS","MUTHOOTFIN.NS"            ],
    "BAJAJFINSV.NS": ["BAJFINANCE.NS", "HDFCAMC.NS",  "SBILIFE.NS","HDFCLIFE.NS"              ],
    "HDFCLIFE.NS":   ["SBILIFE.NS",    "ICICIPRULIFE.NS","MAXLIFE.NS"                           ],
    "SBILIFE.NS":    ["HDFCLIFE.NS",   "ICICIPRULIFE.NS","MAXLIFE.NS"                           ],

    # ── Oil, Gas & Energy ─────────────────────────────────────────────────────
    "RELIANCE.NS":   ["ONGC.NS",       "BPCL.NS",     "IOC.NS",    "GAIL.NS"                   ],
    "ONGC.NS":       ["RELIANCE.NS",   "BPCL.NS",     "IOC.NS",    "GAIL.NS",   "OIL.NS"       ],
    "BPCL.NS":       ["ONGC.NS",       "IOC.NS",      "HPCL.NS",   "RELIANCE.NS"               ],
    "IOC.NS":        ["ONGC.NS",       "BPCL.NS",     "HPCL.NS",   "GAIL.NS"                   ],
    "GAIL.NS":       ["ONGC.NS",       "IOC.NS",      "PETRONET.NS"                             ],
    "HPCL.NS":       ["BPCL.NS",       "IOC.NS",      "ONGC.NS"                                 ],
    "POWERGRID.NS":  ["NTPC.NS",       "ADANIGREEN.NS","TORNTPOWER.NS"                          ],
    "NTPC.NS":       ["POWERGRID.NS",  "ADANIGREEN.NS","ADANIPOWER.NS","TATAPOWER.NS"           ],
    "TATAPOWER.NS":  ["NTPC.NS",       "POWERGRID.NS","ADANIGREEN.NS","TORNTPOWER.NS"           ],

    # ── Automobile ────────────────────────────────────────────────────────────
    "MARUTI.NS":     ["TATAMOTORS.NS", "M&M.NS",      "HYUNDAI.NS", "BAJAJ-AUTO.NS"            ],
    "TATAMOTORS.NS": ["MARUTI.NS",     "M&M.NS",      "BAJAJ-AUTO.NS","EICHERMOT.NS"           ],
    "M&M.NS":        ["MARUTI.NS",     "TATAMOTORS.NS","BAJAJ-AUTO.NS","EICHERMOT.NS"          ],
    "BAJAJ-AUTO.NS": ["HEROMOTOCO.NS", "EICHERMOT.NS","TVSMOTORS.NS","MARUTI.NS"               ],
    "HEROMOTOCO.NS": ["BAJAJ-AUTO.NS", "TVSMOTORS.NS","EICHERMOT.NS"                           ],
    "EICHERMOT.NS":  ["BAJAJ-AUTO.NS", "HEROMOTOCO.NS","TVSMOTORS.NS"                          ],
    "BOSCHLTD.NS":   ["MOTHERSON.NS",  "BHARATFORG.NS","APOLLOTYRE.NS"                         ],

    # ── FMCG ──────────────────────────────────────────────────────────────────
    "HINDUNILVR.NS": ["ITC.NS",        "NESTLEIND.NS","DABUR.NS",  "MARICO.NS","BRITANNIA.NS"  ],
    "ITC.NS":        ["HINDUNILVR.NS", "NESTLEIND.NS","GODREJCP.NS","COLPAL.NS"                ],
    "NESTLEIND.NS":  ["HINDUNILVR.NS", "BRITANNIA.NS","DABUR.NS",  "MARICO.NS"                ],
    "DABUR.NS":      ["HINDUNILVR.NS", "MARICO.NS",   "GODREJCP.NS","EMAMILTD.NS"             ],
    "MARICO.NS":     ["HINDUNILVR.NS", "DABUR.NS",    "EMAMILTD.NS","GODREJCP.NS"             ],
    "BRITANNIA.NS":  ["NESTLEIND.NS",  "HINDUNILVR.NS","ITC.NS"                               ],
    "GODREJCP.NS":   ["HINDUNILVR.NS", "DABUR.NS",    "MARICO.NS", "ITC.NS"                   ],
    "COLPAL.NS":     ["HINDUNILVR.NS", "DABUR.NS",    "GODREJCP.NS"                           ],

    # ── Pharmaceuticals & Healthcare ──────────────────────────────────────────
    "SUNPHARMA.NS":  ["DRREDDY.NS",    "CIPLA.NS",    "DIVISLAB.NS","LUPIN.NS","AUROPHARMA.NS" ],
    "DRREDDY.NS":    ["SUNPHARMA.NS",  "CIPLA.NS",    "DIVISLAB.NS","LUPIN.NS"                ],
    "CIPLA.NS":      ["SUNPHARMA.NS",  "DRREDDY.NS",  "LUPIN.NS",  "AUROPHARMA.NS"            ],
    "DIVISLAB.NS":   ["SUNPHARMA.NS",  "DRREDDY.NS",  "CIPLA.NS",  "LUPIN.NS"                 ],
    "LUPIN.NS":      ["SUNPHARMA.NS",  "DRREDDY.NS",  "CIPLA.NS",  "AUROPHARMA.NS"            ],
    "AUROPHARMA.NS": ["SUNPHARMA.NS",  "CIPLA.NS",    "LUPIN.NS",  "TORNTPHARM.NS"            ],
    "APOLLOHOSP.NS": ["FORTIS.NS",     "NARAYANAHT.NS","ASTER.NS",  "MAXHEALTH.NS"             ],
    "TORNTPHARM.NS": ["SUNPHARMA.NS",  "CIPLA.NS",    "AUROPHARMA.NS"                         ],

    # ── Metals & Mining ───────────────────────────────────────────────────────
    "TATASTEEL.NS":  ["JSWSTEEL.NS",   "HINDALCO.NS", "SAIL.NS",   "VEDL.NS"                  ],
    "JSWSTEEL.NS":   ["TATASTEEL.NS",  "HINDALCO.NS", "SAIL.NS",   "JSPL.NS"                  ],
    "HINDALCO.NS":   ["TATASTEEL.NS",  "JSWSTEEL.NS", "VEDL.NS",   "NATIONALUM.NS"            ],
    "VEDL.NS":       ["HINDALCO.NS",   "TATASTEEL.NS","COALINDIA.NS","JSWSTEEL.NS"             ],
    "COALINDIA.NS":  ["VEDL.NS",       "NMDC.NS",     "HINDALCO.NS"                           ],
    "SAIL.NS":       ["TATASTEEL.NS",  "JSWSTEEL.NS", "JSPL.NS"                               ],
    "HINDZINC.NS":   ["VEDL.NS",       "HINDALCO.NS", "NATIONALUM.NS"                         ],

    # ── Cement ────────────────────────────────────────────────────────────────
    "ULTRACEMCO.NS": ["AMBUJACEM.NS",  "ACC.NS",      "SHREECEM.NS","DALMIA.NS"               ],
    "AMBUJACEM.NS":  ["ULTRACEMCO.NS", "ACC.NS",      "SHREECEM.NS"                           ],
    "SHREECEM.NS":   ["ULTRACEMCO.NS", "AMBUJACEM.NS","ACC.NS"                                ],

    # ── Infrastructure & Conglomerates ────────────────────────────────────────
    "ADANIENT.NS":   ["ADANIPORTS.NS", "ADANIGREEN.NS","ADANIPOWER.NS","ADANITRANS.NS"         ],
    "ADANIPORTS.NS": ["ADANIENT.NS",   "CONCOR.NS",   "GATEWAY.NS"                            ],
    "LT.NS":         ["SIEMENS.NS",    "ABB.NS",      "BHEL.NS",   "TECHNO.NS"                ],
    "SIEMENS.NS":    ["LT.NS",         "ABB.NS",      "BHEL.NS"                               ],

    # ── Consumer Discretionary / Retail ──────────────────────────────────────
    "TITAN.NS":      ["ASIANPAINT.NS", "PIDILITIND.NS","HAVELLS.NS","WHIRLPOOL.NS"             ],
    "ASIANPAINT.NS": ["BERGER.NS",     "KANSAINER.NS","INDIGO.NS", "PIDILITIND.NS"            ],
    "PIDILITIND.NS": ["ASIANPAINT.NS", "BERGER.NS",   "KANSAINER.NS"                          ],
    "HAVELLS.NS":    ["VOLTAS.NS",     "BLUESTAR.NS", "CROMPTON.NS"                           ],
    "DMART.NS":      ["TRENT.NS",      "ABFRL.NS",    "VMART.NS",  "NYKAA.NS"                 ],

    # ── Telecom ───────────────────────────────────────────────────────────────
    "BHARTIARTL.NS": ["IDEA.NS",       "TATACOMM.NS", "RAILTEL.NS"                            ],
    "IDEA.NS":       ["BHARTIARTL.NS", "TATACOMM.NS"                                          ],

    # ── Real Estate ───────────────────────────────────────────────────────────
    "DLF.NS":        ["GODREJPROP.NS", "OBEROIRLTY.NS","PRESTIGE.NS","BRIGADE.NS"             ],
    "GODREJPROP.NS": ["DLF.NS",        "OBEROIRLTY.NS","PRESTIGE.NS"                          ],
}


# ─── NewsAPI integration ──────────────────────────────────────────────────────
# Fetches real financial news from newsapi.org when NEWS_API_KEY is set in .env.
# Free tier: 100 requests/day.  Results are NOT cached (each call is fresh) to
# keep news current.  Set NEWS_API_KEY in .env to enable.

_NEWSAPI_BASE = "https://newsapi.org/v2"

# Map event_type → NewsAPI search modifier (optional sentiment/topic keywords)
_EVENT_QUERY_MAP: dict[str, str] = {
    "earnings":       "earnings OR results OR quarterly",
    "dividend":       "dividend",
    "deal":           "merger OR acquisition OR deal",
    "rating":         "upgrade OR downgrade OR rating",
    "company_update": "announcement",
    "regulatory":     "SEBI OR regulatory OR compliance",
    "management":     "CEO OR management OR leadership",
    "market_event":   "market",
}


def _fetch_newsapi_articles(
    tickers: list[str],
    event_type: Optional[str] = None,
    max_articles: int = 30,
) -> list[dict]:
    """
    Fetch news articles from newsapi.org for the given tickers.

    Strategy:
    - Build a query from bare ticker names (TCS.NS → TCS) joined with OR
    - Optionally append an event_type keyword modifier
    - Returns articles normalised to the same shape as the mock provider
    - Returns [] on any error (never raises — callers expect a list)
    """
    api_key = settings.NEWS_API_KEY
    if not api_key:
        return []

    # Normalise tickers: strip .NS / .BO suffixes for better search
    bare = list({t.split(".")[0] for t in tickers if t})
    if not bare:
        return []

    # NewsAPI query: (TCS OR INFY OR HDFCBANK) earnings
    ticker_query = " OR ".join(f'"{b}"' for b in bare[:10])  # cap at 10 to stay within URL limits
    event_suffix = _EVENT_QUERY_MAP.get(event_type or "", "") if event_type else ""
    q = f"({ticker_query})" + (f" {event_suffix}" if event_suffix else "")

    try:
        import httpx
        resp = httpx.get(
            f"{_NEWSAPI_BASE}/everything",
            params={
                "q":          q,
                "language":   "en",
                "sortBy":     "publishedAt",
                "pageSize":   max_articles,
                "apiKey":     api_key,
            },
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()

        if data.get("status") != "ok":
            logger.warning("NewsAPI returned non-ok status: %s", data.get("message"))
            return []

        articles: list[dict] = []
        for raw in data.get("articles", []):
            # Identify which tickers this article mentions
            title   = (raw.get("title") or "").upper()
            desc    = (raw.get("description") or "").upper()
            content = title + " " + desc
            matched = [b for b in bare if b.upper() in content]

            articles.append({
                "id":          raw.get("url", "")[-40:],  # short unique id from URL tail
                "title":       raw.get("title") or "",
                "summary":     raw.get("description") or "",
                "source":      (raw.get("source") or {}).get("name") or "NewsAPI",
                "url":         raw.get("url") or "",
                "published_at": raw.get("publishedAt") or "",
                "tickers":     matched if matched else bare[:3],  # fallback: first 3 tickers
                "event_type":  event_type or "company_update",
                "sentiment":   "neutral",  # NewsAPI free tier has no sentiment; label neutral
                "data_source": "newsapi",
            })

        logger.debug("NewsAPI returned %d articles for query: %s", len(articles), q)
        return articles

    except Exception as exc:
        logger.warning("NewsAPI fetch failed: %s", exc)
        return []


# ─── Provider implementation ──────────────────────────────────────────────────

class LiveAPIProvider(BaseDataProvider):
    """
    Live market data provider backed by Yahoo Finance (yfinance).

    Portfolio positions are loaded from the active portfolio in the database.
    Live prices from yfinance are applied on top of those positions.
    When yfinance data is unavailable, holdings are returned with data_source="unavailable"
    rather than silently substituting mock data.
    """

    def __init__(self, db: Optional[Session] = None):
        """
        db: SQLAlchemy Session for loading active portfolio holdings.
            If not provided, get_holdings() will return an empty list with a warning.
        """
        self._db = db

    @property
    def mode_name(self) -> str:
        return "live"

    @property
    def is_available(self) -> bool:
        return settings.LIVE_API_ENABLED

    # ─── Holdings ─────────────────────────────────────────────────────────────

    async def get_holdings(self) -> list[HoldingBase]:
        """
        Returns active portfolio positions from the database, enriched with
        live prices from yfinance.

        data_source per holding:
          "live"        — yfinance returned a valid current price
          "db_only"     — yfinance unavailable, using DB-stored current_price
          "unavailable" — yfinance unavailable and no DB price stored
        """
        if self._db is None:
            logger.error("LiveAPIProvider.get_holdings() called without a db session")
            return []

        # 1. Load active portfolio from DB
        from app.models.portfolio import Portfolio, Holding as HoldingORM

        active = (
            self._db.query(Portfolio)
            .filter(Portfolio.is_active == True)  # noqa: E712
            .first()
        )
        if active is None:
            # No active portfolio — return empty rather than silently falling back to mock
            logger.warning("LiveAPIProvider: no active portfolio found in DB")
            return []

        db_holdings: list[HoldingORM] = active.holdings

        if not db_holdings:
            logger.warning(f"LiveAPIProvider: active portfolio {active.id} has no holdings")
            return []

        if not YFINANCE_AVAILABLE:
            logger.warning("yfinance not available — returning DB prices in live mode")
            result: list[HoldingBase] = []
            for h in db_holdings:
                result.append(HoldingBase(
                    ticker=h.ticker,
                    name=h.name,
                    quantity=h.quantity,
                    average_cost=h.average_cost,
                    current_price=h.current_price,
                    sector=h.sector,
                    asset_class=h.asset_class or "Equity",
                    currency=h.currency or "INR",
                    data_source="db_only" if h.current_price else "unavailable",
                ))
            return result

        # 2. Batch-fetch live prices
        tickers = [h.ticker for h in db_holdings]
        live_prices = _fetch_live_prices_batch(tickers)

        # Cache individual results
        for ticker, price in live_prices.items():
            _store_price(ticker, price)

        # 3. Enrich holdings
        final: list[HoldingBase] = []
        for h in db_holdings:
            cached   = _price_from_cache(h.ticker)
            live_px  = live_prices.get(h.ticker) or cached

            if live_px:
                current_price = round(live_px, 2)
                data_source   = "live"
            elif h.current_price:
                current_price = h.current_price
                data_source   = "db_only"
            else:
                current_price = h.average_cost  # fallback to cost so math doesn't break
                data_source   = "unavailable"

            final.append(HoldingBase(
                ticker=h.ticker,
                name=h.name,
                quantity=h.quantity,
                average_cost=h.average_cost,
                current_price=current_price,
                sector=h.sector,
                asset_class=h.asset_class or "Equity",
                currency=h.currency or "INR",
                data_source=data_source,
            ))

        return final

    # ─── Price history ────────────────────────────────────────────────────────

    async def get_price_history(
        self, ticker: str, period: str = "1y", interval: str = "1d"
    ) -> dict:
        """
        Fetch price history from yfinance.
        Returns source="unavailable" with empty data[] if yfinance fails.
        Never falls back to mock data.
        """
        if not YFINANCE_AVAILABLE:
            return {
                "ticker":   ticker,
                "period":   period,
                "interval": interval,
                "data":     [],
                "source":   "unavailable",
                "error":    "yfinance not installed",
            }

        try:
            data = yf.Ticker(ticker).history(period=period, interval=interval, auto_adjust=True)
            if data.empty:
                raise ValueError(f"No price history returned for {ticker}")

            records = []
            for dt, row in data.iterrows():
                records.append({
                    "date":   str(dt.date()),
                    "open":   round(float(row["Open"]),  2),
                    "high":   round(float(row["High"]),  2),
                    "low":    round(float(row["Low"]),   2),
                    "close":  round(float(row["Close"]), 2),
                    "volume": int(row.get("Volume", 0)),
                })

            return {
                "ticker":   ticker,
                "period":   period,
                "interval": interval,
                "data":     records,
                "source":   "yfinance",
            }

        except Exception as e:
            logger.warning(f"Price history fetch failed for {ticker}: {e}")
            return {
                "ticker":   ticker,
                "period":   period,
                "interval": interval,
                "data":     [],
                "source":   "unavailable",
                "error":    str(e),
            }

    # ─── Fundamentals ─────────────────────────────────────────────────────────

    async def get_fundamentals(self, ticker: str) -> dict:
        """
        Fetch fundamentals from yfinance.
        Resolves bare Indian equity tickers (e.g. "TCS" → "TCS.NS") automatically.
        Returns source="unavailable" with null fields if yfinance fails.
        Never falls back to mock data.
        """
        # Check cache for any known variant of this ticker
        for variant in _resolve_ticker_variants(ticker):
            cached = _fund_from_cache(variant)
            if cached:
                return {"ticker": ticker, **cached, "from_cache": True}

        if not YFINANCE_AVAILABLE:
            return {
                "ticker": ticker,
                "source": "unavailable",
                "error":  "yfinance not installed",
            }

        data = _fetch_fundamentals_single(ticker)

        if not data:
            return {
                "ticker": ticker,
                "source": "unavailable",
                "error":  "yfinance returned empty fundamentals",
            }

        # Cache under the resolved ticker so subsequent lookups hit the cache
        resolved = data.get("resolved_ticker", ticker)
        _store_fund(resolved, data)
        # Also cache under the original ticker as a convenience alias
        if resolved != ticker:
            _store_fund(ticker, data)
        return {"ticker": ticker, **data}

    # ─── News ─────────────────────────────────────────────────────────────────

    async def get_news(
        self, tickers: list[str], event_type: Optional[str] = None
    ) -> list[dict]:
        """
        Fetch real news from NewsAPI.org when NEWS_API_KEY is configured.
        Returns an empty list (not mock data) when the key is absent.
        """
        if settings.NEWS_API_KEY:
            return _fetch_newsapi_articles(tickers, event_type)
        logger.debug("LiveAPIProvider.get_news: NEWS_API_KEY not configured")
        return []

    async def get_events(
        self, tickers: list[str], event_type: Optional[str] = None
    ) -> list[dict]:
        """
        Corporate events are not available in live mode without a news/events API.
        Returns empty list — does not delegate to mock.
        """
        logger.debug("LiveAPIProvider.get_events: no events source configured in live mode")
        return []

    # ─── Peers ────────────────────────────────────────────────────────────────

    async def get_peers(self, ticker: str) -> list[str]:
        """
        Returns peer list from the static map, with FMP as a discovery fallback
        for tickers not covered by _PEER_MAP.

        Priority:
          1. Static _PEER_MAP (instant, no API calls)
          2. FMP /stock_peers (if FINANCIAL_MODELING_PREP_API_KEY is set)
          3. Empty list
        """
        if ticker in _PEER_MAP:
            return _PEER_MAP[ticker]
        # Try exchange-suffixed variants against the static map
        for variant in _resolve_ticker_variants(ticker):
            if variant in _PEER_MAP:
                return _PEER_MAP[variant]
        # Static map miss — try FMP if key is configured
        fmp_peers = _fetch_fmp_peers(ticker)
        if fmp_peers:
            logger.debug("FMP peer discovery returned %d peers for %s", len(fmp_peers), ticker)
            return fmp_peers
        return []

    # ─── Cache inspection (for /debug) ────────────────────────────────────────

    @staticmethod
    def cache_status() -> dict:
        now = time.time()
        return {
            "yfinance_available": YFINANCE_AVAILABLE,
            "price_cache_size":   len(_PRICE_CACHE),
            "fund_cache_size":    len(_FUND_CACHE),
            "price_ttl_seconds":  PRICE_TTL,
            "fund_ttl_seconds":   FUND_TTL,
            "cached_price_tickers": [
                {
                    "ticker":      t,
                    "price":       v[0],
                    "age_seconds": round(now - v[1], 1),
                    "fresh":       (now - v[1]) < PRICE_TTL,
                }
                for t, v in _PRICE_CACHE.items()
            ],
        }
