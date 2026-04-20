# Feature Spec — Portfolio Aggregation Module

**Module owner directory:**
- Backend: `app/api/v1/endpoints/portfolio.py`, `app/services/portfolio_service.py`, `app/data_providers/{base,file_provider,live_provider}.py`.
- Frontend: `frontend/src/hooks/usePortfolio.ts`, `frontend/src/app/dashboard/`, `frontend/src/app/holdings/`.

---

## Purpose

Take the active portfolio's raw holdings (ticker, qty, cost) plus current prices, and produce the canonical "portfolio bundle" used by almost every page: enriched holdings, summary KPIs, and sector allocation — in one response.

## Inputs

- `mode` query parameter: `uploaded` | `live` | `broker`.
- Implicitly: the active portfolio (from memory for `uploaded`, from DB `Portfolio.is_active=True` for `live`).

## Outputs

- **`GET /api/v1/portfolio/full?mode=...`** →
  ```json
  {
    "holdings": [
      {
        "ticker": "TCS.NS", "name": "Tata Consultancy Services",
        "quantity": 10, "average_cost": 3200, "current_price": 3850,
        "market_value": 38500, "pnl": 6500, "pnl_pct": 20.3, "weight": 4.2,
        "sector": "IT Services", "data_source": "live|db_only|unavailable",
        "enrichment_status": "enriched|partial|failed"
      }
    ],
    "summary": {
      "total_value": 918000, "total_cost": 780000,
      "total_pnl": 138000, "pnl_pct": 17.7,
      "num_holdings": 22, "top_sector": "IT Services"
    },
    "sectors": [
      { "sector": "IT Services", "value": 230000, "weight_pct": 25.05, "count": 4 }
    ]
  }
  ```
- **Legacy endpoints** (backwards compat; deprecate):
  - `GET /portfolio/` → raw holdings.
  - `GET /portfolio/summary` → summary only.
  - `GET /portfolio/sectors` → sector allocation only.

## Canonical data contract

**`HoldingRaw`** (from provider): `ticker`, `name`, `quantity`, `average_cost`, `current_price`, `sector`, `data_source`.

**`HoldingFull`** (after aggregation, shipped to frontend): `HoldingRaw` + `market_value`, `pnl`, `pnl_pct`, `weight`.

**`PortfolioSummary`**: `total_value`, `total_cost`, `total_pnl`, `pnl_pct`, `num_holdings`, `top_sector`.

**`SectorAllocation`**: `sector`, `value`, `weight_pct`, `count`.

## Backend / frontend split

- **Backend:** resolve provider by mode, fetch raw holdings, two-pass aggregation (totals first, then per-holding enrichment + sector accumulation), return bundle. Should include `risk_snapshot` and `weighted_fundamentals` in the same bundle (refactor blueprint §3.3).
- **Frontend:** `usePortfolio()` hook exposes the bundle. Pages subscribe and render. *Currently re-fetches per page; planned fix = lift to AppShell context (refactor blueprint §3.1).*

## Non-goals

- Real-time price streaming (polling is fine).
- Multi-currency normalisation.
- Per-account / multi-portfolio aggregation in a single call (use `/portfolios` for switching).
- Transaction history replay (that's the History module).

## Open issues

1. **No backend-side cache on `/portfolio/full`.** Most-hit endpoint. Add 30–60s cache.
2. **No request deduplication on frontend.** `usePortfolio` per page. See refactor §3.1.
3. **Provider contract is informal** — providers attach optional fields inconsistently. Formalise via Pydantic.
4. **Legacy sub-endpoints still routed** — confirm no consumers and remove.
5. **Risk snapshot and weighted fundamentals not in the bundle yet** — they must be to deliver the "bundle-once" pattern.
