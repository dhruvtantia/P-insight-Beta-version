# P-Insight — Data Dependency Map

**Version:** Post trust-hardening + entry redesign phase  
**Scope:** What each visible page fetches, from where, and what happens on failure

---

## Legend

- **Hook** = React hook that manages fetch state
- **Endpoint** = backend REST route
- **Provider** = data source used by backend (`UploadedDataProvider` for CSV, `LiveDataProvider` for yfinance)
- **On failure** = what the UI does if the fetch errors or times out

---

## `/market` — Market Overview (Landing Page)

| Item | Detail |
|---|---|
| Hooks | None (uses local `fetchWithTimeout` directly) |
| Endpoints | `GET /api/v1/market/overview`, `GET /api/v1/news/` |
| Provider | `yfinance` (always — no uploaded data needed) |
| Cache | 2 min (market overview), none (news) |
| On failure | Each section shows a WifiOff card. Page does not crash. News section is hidden entirely when `news_unavailable: true`. |
| Notes | Auto-refreshes every 120 seconds. Fires independently of portfolio state. 15-second AbortController timeout on all requests. |

---

## `/dashboard` — Portfolio Dashboard

| Item | Detail |
|---|---|
| Hooks | `usePortfolio`, `useDataMode`, `useFilterStore` |
| Endpoints (parallel) | `GET /portfolio/holdings`, `GET /portfolio/summary`, `GET /portfolio/sectors` |
| Endpoint (non-blocking) | `GET /analytics/commentary` |
| Provider | `UploadedDataProvider` (mode=uploaded) or `LiveDataProvider` (mode=live) |
| On failure (core 3) | Error banner rendered, page content hidden. Retry button available. |
| On failure (commentary) | `console.warn`, insights panel renders empty. Page unaffected. |
| Risk tiles | Derived from `riskSnapshot` — computed client-side from holdings[]. Zero extra API calls. |
| Notes | No quant/optimization calls on this page. Risk tiles use HHI, top3 weight, max position — all local. |

---

## `/holdings` — Holdings Table

| Item | Detail |
|---|---|
| Hooks | `usePortfolio` |
| Endpoints | Same as dashboard (holdings + summary + sectors in parallel) |
| Provider | Same as active data mode |
| On failure | Full-page error message. |
| Notes | Lightweight. Shows PageLoader until data arrives. |

---

## `/fundamentals` — Valuation & Ratios

| Item | Detail |
|---|---|
| Hooks | `usePortfolio`, `useFundamentals(holdings)` |
| Endpoints | `GET /portfolio/holdings+summary+sectors` (from usePortfolio), `GET /analytics/ratios?mode=...` |
| Provider | `UploadedDataProvider` for both |
| On failure (portfolio) | Error banner blocks the full page. |
| On failure (ratios) | Error message shown in fundamentals table area. Page header still renders. |
| Notes | `useFundamentals` fires only after `usePortfolio` has holdings (it receives them as a prop). Sequential dependency but both are fast. |

---

## `/risk` — Risk & Quant Analytics

| Item | Detail |
|---|---|
| Hooks | `usePortfolio`, `useQuantAnalytics`, `useDataMode` |
| Endpoints | `GET /portfolio/*` (3 in parallel), `GET /quant/full?period=1y` |
| Provider | `UploadedDataProvider` or `LiveDataProvider` |
| On failure (portfolio) | Error banner, page blocked. |
| On failure (quant/full) | Error state in quant section. `RiskSnapshotCard` (client-computed) still renders from `riskSnapshot`. Charts are empty. |
| Cost | HIGH. `/quant/full` downloads 1 year of daily OHLCV data for every holding from yfinance and runs correlation, drawdown, and beta computations. Cached 10 minutes (live) or 24 hours (mock). |
| Notes | This is the page where `useQuantAnalytics` is intentionally used. Nowhere else. |

---

## `/changes` — What Changed (Snapshot History)

| Item | Detail |
|---|---|
| Hooks | `usePortfolios`, `useSnapshots(portfolioId)`, `useSnapshotHistory(portfolioId)` |
| Endpoints | `GET /portfolios/` (list), `GET /portfolios/{id}/snapshots` (list), `GET /snapshots/{id}` per snapshot (detail, lazy) |
| Provider | SQLite DB only (no yfinance, no external API) |
| On failure | Error state per section. Snapshot list and history charts degrade independently. |
| Notes | `useSnapshotHistory` lazily hydrates up to 12 snapshot details in parallel. No external data — all snapshots are locally stored. Very safe to fail. |

---

## `/peers` — Peer Comparison

| Item | Detail |
|---|---|
| Hooks | `usePortfolio`, `usePeerComparison(ticker)` |
| Endpoints | `GET /portfolio/*` (3 calls), `GET /peers/{ticker}?mode=...` |
| Provider | `UploadedDataProvider` (portfolio), `yfinance` (peer fundamentals) |
| On failure (portfolio) | Peer selector has no options. |
| On failure (peer fetch) | Error state in peer section. Selector and holdings list still work. |
| Cost | MEDIUM. Peer fundamentals are fetched via `asyncio.gather` (parallel yfinance calls for 5-6 peers). Each ticker takes ~1s with yfinance; parallel = ~1-2s total. |
| Notes | Auto-selects first holding if no URL param. Page is Tier 2 — useful but not critical. |

---

## `/news` — News & Events

| Item | Detail |
|---|---|
| Hooks | `usePortfolio`, `useNews(filters)` |
| Endpoints | `GET /portfolio/*` (for ticker options only), `GET /news/?mode=...&tickers=...` |
| Provider | External news API or mock |
| On failure (news) | `liveUnavailable: true` state shown with explanation. |
| Notes | Ticker filter is client-side (no re-fetch on chip change). Event type filter is server-side. |

---

## `/advisor` — AI Portfolio Advisor

| Item | Detail |
|---|---|
| Hooks | `useAdvisor` (composite) |
| Sub-hooks | `usePortfolio`, `useFundamentals`, `useWatchlist`, `usePortfolios`, `useSnapshots` |
| Additional endpoints | `GET /advisor/status`, (on send) `POST /advisor/ask` |
| **Removed (Stage 2)** | `useOptimization` — was triggering `/optimization/full` on every page load |
| Provider | All of the above |
| On failure (AI) | Falls back to rule-based advisor automatically. No error shown to user. |
| On failure (portfolio) | Advisor shows "portfolio loading" state. Still accepts questions. |
| Cost | MEDIUM after Stage 2. Previously HIGH due to `useOptimization`. |
| Notes | The AI path sends user query + conversation history to `/advisor/ask`. The rule-based path runs entirely client-side from engineInput. |

---

## `/watchlist` — Watchlist

| Item | Detail |
|---|---|
| Hooks | `useWatchlist` |
| Endpoints | `GET /watchlist/`, mutations via `POST /watchlist/`, `DELETE /watchlist/{id}` |
| Provider | SQLite DB (local storage) |
| On failure | Error banner. Form still renders. |
| Notes | `useLiveData` and `useWatchlistPrices` exist but are optional enrichment — only fire in live mode. |

---

## `/portfolios` — Portfolio Management

| Item | Detail |
|---|---|
| Hooks | `usePortfolios` |
| Endpoints | `GET /portfolios/`, `POST /portfolios/`, `DELETE /portfolios/{id}` |
| Provider | SQLite DB |
| On failure | Error state. |
| Notes | Lightweight management page. |

---

## `/upload` — Upload Flow

| Item | Detail |
|---|---|
| Hooks | None (stateful form) |
| Endpoints | `POST /upload/preview` (Step 1), `POST /upload/confirm` (Step 2) |
| Provider | File upload → `UploadedDataProvider` |
| On failure (preview) | Inline error, no progression |
| On failure (confirm) | Error banner with retry |
| Notes | Enrichment uses 5s per-ticker yfinance timeout. Failures are non-fatal per ticker. |

---

## `/optimize` — Portfolio Optimizer (Tier 3 — hidden from nav)

| Item | Detail |
|---|---|
| Hooks | `useOptimization`, `useDataMode` |
| Endpoints | `GET /optimization/full?period=1y&er_method=...&cov_method=...` |
| Cost | HIGH. Downloads price history + runs PyPortfolioOpt mean-variance solver. |
| Notes | Hidden from sidebar. Accessible via direct URL. |

---

## `/simulate` — Simulation Sandbox (Tier 3 — hidden from nav)

| Item | Detail |
|---|---|
| Hooks | `useSimulation`, `useOptimization` |
| Endpoints | `GET /optimization/full` |
| Cost | HIGH (same as /optimize). |
| Notes | Hidden from sidebar. Mounts `useOptimization` on load — fires expensive endpoint immediately. |

---

## Global Hooks (fire on every page via AppShell)

| Hook | Endpoint | Purpose |
|---|---|---|
| None — AppShell is clean | — | AppShell does not mount any data hooks |

**Note:** The `PortfolioSwitcher` in the Topbar does call `usePortfolios` to list available portfolios. This is a lightweight DB call (`GET /portfolios/`) and fires on every page. It is safe and fast.

