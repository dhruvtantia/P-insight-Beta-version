# P-Insight — Core Workflow Doc

**Version:** Post trust-hardening + entry redesign phase  
**Scope:** Personal-use, single user, uploaded CSV portfolio

---

## Entry Point

```
Browser opens app
    → GET /
    → Server redirect (no JS, no loading flash)
    → /market
```

The root route `/` is a Next.js server component that immediately calls `redirect('/market')`. There is no client-side logic on the root route. The user never sees a loading state before reaching the market page.

---

## Stage 1 — Market Landing

**Route:** `/market`  
**Who sees it:** Everyone, including users with no portfolio uploaded.

The market page loads independently of any portfolio state. It makes two calls directly (not through `apiFetch`) using a local `fetchWithTimeout` helper with a 15-second timeout:

1. `GET /api/v1/market/overview` — Nifty 50, Sensex, Bank Nifty prices + sector performance + top gainers/losers. Cached on the backend for 2 minutes. Backed by `asyncio.to_thread` so it cannot block other requests.
2. `GET /api/v1/news/` — Portfolio news headlines. Shown only when `news_key_configured: true` and `news_unavailable: false`.

**Auto-refresh:** Every 120 seconds.

**If data is unavailable:** Each section has an explicit WifiOff / unavailable state. The page never crashes — missing data results in a greyed-out card, not a blank screen.

**CTAs on this page:**
- "Upload Portfolio" → `/upload`
- "Go to Dashboard" → `/dashboard`

---

## Stage 2 — Upload

**Route:** `/upload`  
**When:** User arrives without a portfolio, or wants to add/update one.

The upload flow is a two-step process:

```
Step 1 — File selection
  User picks CSV or Excel file
  POST /api/v1/upload/preview
      → Backend parses file, detects columns (ticker, quantity, avg_cost, name, sector)
      → Returns holdings preview (N rows, column detection notes)
      → Frontend shows preview table

Step 2 — Confirm
  User clicks Confirm
  POST /api/v1/upload/confirm
      → Backend stores holdings + triggers async enrichment
      → Enrichment: yf.Ticker().info per holding (5s per-ticker timeout)
      → Sector classification falls back to static map on timeout
      → Returns portfolio ID + enrichment summary
      → Frontend stores active portfolio ID, redirects to /dashboard
```

**Failure modes:**
- File parse error → Step 1 shows inline error, no progression
- Enrichment timeout per ticker → that holding gets "Other" sector, upload succeeds
- Backend unreachable → Step 2 shows error banner with retry

---

## Stage 3 — Portfolio Workspace

**Route:** `/dashboard` (primary), then `/holdings`, `/fundamentals`, `/risk`, `/changes`

Once a portfolio is uploaded, the core workspace loads portfolio data from:

```
GET /api/v1/portfolio/holdings?mode=uploaded
GET /api/v1/portfolio/summary?mode=uploaded
GET /api/v1/portfolio/sectors?mode=uploaded
```

All three fire in parallel (`Promise.all`). If all three succeed, the dashboard renders.

A fourth call — `GET /api/v1/analytics/commentary` — fires separately (non-blocking, fire-and-forget). Its failure does not affect the main dashboard render.

**Downstream pages load additional data on their own:**
- `/fundamentals` → adds `GET /analytics/ratios`
- `/risk` → adds `GET /quant/full` (heaviest endpoint — downloads price history)
- `/changes` → adds snapshot list + lazily hydrates snapshot details

---

## Intended Personal-Use Workflow

```
1. Open app → /market
   → Check today's market conditions

2. Navigate to /upload (first time or portfolio update)
   → Upload CSV, confirm, wait for enrichment

3. Navigate to /dashboard
   → Quick portfolio health check (4 KPI cards + allocation + risk tiles)

4. Drill into specific concerns:
   → /holdings      — full position-level detail
   → /fundamentals  — valuation ratios per stock
   → /risk          — full quant analytics (Sharpe, Vol, drawdown, correlation)
   → /changes       — portfolio evolution over time (requires snapshots)

5. Explore (secondary, as needed):
   → /peers         — compare a holding vs industry peers
   → /news          — news and upcoming events (when news API configured)
   → /advisor       — rule-based or AI-powered portfolio questions
```

---

## What Does NOT Load by Default

The following endpoints are never called unless the user explicitly navigates to the relevant page:

| Endpoint | Triggered by | Cost |
|---|---|---|
| `/quant/full` | `/risk` page only | HIGH — downloads 1y of daily prices for all holdings |
| `/optimization/full` | `/optimize` page only | HIGH — runs mean-variance optimization |
| `/peers/{ticker}` | `/peers` page only | MEDIUM — fetches peer fundamentals via yfinance |
| `/analytics/ratios` | `/fundamentals` page | MEDIUM — fetches PE/PB ratios per holding |
| `/news/` (full) | `/news` page | LOW — static mock or external API |

