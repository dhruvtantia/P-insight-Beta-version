# Market Overview Smoke Checklist

Use this checklist after any change to the landing page / market overview workflow.
The goal is to verify feature viability, not to prove production readiness.

## Scope
- In scope: `/`, `/market`, `/api/v1/market/overview`, market headlines on `/market`, topbar index strip.
- Out of scope: upload flow, dashboard, optimizer, advisor, broker sync, authentication, broader news page.

## Preconditions
- Frontend and backend run locally.
- Use the current backend feature flags; do not modify unrelated features.
- Treat missing `NEWS_API_KEY` and missing `yfinance` as first-class degraded scenarios.

## Smoke Scenarios

### 1. Healthy backend
- Open `/`.
- Verify it redirects to `/market`.
- Verify main indices render without crashing.
- Verify sector indices render or show per-row unavailable placeholders.
- Verify top gainers and top losers render or show explicit “Mover data unavailable from market feed”.
- Verify the topbar index strip renders independently of the page body.
- Verify FX and commodities are visibly labeled beta placeholders with no fake values.

### 2. Backend unavailable
- Stop the backend and reload `/market`.
- Verify the page shell still renders.
- Verify the topbar shows compact market-unavailable state.
- Verify the market page does not crash; loading should resolve into unavailable states or preserved stale data.

### 3. `yfinance` unavailable
- Run backend in a state where importing `yfinance` fails.
- Verify `/api/v1/market/overview` still returns:
  - `available`
  - `market_status`
  - `main_indices`
  - `sector_indices`
  - `top_gainers`
  - `top_losers`
  - `fetched_at`
  - `source`
- Verify `market_status` still includes `open`, `note`, `checked_at_ist`, and `reason`.
- Verify `/market` renders degraded index cards instead of crashing.

### 4. Missing `NEWS_API_KEY`
- Start backend without `NEWS_API_KEY`.
- Load `/market`.
- Verify the headlines panel stays visible.
- Verify it shows an explicit unavailable message rather than disappearing.
- Verify indices and movers still function normally.

### 5. Empty headlines response
- Force the live news path to return `articles=[]` with `news_key_configured=true`.
- Verify the headlines panel shows the explicit empty state.
- Verify the page does not switch that case to “unavailable”.

### 6. Partial index failure
- Force one main index and one sector index to return `unavailable`.
- Verify other indices still render.
- Verify unavailable cards/rows show per-block degradation rather than blanking the whole section.
- Verify the market page continues rendering movers and headlines.

### 7. Duplicate fetch stability
- Load `/market` fresh with devtools network tab open.
- Verify the topbar and market page do not thrash the overview endpoint on initial render.
- Verify visible timestamps do not obviously conflict after initial load.

## Hypercritical Scoring Rubric
- Data authenticity and source clarity: 25
- Failure isolation and degradation honesty: 20
- Frontend state handling: 15
- Contract consistency: 15
- Operational stability / polling / duplication: 10
- Testability and validation evidence: 10
- Scope discipline / no collateral regressions: 5

## Post-Change Assessment Template
- Starting score: 68/100
- Expected score after this hardening pass: 75-79/100
- Do not score above 79 unless:
  - automated contract/behavior coverage exists
  - provider failure scenarios are tested beyond manual observation
  - movers degradation is more granular than empty-list fallback
  - placeholders are removed or backed by real data
  - operational confidence extends beyond local smoke testing

## Evidence to Capture
- `pnpm run type-check`
- Targeted backend pytest for market overview contracts
- Manual notes for each smoke scenario above
- Final score with 2-4 sentence justification for why the feature still falls short of production readiness
