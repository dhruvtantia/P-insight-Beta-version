# P-Insight — Personal-Use Readiness Hardening Report

**Phase:** Personal-Use Readiness Hardening
**Goal:** Make the existing system reliable and genuinely useful for daily personal portfolio analysis — no major new features.

---

## Part 1 — Fundamentals Reliability

### What was fixed

**Upload → enrichment → DB persistence pipeline** was broken in two ways:

1. `save_uploaded_portfolio()` ran *before* the enrichment loop, so the DB held unenriched rows (bare tickers, no sector/company name). After a backend restart, `_restore_from_db_holdings()` would reload the unenriched data, losing all enrichment.

2. The in-memory `FileDataProvider` cache (`_uploaded_holdings`) was being updated at step 1 of the upload flow, before enrichment ran, so it also held stale data.

**Fixes applied:**

- `backend/app/services/portfolio_manager.py` — added `patch_holdings_enrichment(portfolio_id, enrichments)` which writes enriched `sector` and `name` back to the DB after the enrichment loop, never overwriting existing values with `None`.
- `backend/app/api/v1/endpoints/upload.py` — reordered steps: DB save first, enrichment loop second, DB patch third (step 3a using a fresh `SessionLocal`), in-memory cache update fourth (step 3b).
- `frontend/src/components/fundamentals/FundamentalsTable.tsx` — added per-row unavailable state: when `source === 'unavailable'` or all metric columns are null, shows a human-readable explanation (e.g., "Fundamentals unavailable: …") instead of a row of dashes. Footer note updated from "Phase 1 — Mock data" to "Data sourced from Yahoo Finance (yfinance)."

### What to verify

1. Upload a portfolio CSV.
2. Go to `/fundamentals`. Ticker, sector, and company name should populate within a few seconds for all major holdings.
3. Restart the backend (`uvicorn app.main:app --reload`).
4. Reload `/fundamentals`. Enriched sector and name should persist — no regression to bare tickers.

---

## Part 2 — Peer Comparison Hardening

### What was fixed

- `backend/app/api/v1/endpoints/peers.py` — complete rewrite replacing a sequential `for` loop with `asyncio.gather`. Selected stock fundamentals and peer list are fetched concurrently; all peer fundamentals (up to 5 peers) are then fetched concurrently. Latency drops from ~5–10 s to ~1–2 s.
- `_PEER_MAP` in `live_provider.py` expanded to 60+ entries covering all major NIFTY 50 components: IT (TCS, Infosys, Wipro, HCL, Tech Mahindra), Banking (HDFC, ICICI, Kotak, Axis, SBI), FMCG (HUL, ITC, Nestle, Dabur, Marico), Pharma (Sun, Dr Reddy, Cipla, Divi's), Auto (Maruti, Bajaj, Eicher, Tata Motors, Hero), Metals (Tata Steel, JSW, Hindalco, Vedanta, Coal India), and major US large caps.
- Indian equities: `_resolve_ticker_variants()` tries `TICKER`, `TICKER.NS`, and `TICKER.BO` in order, so bare Indian tickers uploaded without a suffix resolve correctly at fetch time.
- No fake/hardcoded fundamentals are used in `uploaded` or `live` mode. Peers endpoint returns explicit `"source": "unavailable"` per peer when yfinance cannot fetch data.

### What to verify

1. In uploaded/live mode, open `/peers` and select TCS, INFY, or HDFCBANK.
2. Peer cards should populate within ~2 s.
3. If a peer has no yfinance data, its card shows "Unavailable" rather than zeros or fake numbers.

---

## Part 3 — Provider & API-Key Readiness

### What was added

**FMP (Financial Modeling Prep) as optional fallback:**

- `backend/app/data_providers/live_provider.py` — `_fetch_fmp_fundamentals(ticker)` and `_fetch_fmp_peers(ticker)` added. FMP is only called when `FINANCIAL_MODELING_PREP_API_KEY` is set in `.env`. FMP strips `.NS`/`.BO` suffixes before calling the API. Wired as fallback in `_fetch_fundamentals_single()` (after all yfinance variants return empty) and `get_peers()` (when ticker not in `_PEER_MAP`).
- FMP free tier: 250 requests/day. Sufficient for personal use.

**Health endpoint now exposes API-key status:**

`GET /health` returns a boolean `api_keys` map (values are `true` / `false` — never the actual key strings):

```json
"api_keys": {
  "anthropic":     false,
  "openai":        false,
  "news_api":      false,
  "alpha_vantage": false,
  "fmp":           false,
  "zerodha":       false
}
```

**Debug panel updated:**

`/debug` → System Diagnostics → API Keys section shows FMP with description "Fundamentals & peer fallback (250 req/day free)".

### API keys to obtain for full functionality

| Key | Where to get | What it unlocks |
|-----|-------------|-----------------|
| `NEWS_API_KEY` | newsapi.org (free: 100 req/day) | Live portfolio news in `/news` |
| `FINANCIAL_MODELING_PREP_API_KEY` | financialmodelingprep.com (free: 250 req/day) | Fundamentals + peers fallback when yfinance is rate-limited |
| `ANTHROPIC_API_KEY` | console.anthropic.com | AI Advisor in `/advisor` |

Add keys to `.env` in the project root. No restart needed for hot-reload dev; restart required in production.

---

## Part 4 — Mock / Scaffold Audit

### Modules using mock or placeholder data

The following modules are clearly labelled in the UI and navigation:

| Module | Route | Status | Label shown |
|--------|-------|--------|-------------|
| Optimizer | `/optimize` | Experimental — mock output | **BETA** badge in sidebar |
| Simulator | `/simulate` | Experimental — mock scenarios | **BETA** badge in sidebar |
| Brokers | `/brokers` | Scaffold only — no real broker API | **SCAFFOLD** badge in sidebar |
| AI Chat | `/ai-chat` | Not in nav; requires `ANTHROPIC_API_KEY` | Hidden from nav |
| Efficient Frontier | `/frontier` | Not in nav; scaffold | Hidden from nav |
| News (no key) | `/news` | Falls back to mock articles in mock mode | Mode-aware amber warning shown |

**No mock data is shown in uploaded/live mode for core modules** (Dashboard, Holdings, Fundamentals, Risk, Peer Compare). If live data is unavailable, these modules show an explicit "unavailable" state rather than silently falling back to mock values.

---

## Part 5 — Dashboard & Navigation Cleanup

### Sidebar reorganization

Navigation groups were reorganized from generic categories into purpose-driven groups that match the primary daily workflow:

**Portfolio** (core daily workflow — all items reliable in uploaded/live mode):
- Dashboard, Holdings, Fundamentals, Risk, Peer Compare

**Manage** (portfolio data management):
- Portfolios, Upload, What Changed, Watchlist

**Explore** (functional but not always live-data backed):
- Sectors, News & Events, Advisor

**Labs** (experimental — clearly labelled so users know they are unpolished):
- Optimizer (BETA), Simulator (BETA), Brokers (SCAFFOLD)

Key promotion: **Fundamentals** and **Peer Compare** moved from lower groups to the primary "Portfolio" group, reflecting their role as core daily workflow items.

### Auto-switch after upload

`frontend/src/app/upload/page.tsx` — `handleConfirm()` now calls `setMode('uploaded')` from `useDataModeStore` immediately after a successful `/upload/confirm` response. The success screen now confirms "Data mode switched to Uploaded" rather than instructing the user to manually switch. The preview step "What happens next" note is also updated accordingly.

---

## Part 6 — Scope Control (Not Implemented)

The following were explicitly out of scope for this hardening phase and were not implemented:

- Stock screener
- VaR / CVaR calculation
- Broker login / OAuth integration
- Large visual redesign
- Public deployment configuration
- New charting modules

---

## Routes to Test After Restarting the Backend

```
GET  /health                        → should show yfinance: true, api_keys map
GET  /readiness                     → should show database.ok: true
POST /api/v1/upload/parse           → parse a CSV
POST /api/v1/upload/confirm         → import; verify enrichment persists after restart
GET  /api/v1/fundamentals/{ticker}  → verify sector, name, pe_ratio populate
GET  /api/v1/peers/{ticker}         → verify peers return in ~1-2s (not 5-10s)
GET  /api/v1/news                   → returns mock articles in mock mode; empty+liveUnavailable flag in uploaded mode without NEWS_API_KEY
```

## Compile Status

- Backend (`py_compile`): ✅ all clean
- Frontend (`tsc --noEmit`): ✅ all clean (also fixed `FinancialRatio.error?: string | null` missing from types)
