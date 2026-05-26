# Price Enrichment Smoke Checklist

Use this checklist after price-enrichment changes or before a release that touches upload, holdings, dashboard, optimizer, or history views.

## Upload Fixture

Create a CSV with four rows:

```csv
ticker,name,quantity,average_cost,current_price,sector
TCS,Tata Consultancy Services,2,3500,,Information Technology
TCS.NS,Tata Consultancy Services NSE,1,3500,,Information Technology
INVALID_PRICE_TEST,Invalid Ticker,3,100,,Unknown
INFY,Infosys,4,1400,1500,Information Technology
```

## Cases

1. Upload the file through the normal upload flow and confirm all accepted rows are persisted.
2. Confirm `TCS` resolves through the bounded Indian ticker variant order: `.NS`, `.BO`, then bare ticker.
3. Confirm `TCS.NS` remains already-suffixed and does not require user-side normalization.
4. Confirm `INVALID_PRICE_TEST` is labelled `missing` or `provider_failed`, keeps `current_price: null`, and does not show fake P&L.
5. Confirm `INFY` is labelled `uploaded_current_price` with `price_source: uploaded_csv`.

## API Checks

1. `GET /api/v1/portfolio/full?mode=uploaded` includes `meta.price_coverage`.
2. Valid live rows have `price_status: live` and `price_source: yfinance`.
3. Uploaded-price rows have `price_status: uploaded_current_price` and `price_source: uploaded_csv`.
4. Missing or failed rows have `market_value_uses_fallback: true`, nullable `pnl`, and an explicit degraded `price_status`.
5. Old provider timestamps are returned as `stale` at read time and are not treated as trusted analytics inputs.
6. `GET /api/v1/upload/v2/status/{portfolio_id}` exposes each holding's `price_status`, `price_source`, `price_timestamp`, and `price_failure_reason`.

## UI Checks

1. `/holdings` shows a visible state chip for live, uploaded, missing, failed, stale, and cost-basis fallback rows.
2. Price chips do not overflow table cells at desktop or mobile widths.
3. Valid priced rows still calculate market value, P&L, and weights.
4. Missing, failed, stale, and fallback rows remain visible but do not masquerade as live prices.
5. `/upload` enrichment details show price state separately from sector/name/fundamentals state.
6. `/upload` still allows Dashboard navigation when price/enrichment status is degraded, but the status copy does not present degraded data as full success.
