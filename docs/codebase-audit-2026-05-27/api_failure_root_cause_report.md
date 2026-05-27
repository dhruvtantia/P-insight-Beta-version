# API Failure Root Cause Report

## Executive Summary

The main live-data failure pattern is not a missing Python dependency. `yfinance`, `httpx`, `pandas`, and `numpy` import correctly inside `backend/.venv`. The practical failure point is external provider reachability and coverage:

- Yahoo Finance calls failed during smoke with DNS errors to `guce.yahoo.com`.
- NewsAPI calls failed during smoke with DNS/name resolution errors.
- Some endpoints correctly return explicit degraded metadata.
- Some frontend paths still hide or soften provider failure.
- Several features depend on yfinance, so one provider outage has broad blast radius.

## Smoke Results

Observed with FastAPI `TestClient` on 2026-05-27:

| Endpoint | Result | Observed failure/degradation |
|---|---:|---|
| `/health` | 200 | Healthy; reported live API true, broker false, AI chat false, yfinance true, several API keys configured. |
| `/readiness` | 200 | SQLite DB check passed. |
| `/api/v1/system/features` | 200 | Feature registry returned feature health states. |
| `/api/v1/live/status` | 200 | `yfinance_available=true`, cache empty. |
| `/api/v1/live/quotes?tickers=TCS.NS,INVALIDTICKER.NS` | 200 | Returned empty prices and both tickers missing. Logs showed Yahoo DNS failure. |
| `/api/v1/live/fundamentals?ticker=TCS.NS` | 404 | Returned generic "ticker may not exist or rate-limited"; logs showed DNS failure. |
| `/api/v1/market/overview` | 200 | Returned `available=false`; indices/movers unavailable. Logs showed Yahoo DNS failures. |
| `/api/v1/news/?mode=uploaded&tickers=TCS.NS` | 200 | Returned `news_status=unavailable`; reason captured provider error. |
| `/api/v1/news/events?mode=uploaded&tickers=TCS.NS` | 200 | Returned empty events; no real corporate events provider. |
| `/api/v1/quant/status?mode=uploaded&period=1y` | 200 | Returned zero valid tickers and excluded all active portfolio tickers due unavailable histories. |
| `/api/v1/optimization/status?mode=uploaded&period=1y` | 200 | Returned empty optimization status when price histories unavailable. |
| `/api/v1/advisor/status` | 200 | Returned `available=false`, provider `none`, no AI provider configured. |

## Provider-Level Root Causes

### Yahoo Finance / yfinance

Used by:

- `/api/v1/live/quotes`
- `/api/v1/live/fundamentals`
- live-mode portfolio holdings
- upload price enrichment
- market overview indices and movers
- benchmark history
- quant/risk price histories
- optimization inputs
- history/changes build
- peer fundamentals

Failure modes found or implied by code:

- DNS/network failure to Yahoo hosts such as `guce.yahoo.com`.
- Empty downloads or empty `Close` series.
- Timeout on quotes, fundamentals, market index fetches, or peer fetches.
- Ticker coverage mismatch, especially bare Indian tickers requiring `.NS` or `.BO`.
- Unsupported or stale Yahoo index symbols.
- Yahoo rate limiting or crumb/cookie failures.
- Local yfinance cache folder not writable: smoke logged inability to use `/Users/dhruvtantia/Library/Caches/py-yfinance`.

Current handling:

- `/live/quotes` returns 200 with `missing` and `status_by_ticker`; it does not include the low-level DNS reason.
- `/live/fundamentals` can return 404 with a generic not found/rate-limited explanation.
- `/market/overview` returns per-index unavailable status and a mover status.
- quant/risk excludes failed tickers and returns coverage metadata.
- benchmark returns `source=unavailable` on failure.

Main gap:

The backend often knows only that yfinance returned no data, while logs contain the true transport failure. User-facing responses should preserve a safe reason code such as `provider_dns_error`, `provider_timeout`, `provider_empty_response`, or `ticker_not_found`.

### NewsAPI

Used by:

- `/api/v1/news`
- market headlines through frontend `newsApi.getNews`

Failure modes:

- Missing `NEWS_API_KEY`.
- DNS/network failure.
- Provider non-ok response.
- Empty valid search result.
- Free-tier limits or query limitations.

Current handling:

- `news_status` distinguishes `ok`, `empty`, and `unavailable`.
- `news_reason` captures provider failure text.
- Missing key is treated as unavailable.

Main gap:

Corporate events are separate from articles but have no real provider. They can return empty and look like no events matched.

### Financial Modeling Prep

Used by:

- fundamentals fallback/supplement when yfinance returns no/partial fundamentals.
- peer discovery fallback after static peer map miss.

Failure modes:

- Missing key.
- FMP does not cover requested Indian ticker.
- FMP free-tier limits.
- Network/provider error.

Current handling:

- FMP is silently skipped when key absent.
- FMP failures are debug/warning logs and usually result in unavailable fundamentals or no peers.

Main gap:

FMP availability is not surfaced as a first-class feature dependency in the registry, even though it materially affects fundamentals and peer discovery coverage.

### LLM Providers

Used by:

- `/api/v1/advisor/ask`

Failure modes:

- Missing Anthropic/OpenAI key.
- Provider package not installed.
- Provider runtime failure.

Current handling:

- `/advisor/status` reports unavailable when no key is configured.
- `/advisor/ask` can return `fallback_used=True`.
- Frontend then executes rule-based fallback.

Main gap:

Fallback ownership is split between backend and frontend, making behavior harder to test and version.

## Endpoint-Level Recommendations

### `/api/v1/live/quotes`

- Add `reason_by_ticker` and a top-level `provider_error_code`.
- Preserve distinction between invalid ticker, provider empty response, timeout, and DNS/network failure.
- Make watchlist and live quote hooks render missing/status details.

### `/api/v1/live/fundamentals`

- Replace generic 404 detail with typed errors:
  - `ticker_not_found`
  - `provider_timeout`
  - `provider_network_error`
  - `provider_rate_limited`
  - `provider_empty_response`
- Include whether yfinance and FMP were tried.

### `/api/v1/market/overview`

- Keep current per-index status model.
- Add top-level `provider_error_code` when all major sections fail.
- Cache last-known-good market overview separately from short TTL fresh cache.

### `/api/v1/news` and `/api/v1/news/events`

- Keep `ok` / `empty` / `unavailable`.
- Mark events as `unavailable` or `not_configured` when no event provider exists; do not use a normal empty state for missing provider.

### `/api/v1/peers/{ticker}`

- Keep sparse/incomplete metadata.
- Surface FMP configured/unconfigured status.
- Version or timestamp the static peer map.

### `/api/v1/quant/*` and `/api/v1/optimization/*`

- Preserve `coverage_pct`, `excluded_tickers`, and per-ticker reason.
- Add clearer frontend gating when coverage is 0 or below a threshold.
- Declare `scipy`/`sklearn` runtime status in optimizer responses and UI.

### `/api/v1/watchlist/*`

- CRUD is not the failure point; tenancy is.
- Add user ownership and unique constraints per user/ticker.
- Pair list data with quote-status data only when the quote hook exposes failure states.

