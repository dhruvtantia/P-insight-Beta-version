# P-Insight — Product Requirements (MVP / Private Beta)

**Status:** Draft for founder alignment, April 2026.
**Scope:** What P-Insight must be — and explicitly must not be — before inviting private beta users.

> **Blunt read:** this document exists because the codebase today has roughly **22 pages across three tiers**, several of which are scaffolds, duplicates, or dev-only. If we launch beta today, users will land on broken or half-built surfaces. This PRD ruthlessly cuts to the product we actually ship.

---

## 1. Target user (1 clear sentence)

**A retail investor in Indian equities with ₹10L–₹5Cr invested across 10–50 individual stocks, who maintains their own records (CSV from broker or manual tracking), and who wants institutional-quality analytics + a conversational assistant without paying for a professional platform.**

Not the target:
- Professional PMS / RIA teams (needs multi-client, auth, SEBI compliance).
- Mutual-fund-only investors (no fund analytics — P-Insight is equity-first).
- US/EU-primary investors (the sector map, peer map, and benchmark are NSE-focused).
- Active traders (intraday analytics, options, F&O — all out of scope).

If a prospective beta user doesn't match the target, politely decline. The product will frustrate them and the feedback will be noise.

---

## 2. Product goal (1 clear sentence)

**"Upload your portfolio once. Get dashboard, fundamentals, risk, and AI-powered guidance in under 30 seconds. Come back weekly."**

Success measures (first 90 days of beta):
- 80% of invited users complete upload within 5 minutes of receiving the link.
- 60% return at least once within 7 days.
- 40% ask ≥3 advisor queries.
- 30% take a snapshot within the first 2 weeks (signal of intent to track over time).
- <5% report a "blank page" / "it didn't work" experience.

---

## 3. Core user flow (happy path)

```
1. User receives beta invite link.
2. Lands on /market (ambient landing; no portfolio required).
3. Clicks "Upload your portfolio".
4. Uploads CSV from broker.
5. Sees column-mapping preview. Confirms.
6. Lands on /dashboard within 2s (fundamentals still enriching in background).
7. Sees: 4 KPI tiles, sector donut, top holdings, risk card, Action Center.
8. Navigates: /holdings → /fundamentals → /risk → /advisor.
9. Asks advisor: "How diversified am I?"
10. Gets structured answer with actions.
11. Optionally: /watchlist add, /peers comparison on a holding, /simulate a what-if.
```

Everything off that path is either secondary, hidden, or cut from MVP.

---

## 4. Core pages (MUST work at beta launch)

These are the pages a user will actually hit in the first 5 minutes. Failure on any of these blocks beta.

| Page | Route | Owner module | Must-have quality bar |
|---|---|---|---|
| Market landing | `/market` | Market Data | Three index chips render (live or last_close) within 2s. Gainers/losers or graceful empty. |
| Upload | `/upload` | Upload / Ingestion | Two-step flow works. Parse returns preview in <3s. Confirm persists in <2s. Status polling shows enrichment progress. Handles malformed CSV gracefully. |
| Dashboard | `/dashboard` | Portfolio Aggregation + Risk (front-end) | All four sections render from one `/portfolio/full` call. Empty state when no portfolio. No `/quant/full` dependency. |
| Holdings | `/holdings` | Portfolio Aggregation | Full holdings table sortable. `data_source` per-row flag visible. |
| Fundamentals | `/fundamentals` | Fundamentals | Per-holding ratios + weighted panel. Source labels visible. Must not block >10s on slow ticker. |
| Risk & Quant | `/risk` | Risk / Quant | Concentration + quant both render. Cold cache <20s first load, <1s cached. Benchmark-unavailable state handled. |
| Advisor | `/advisor` | Advisor | Chat works end-to-end. AI path if key configured, else rule-based. Provider badge visible. At least 5 suggested questions. |
| Changes / Snapshots | `/changes` | History / Changes | Zero-snapshot empty state. ≥2 snapshots → delta view. |
| Portfolio Manager | `/portfolios` | PortfolioManager | Can list, set active, delete portfolios. |
| Watchlist | `/watchlist` | Watchlist | CRUD works. Optional live prices. |
| News | `/news` | News | Graceful `news_unavailable=True` if no key. With key: articles render, filters work. |
| Peers | `/peers` | Peers | Comparison panel works for NIFTY 50 tickers. Empty peer list handled for small-caps. |

---

## 5. Secondary pages (acceptable if degraded)

Allowed to be imperfect or rough at beta; not blockers if they work "well enough".

| Page | Route | Why acceptable |
|---|---|---|
| News events | `/news` → events tab | Scaffolded; honest "coming soon" is OK |

(That's the only truly "secondary-but-visible" page. Everything else is either core or hidden.)

---

## 6. Hidden / beta-only pages (NOT in nav)

These exist in the codebase but are not linked from navigation at beta launch. Keep behind direct-URL access for dogfooding only.

| Page | Route | Keep? | Why |
|---|---|---|---|
| Optimizer | `/optimize` | Hidden | Works for well-sized portfolios; flaky on <5 holdings or degenerate covariance. Not beta-safe. |
| Simulator | `/simulate` | Hidden | Mounts expensive `useOptimization` on load; needs UX work before exposure. |
| Efficient Frontier | `/frontier` | Hidden | Scaffold. Redirects to optimization endpoint. |
| Screener | `/screener` | Hidden | Status unknown; audit before exposing. |
| Brokers | `/brokers` | Hidden | Scaffold; Zerodha not implemented. |
| AI Chat | `/ai-chat` | **Delete** | Superseded by `/advisor`. Candidate for removal. |
| Sectors | `/sectors` | **Delete** | Redundant with dashboard. Nav link already removed. |
| Debug | `/debug` | Dev only | Already gated behind `NODE_ENV === 'development'`. Keep as-is. |

**Action before beta:** delete `/ai-chat` and `/sectors` directories + corresponding backend routes if still present. Remove nav links for all "hidden" routes. Keep the pages behind direct URL so internal testing can continue.

---

## 7. Must work before beta launch (gating checklist)

### 7.1 Functional
- [ ] Upload flow end-to-end for a real broker CSV (Zerodha console, ICICI Direct, HDFC Securities, Kite exports) — one must be specifically tested.
- [ ] Dashboard renders in <3s for a 20-holding portfolio (cold start, empty cache).
- [ ] Risk page renders in <20s cold, <1s cached.
- [ ] Advisor AI path works with at least one configured LLM key.
- [ ] Advisor fallback (rule-based) works with no key configured.
- [ ] Data mode toggle (`uploaded` ↔ `live`) doesn't leak stale data.
- [ ] Restart of the backend does NOT lose the uploaded portfolio (`_restore_uploaded_portfolio` works).

### 7.2 Reliability
- [ ] Per-ticker timeout on `/analytics/ratios` (status doc §7.1 — currently missing).
- [ ] Per-ticker timeout on `/peers/{ticker}` (status doc §7.2).
- [ ] Daily snapshot scheduler (so history page is not empty on day 30).
- [ ] Error reporting wired (Sentry or equivalent) on both backend exceptions and frontend errors.
- [ ] Health + readiness endpoints hooked to hosting platform's monitoring.
- [ ] Logs retained for ≥14 days.

### 7.3 Data integrity
- [ ] Enrichment resume on restart — persist job state and resume on boot (currently orphans `pending` holdings).
- [ ] File upload size limit enforced (10 MB hard cap).
- [ ] SQLite daily backup (single-line `cp` to cloud storage is acceptable at this scale).

### 7.4 UX polish
- [ ] Empty states for every page where no portfolio / no snapshot / no watchlist item exists.
- [ ] Loading states that don't look broken (no 20s blank screens).
- [ ] Error states that tell user what to do (retry button, "check your API keys", etc.).
- [ ] No dev-only pages reachable via nav.
- [ ] Consistent status-dot language across market chips, data-mode badge, enrichment status.

### 7.5 Legal / safety (non-negotiable)
- [ ] Disclaimer footer on advisor responses: "Informational only. Not investment advice. Consult a SEBI-registered advisor."
- [ ] Privacy policy page stating: data stored locally in SQLite (for self-host) OR retained only for service delivery (for hosted beta).
- [ ] Terms of use for beta users.
- [ ] No PII in logs.

---

## 8. Explicitly postponed (NOT MVP)

These are valid ideas. They are **not** in the private-beta product. Resist scope creep.

| Feature | Why deferred |
|---|---|
| Multi-user auth | Out of scope for private beta; single-user is the model. |
| Broker sync (Zerodha / IBKR) | Requires broker API integration + token lifecycle management — months of work. Current scaffold stays hidden. |
| Mutual funds | Different data pipeline, different analytics. Equity-only at MVP. |
| US / EU equity support | Sector map, peer map, benchmark are all NSE-focused. Expanding is a v2 project. |
| Options / F&O | No instrument model supports derivatives. |
| Tax reporting / capital gains tracking | Requires transaction history (not snapshot-based). Big feature. |
| Custom benchmarks | NIFTY 50 only at MVP. |
| Alerts / notifications | No notification delivery layer yet. Watchlist target-price alerts are the obvious v2 feature. |
| Scenario saving / named simulations | Current sim state is session-scoped. Persisting named scenarios is v2. |
| Real-time price streaming (WebSockets) | Polling at 60–120s is fine for retail use. |
| Portfolio sharing / export | PDF export of report is a v2 feature. |
| Mobile app | Web-first. Mobile is v2 if web proves out. |
| Automated rebalance orders | Requires broker integration. |
| Backtesting | Requires transaction history. Out of scope. |
| Performance attribution (Brinson etc.) | Requires sector benchmarks and historical holdings. v2. |
| Risk decomposition (factor exposures) | Requires factor model data. v2. |

---

## 9. Data mode strategy at beta launch

Three modes exist in code: `uploaded`, `live`, `broker`.

**At beta:**
- `uploaded` — default. Most users will use this.
- `live` — available for users who want live prices from yfinance against their uploaded position (same holdings, fresh prices). Works.
- `broker` — **disabled at beta** (feature flag off). Scaffold only.

Frontend should hide the `broker` toggle if `BROKER_SYNC_ENABLED=false` in settings.

---

## 10. Disclaimers and limits the user must see

Non-negotiable copy that must be visible somewhere obvious:

1. **On advisor page (footer of every response):** "This is informational guidance based on your uploaded portfolio. It is not investment advice. P-Insight does not have knowledge of your full financial situation, tax status, or goals. Consult a SEBI-registered advisor before making investment decisions."
2. **On fundamentals page (under weighted panel):** "Weighted averages exclude holdings with missing data; see per-row coverage."
3. **On risk page (under quant panel):** "Metrics computed over the selected period using close-price data. Past performance does not predict future performance."
4. **On market page (footer):** "Market data from yfinance. May be delayed 15+ minutes. Not for trading decisions."
5. **On upload page:** "P-Insight stores your data locally. We do not share it or sell it."

---

## 11. Operating constraints (for infra planning)

- Beta target: 20–50 invited users, each with their own self-hosted instance or their own tenant on a shared hosted instance.
- Expected load on hosted beta: <100 concurrent users, <1000 daily active. Single-worker deploy is fine.
- Storage: <100 MB per user (SQLite, uploads, snapshots combined).
- yfinance rate-limiting is the primary external risk. If hosted on a shared IP, consider caching aggressively and/or routing through a paid market-data vendor at scale.

---

## 12. What "done" looks like for the beta scope

A new invited user can, **without guidance**:

1. Open the link.
2. Upload a CSV from any of the 3 major Indian brokers.
3. Land on a working dashboard within 5 seconds.
4. Navigate through Holdings, Fundamentals, Risk, Advisor, Watchlist without hitting a broken page.
5. Ask at least one advisor query and get a structured, non-empty answer.
6. Return in 7 days and see a snapshot or history indicator that tells them something has changed.

**If any of those fail for a sample of 10 test users, we are not ready.**

---

## 13. Kill criteria (when to pause beta)

We stop inviting new users and fix before expanding if **any** of:

- >15% of invited users fail to complete upload.
- >10% report "blank page" or "it didn't work" in first session.
- Backend error rate >1% over 24h.
- Average `/portfolio/full` p95 latency >3s.
- Advisor produces evidently wrong answers (e.g. miscomputes weights) in >5% of queries — this is a reputational risk.

---

## 14. Things we won't learn from beta (accept now)

- Will it scale to 10,000 users? No — single-worker SQLite architecture caps well below that.
- Will the advisor be worth a paid subscription? Beta is too small to answer.
- Does the product work for US equity investors? Won't test; won't know.
- Does the broker-sync flow work? It's hidden; won't test.

That's fine. Beta is for learning whether **the core retail-Indian-equity user comes back weekly**. Nothing more.
