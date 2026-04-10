# P-Insight — Stability Matrix

**Version:** Post trust-hardening + personal-use simplification  
**Tiers:**
- **Tier 1** — Core, must work. No graceful degradation acceptable.
- **Tier 2** — Helpful but not critical. Can degrade. User can function without it.
- **Tier 3** — Hidden / disabled for now. Code intact, route accessible by URL, not in nav.

---

## Tier 1 — Core and Must Work

| Module | Route | Status | Keep Visible? | Can Fail Safely? | Next Fix / Owner |
|---|---|---|---|---|---|
| Market Landing | `/market` | ✅ Stable | Yes — primary entry | Yes (WifiOff states per section) | Monitor yfinance rate limits |
| Upload | `/upload` | ✅ Stable | Yes | Partially (per-ticker enrichment fails gracefully; full backend failure blocks) | Add progress indicator for enrichment |
| Portfolio Dashboard | `/dashboard` | ✅ Stable | Yes | No (core 3 calls must succeed) | Commentary endpoint occasionally slow — monitor |
| Holdings Table | `/holdings` | ✅ Stable | Yes | No | None |
| Fundamentals | `/fundamentals` | ✅ Stable | Yes | Partially (ratios can fail; portfolio must succeed) | ratios endpoint pulls yfinance — add timeout guard |
| Risk & Quant | `/risk` | ✅ Stable | Yes | Yes (risk snapshot renders from local data even if /quant/full fails) | `/quant/full` is the most expensive endpoint — cache aggressively |
| What Changed | `/changes` | ✅ Stable | Yes (in Manage group) | Yes (no external calls, all SQLite) | Add empty state guidance when no snapshots exist |

---

## Tier 2 — Helpful But Not Critical

| Module | Route | Status | Keep Visible? | Can Fail Safely? | Next Fix / Owner |
|---|---|---|---|---|---|
| Peer Comparison | `/peers` | ⚠️ Partial | Yes (Explore group) | Yes (error state per section) | yfinance peer fetches can be slow; add per-peer timeout |
| News & Events | `/news` | ⚠️ Partial | Yes (Explore group) | Yes (`liveUnavailable` state) | News API key not configured = always unavailable; document setup |
| Advisor | `/advisor` | ✅ Mostly stable | Yes (Explore group) | Yes (falls back to rule-based) | Remove optimization dependency (Stage 2 fix); AI path needs API key |
| Watchlist | `/watchlist` | ✅ Stable | Yes (Manage group) | Yes | Live price enrichment only fires in live mode |
| Portfolios | `/portfolios` | ✅ Stable | Yes (Manage group) | Yes | None |
| Sectors | `/sectors` | ✅ Stable | Yes (Explore group) | Yes | Redundant with dashboard's allocation section — candidate for removal |

---

## Tier 3 — Hidden / Disabled for Now

| Module | Route | Status | Keep Visible? | Can Fail Safely? | Next Fix / Owner |
|---|---|---|---|---|---|
| Optimizer | `/optimize` | ⚠️ Experimental | **No** (removed from nav) | Partially (shows error if yfinance fails) | PyPortfolioOpt may fail with <5 holdings or low variance; add validation |
| Simulator | `/simulate` | ⚠️ Experimental | **No** (removed from nav) | Partially | Mounts `useOptimization` on load — fires expensive endpoint immediately |
| Broker Sync | `/brokers` | 🚧 Scaffold | **No** (removed from nav) | N/A | Not implemented; broker API integration pending |
| Efficient Frontier | `/frontier` | 🚧 Scaffold | **No** (removed from nav) | N/A | Chart-only page; data from optimization endpoint |
| AI Chat | `/ai-chat` | 🚧 Scaffold | **No** (not in nav) | N/A | Separate from /advisor; not productionised |
| Debug | `/debug` | 🔧 Dev only | Dev only | Yes | Keep for development; never show to end users |

---

## Risk Flags Summary

**High severity:**
- `/quant/full` — can take 5–20 seconds in live mode depending on number of holdings and yfinance latency. Mitigated by server-side caching (10 min) and `asyncio.to_thread`. First load after cache expiry is slow.
- `/optimization/full` — same latency profile. Previously fired on `/advisor` page load too (now removed). Still fires on `/simulate` page load (Tier 3, hidden from nav).

**Medium severity:**
- `analytics/ratios` endpoint — calls yfinance per ticker inside `useFundamentals`. Should add per-ticker timeout consistent with `sector_enrichment.py`.
- Peer comparison — parallel yfinance calls for 5-6 peers per selected ticker. Can fail silently per peer. No overall timeout guard at the page level.

**Low severity:**
- Market overview `/market/overview` — 2-minute cache and `asyncio.to_thread` make this safe. Rate limiting from yfinance is the main concern on high-frequency refreshes.
- Commentary endpoint `/analytics/commentary` — fires non-blocking; failure is swallowed. No user-visible impact.

---

## Dependency Health at a Glance

| Dependency | Used By | Health |
|---|---|---|
| SQLite (local DB) | portfolios, snapshots, watchlist, upload | ✅ Stable — no external dependency |
| yfinance | market, live indices, quant, optimization, peers, fundamentals enrichment | ⚠️ External — rate-limited, slow, no native timeout |
| News API (external) | `/news`, `/market` news section | ⚠️ Optional — must be configured |
| LLM API (Claude/OpenAI) | `/advisor` AI path | ⚠️ Optional — must be configured; falls back to rule-based |
| PyPortfolioOpt | `/optimize`, `/simulate` | ⚠️ Experimental — fails on edge-case portfolios |

