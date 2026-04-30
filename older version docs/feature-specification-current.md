# P-Insight Feature Specification

## Feature Tiers

### Tier 1: Core Product Loop

- Upload / ingestion
- Dashboard
- Holdings
- Fundamentals
- Risk / quant analytics
- Changes / snapshots / history
- Market overview
- Portfolio management

### Tier 2: Supporting Intelligence

- Peers
- News and events
- Watchlist
- Advisor

### Tier 3: Experimental, Hidden, Or Scaffolded

- Brokers
- Optimize
- Simulate
- Screener
- Sectors
- Frontier
- AI chat
- Debug diagnostics

## Upload / Ingestion

Purpose: convert a user portfolio file into normalized holdings and create an active portfolio.

User workflow:

1. User opens `/upload`.
2. User drops or selects CSV/XLSX.
3. App parses the file and suggests column mappings.
4. User reviews preview, rejected rows, warnings, and mapping.
5. User confirms import.
6. New active portfolio is created.
7. Dashboard becomes available immediately.
8. Background enrichment continues after import.

Inputs:

- CSV/XLSX file.
- Confirmed column mapping.
- Optional columns: name, current price, sector, industry, purchase date, notes.

Outputs:

- accepted holdings;
- rejected rows with reasons;
- warning rows for suspicious but accepted data;
- portfolio id;
- enrichment status endpoint for polling.

Important behaviors:

- Missing ticker, invalid quantity, or invalid average cost rejects a row.
- ISIN-like ticker, unusually high quantity, or unusually high unit price creates warnings.
- Accepted holdings are saved before enrichment completes.
- Upload auto-captures a snapshot.

## Dashboard

Purpose: give a fast portfolio overview and actionable starting point.

Primary data:

- `usePortfolio()` from `PortfolioProvider`.
- `/api/v1/portfolio/full`.
- non-blocking `/api/v1/analytics/commentary`.

Displays:

- total value, cost, P&L, P&L percent;
- number of holdings;
- top sector;
- sector breakdown;
- top holdings;
- risk snapshot;
- insights/commentary;
- what-changed strip from snapshots.

Expected states:

- loading;
- empty/no portfolio;
- degraded or incomplete data;
- stale preserved data after failed refresh.

## Holdings

Purpose: inspect portfolio positions with derived values.

Displays:

- ticker/name;
- quantity;
- average cost;
- current price;
- market value;
- P&L;
- weight;
- sector;
- data source and enrichment status where surfaced.

Source:

- `/api/v1/portfolio/full` through shared context.

## Fundamentals

Purpose: analyze valuation, quality, growth, margins, leverage, and dividend profile of holdings and portfolio-level weighted metrics.

Inputs:

- current holdings from `usePortfolio()`;
- `/api/v1/analytics/ratios`.

Outputs:

- per-holding fundamentals;
- weighted portfolio fundamentals;
- thresholds for UI labeling;
- coverage metadata;
- unavailable ticker reasons.

Metrics:

- trailing and forward P/E;
- P/B;
- EV/EBITDA;
- PEG;
- dividend yield;
- ROE/ROA;
- operating and profit margin;
- revenue and earnings growth;
- debt-to-equity;
- market cap.

Expected states:

- full coverage;
- partial coverage with unavailable tickers;
- provider unavailable;
- request timeout/error.

## Risk / Quant Analytics

Purpose: combine concentration risk and historical market risk.

Inputs:

- portfolio bundle risk snapshot;
- `/api/v1/quant/full`;
- `/api/v1/quant/status`.

Concentration outputs:

- max holding weight;
- top 3/top 5 weights;
- max sector weight;
- HHI;
- effective number of holdings;
- diversification score;
- risk profile and reason;
- concentration flags.

Market-risk outputs:

- annualized volatility;
- annualized return;
- Sharpe;
- Sortino;
- max drawdown;
- downside deviation;
- VaR 95;
- beta;
- tracking error;
- information ratio;
- alpha;
- cumulative performance;
- drawdown series;
- benchmark metrics;
- correlation matrix;
- per-holding contribution stats.

Periods:

- `1y`
- `6mo`
- `3mo`

Known constraints:

- Requires usable price history for at least two holdings for full portfolio analytics.
- Benchmark can be unavailable; relative metrics become null rather than synthetic.
- Results are cached in process.

## Changes / Snapshots / History

Purpose: show how the portfolio has evolved.

Sub-features:

- manual and automatic snapshots;
- snapshot timeline;
- snapshot detail;
- snapshot delta between two captures;
- synthetic daily portfolio history;
- benchmark history;
- since-purchase P&L;
- per-holding enrichment status.

Primary APIs:

- `POST /api/v1/portfolios/{id}/snapshot`
- `GET /api/v1/portfolios/{id}/snapshots`
- `GET /api/v1/snapshots/{snapshot_id}`
- `GET /api/v1/snapshots/{a}/delta/{b}`
- `GET /api/v1/history/{id}/status`
- `GET /api/v1/history/{id}/daily`
- legacy portfolio history endpoints
- holdings status and since-purchase endpoints

Important caveat:

- Daily portfolio history is synthetic. It assumes current quantities existed throughout the lookback window.

Current validation gap:

- The changes page currently has TypeScript comparisons against `"pending"` that no longer match the canonical history state union.

## Market Overview

Purpose: provide market context outside the uploaded portfolio.

Route:

- `/market`

Primary API:

- `GET /api/v1/market/overview`

Displays:

- major Indian indices;
- sector index data;
- gainers/losers;
- headlines placeholder or news integration where configured.

Notes:

- `/api/v1/live/indices` remains as deprecated legacy API.
- Market fetching uses timeout-protected yfinance calls.

## Portfolio Management

Purpose: manage multiple saved portfolios and portfolio lifecycle.

Route:

- `/portfolios`

Capabilities:

- list portfolios;
- view active portfolio;
- activate another portfolio;
- create manual portfolio;
- rename;
- delete;
- refresh an existing uploaded portfolio with new file;
- view source card and snapshots.

Primary APIs:

- `/api/v1/portfolios/`
- `/api/v1/portfolios/active`
- `/api/v1/portfolios/{id}`
- `/api/v1/portfolios/{id}/activate`
- `/api/v1/portfolios/{id}/refresh`
- `/api/v1/portfolios/{id}/rename`

## Peers

Purpose: compare a selected holding against industry or provider-derived peers.

Route:

- `/peers`

Inputs:

- selected ticker, usually from current holdings.

Outputs:

- selected company fundamentals;
- peer fundamentals;
- rankings by metric;
- comparison metadata and sparse/incomplete flags.

Notes:

- Peer data depends on yfinance/provider availability.
- Sparse peer sets are explicitly labeled.

## News And Events

Purpose: monitor portfolio-relevant headlines and events.

Route:

- `/news`

Primary APIs:

- `/api/v1/news/`
- `/api/v1/news/events`

Capabilities:

- filter by ticker;
- filter by event type;
- show sentiment/event badges;
- summarize portfolio-relevant feed.

Limitations:

- NewsAPI is optional.
- Corporate events remain scaffold/limited depending on provider state.

## Watchlist

Purpose: track non-portfolio stocks for research.

Route:

- `/watchlist`

Capabilities:

- add ticker;
- edit name/tag/sector/target price/notes;
- delete ticker;
- display live price data where available;
- navigate toward peers/simulation flows.

Primary APIs:

- `GET /api/v1/watchlist/`
- `POST /api/v1/watchlist/`
- `PATCH /api/v1/watchlist/{ticker}`
- `DELETE /api/v1/watchlist/{ticker}`
- `GET /api/v1/live/quotes`

## Advisor

Purpose: answer natural-language questions about a user's portfolio.

Route:

- `/advisor`

Backend APIs:

- `GET /api/v1/advisor/status`
- `POST /api/v1/advisor/ask`
- `GET /api/v1/advisor/context/{portfolio_id}`

Behavior:

- Uses Anthropic if configured.
- Falls back to OpenAI if configured.
- Otherwise returns fallback signal.
- Frontend has a local rule-based advisor engine when backend AI is unavailable.

Safety requirement:

- Responses should remain explanatory and not present personalized financial advice as certainty.

## Brokers

Purpose: future broker integration surface.

Route:

- `/brokers`, hidden from sidebar.

Current state:

- connector registry exists;
- Zerodha and IBKR connectors are scaffolded;
- connection state can be persisted;
- sync returns scaffold/not-implemented responses for unimplemented connectors.

Not production-ready:

- OAuth/session lifecycle;
- token refresh;
- actual holdings pull;
- broker-grade reconciliation.

## Optimization And Simulation

Purpose: explore portfolio allocation, efficient frontier, and rebalance ideas.

Routes:

- `/optimize`
- `/simulate`
- `/frontier` deprecated

Primary APIs:

- `/api/v1/optimization/full`
- `/api/v1/optimization/status`
- `/api/v1/frontier/` deprecated scaffold

Current state:

- optimization service has meaningful backend structure;
- routes are hidden/beta;
- simulation uses frontend state and optimization outputs to model changes;
- not part of the core visible product loop.

## Debug Diagnostics

Purpose: inspect system status and module health during development.

Route:

- `/debug`, visible only in development sidebar.

Capabilities:

- health checks;
- portfolio bundle inspection;
- fundamentals and quant diagnostics;
- provider status;
- portfolio/snapshot/advisor/broker checks;
- module status overview.

Production note:

- Keep hidden in production.
