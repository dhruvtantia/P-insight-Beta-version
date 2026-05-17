# P-Insight API Contract

Last updated: 2026-05-18

Base URL:

```text
/api
```

Current repo note: existing routes currently use `/api/v1` in several places. The rebuild target uses `/api` for MVP contracts. During migration, either keep backwards-compatible `/api/v1` aliases or introduce a clean versioning decision before frontend rewiring.

## Common Error Schema

All endpoints should return this shape for non-2xx responses:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Readable error message.",
    "details": {},
    "request_id": "req_123"
  }
}
```

Common error codes:

- `VALIDATION_ERROR`
- `UNAUTHORIZED`
- `FORBIDDEN`
- `RESOURCE_NOT_FOUND`
- `CONFLICT`
- `USAGE_LIMIT_REACHED`
- `PROVIDER_UNAVAILABLE`
- `INTERNAL_ERROR`

## Auth Requirement Values

- `Public`: no authenticated user required.
- `Required`: authenticated user required.
- `Placeholder`: MVP may use stubbed current user, but endpoint must be shaped for real auth.
- `Webhook`: provider signature verification required.

## Health

### GET /api/health

Auth requirement: Public

Request schema: none

Response schema:

```json
{
  "status": "healthy",
  "app": "P-Insight API",
  "version": "0.1.0",
  "env": "development"
}
```

Example response:

```json
{
  "status": "healthy",
  "app": "P-Insight API",
  "version": "0.1.0",
  "env": "development"
}
```

## Portfolios

### POST /api/portfolios

Auth requirement: Placeholder

Request schema:

```json
{
  "name": "Long Term Portfolio",
  "base_currency": "USD",
  "description": "Core holdings"
}
```

Response schema:

```json
{
  "id": "portfolio_123",
  "name": "Long Term Portfolio",
  "base_currency": "USD",
  "description": "Core holdings",
  "created_at": "2026-05-18T00:00:00Z",
  "updated_at": "2026-05-18T00:00:00Z"
}
```

Error schema: common error schema

Example payload:

```json
{
  "name": "Long Term Portfolio",
  "base_currency": "USD",
  "description": "Core holdings"
}
```

### GET /api/portfolios

Auth requirement: Placeholder

Request schema: none

Response schema:

```json
{
  "items": [
    {
      "id": "portfolio_123",
      "name": "Long Term Portfolio",
      "base_currency": "USD",
      "description": "Core holdings",
      "total_value": 125000.25,
      "created_at": "2026-05-18T00:00:00Z",
      "updated_at": "2026-05-18T00:00:00Z"
    }
  ]
}
```

Error schema: common error schema

Example response:

```json
{
  "items": []
}
```

### GET /api/portfolios/{portfolio_id}

Auth requirement: Placeholder

Request schema: path parameter `portfolio_id`

Response schema:

```json
{
  "id": "portfolio_123",
  "name": "Long Term Portfolio",
  "base_currency": "USD",
  "description": "Core holdings",
  "created_at": "2026-05-18T00:00:00Z",
  "updated_at": "2026-05-18T00:00:00Z"
}
```

Error schema: common error schema

Example response:

```json
{
  "id": "portfolio_123",
  "name": "Long Term Portfolio",
  "base_currency": "USD",
  "description": "Core holdings",
  "created_at": "2026-05-18T00:00:00Z",
  "updated_at": "2026-05-18T00:00:00Z"
}
```

### PATCH /api/portfolios/{portfolio_id}

Auth requirement: Placeholder

Request schema:

```json
{
  "name": "Updated Portfolio Name",
  "description": "Updated description"
}
```

Response schema: portfolio object

Error schema: common error schema

Example payload:

```json
{
  "name": "Updated Portfolio Name"
}
```

### DELETE /api/portfolios/{portfolio_id}

Auth requirement: Placeholder

Request schema: path parameter `portfolio_id`

Response schema:

```json
{
  "deleted": true,
  "portfolio_id": "portfolio_123"
}
```

Error schema: common error schema

Example response:

```json
{
  "deleted": true,
  "portfolio_id": "portfolio_123"
}
```

## Holdings

### GET /api/portfolios/{portfolio_id}/holdings

Auth requirement: Placeholder

Request schema: path parameter `portfolio_id`

Response schema:

```json
{
  "items": [
    {
      "id": "holding_123",
      "portfolio_id": "portfolio_123",
      "symbol": "AAPL",
      "company_name": "Apple Inc.",
      "quantity": 10,
      "average_cost": 150,
      "current_price": 190,
      "market_value": 1900,
      "weight": 0.24,
      "day_change": 12.5,
      "total_gain_loss": 400,
      "sector": "Technology",
      "asset_class": "Equity",
      "currency": "USD",
      "last_updated": "2026-05-18T00:00:00Z"
    }
  ]
}
```

Error schema: common error schema

Example response:

```json
{
  "items": []
}
```

### POST /api/portfolios/{portfolio_id}/holdings

Auth requirement: Placeholder

Request schema:

```json
{
  "symbol": "AAPL",
  "company_name": "Apple Inc.",
  "quantity": 10,
  "average_cost": 150,
  "currency": "USD",
  "sector": "Technology",
  "asset_class": "Equity",
  "exchange": "NASDAQ"
}
```

Response schema: holding object

Error schema: common error schema

Example payload:

```json
{
  "symbol": "AAPL",
  "quantity": 10,
  "average_cost": 150,
  "currency": "USD"
}
```

### PATCH /api/portfolios/{portfolio_id}/holdings/{holding_id}

Auth requirement: Placeholder

Request schema:

```json
{
  "quantity": 12,
  "average_cost": 152.25,
  "sector": "Technology"
}
```

Response schema: holding object

Error schema: common error schema

Example payload:

```json
{
  "quantity": 12
}
```

### DELETE /api/portfolios/{portfolio_id}/holdings/{holding_id}

Auth requirement: Placeholder

Request schema: path parameters `portfolio_id`, `holding_id`

Response schema:

```json
{
  "deleted": true,
  "holding_id": "holding_123"
}
```

Error schema: common error schema

Example response:

```json
{
  "deleted": true,
  "holding_id": "holding_123"
}
```

## Uploads

### POST /api/portfolios/{portfolio_id}/uploads

Auth requirement: Placeholder

Request schema: multipart form data with `file`

Response schema:

```json
{
  "upload_job_id": "upload_123",
  "portfolio_id": "portfolio_123",
  "status": "parsed",
  "filename": "holdings.csv",
  "detected_columns": ["Ticker", "Quantity", "Average Cost"],
  "preview_rows": [
    {
      "row_number": 1,
      "values": {
        "Ticker": "AAPL",
        "Quantity": "10",
        "Average Cost": "150"
      }
    }
  ]
}
```

Error schema: common error schema

Example payload: multipart file upload

### GET /api/uploads/{upload_job_id}

Auth requirement: Placeholder

Request schema: path parameter `upload_job_id`

Response schema:

```json
{
  "upload_job_id": "upload_123",
  "portfolio_id": "portfolio_123",
  "status": "mapping_required",
  "filename": "holdings.csv",
  "total_rows": 100,
  "valid_rows": 0,
  "invalid_rows": 0,
  "warnings": []
}
```

Error schema: common error schema

Example response:

```json
{
  "upload_job_id": "upload_123",
  "portfolio_id": "portfolio_123",
  "status": "mapping_required",
  "filename": "holdings.csv",
  "total_rows": 100,
  "valid_rows": 0,
  "invalid_rows": 0,
  "warnings": []
}
```

### POST /api/uploads/{upload_job_id}/column-mapping

Auth requirement: Placeholder

Request schema:

```json
{
  "mapping": {
    "symbol": "Ticker",
    "company_name": "Name",
    "quantity": "Quantity",
    "average_cost": "Average Cost",
    "market_value": "Market Value",
    "currency": "Currency",
    "sector": "Sector",
    "asset_class": "Asset Class",
    "exchange": "Exchange"
  }
}
```

Response schema:

```json
{
  "upload_job_id": "upload_123",
  "status": "mapped",
  "mapping": {}
}
```

Error schema: common error schema

Example payload:

```json
{
  "mapping": {
    "symbol": "Ticker",
    "quantity": "Quantity",
    "average_cost": "Average Cost"
  }
}
```

### POST /api/uploads/{upload_job_id}/validate

Auth requirement: Placeholder

Request schema: none

Response schema:

```json
{
  "upload_job_id": "upload_123",
  "status": "validated",
  "valid_rows": 95,
  "invalid_rows": 5,
  "warnings": [
    {
      "row_number": 3,
      "field": "sector",
      "message": "Sector missing; will use Unknown."
    }
  ],
  "errors": [
    {
      "row_number": 9,
      "field": "quantity",
      "message": "Quantity must be greater than zero."
    }
  ]
}
```

Error schema: common error schema

Example response:

```json
{
  "upload_job_id": "upload_123",
  "status": "validated",
  "valid_rows": 1,
  "invalid_rows": 0,
  "warnings": [],
  "errors": []
}
```

### POST /api/uploads/{upload_job_id}/confirm

Auth requirement: Placeholder

Request schema:

```json
{
  "allow_partial_import": false
}
```

Response schema:

```json
{
  "upload_job_id": "upload_123",
  "status": "imported",
  "portfolio_id": "portfolio_123",
  "imported_rows": 95,
  "rejected_rows": 5
}
```

Error schema: common error schema

Example payload:

```json
{
  "allow_partial_import": false
}
```

### GET /api/uploads/{upload_job_id}/errors

Auth requirement: Placeholder

Request schema: path parameter `upload_job_id`

Response schema:

```json
{
  "items": [
    {
      "row_number": 9,
      "field": "quantity",
      "message": "Quantity must be greater than zero.",
      "raw_values": {}
    }
  ]
}
```

Error schema: common error schema

Example response:

```json
{
  "items": []
}
```

## Market Data

### GET /api/market-data/prices?symbols=AAPL,MSFT

Auth requirement: Placeholder

Request schema: query parameter `symbols`

Response schema:

```json
{
  "items": [
    {
      "symbol": "AAPL",
      "price": 190,
      "currency": "USD",
      "as_of": "2026-05-18T00:00:00Z",
      "provider": "mock",
      "is_stale": false
    }
  ]
}
```

Error schema: common error schema

Example response:

```json
{
  "items": [
    {
      "symbol": "AAPL",
      "price": 190,
      "currency": "USD",
      "as_of": "2026-05-18T00:00:00Z",
      "provider": "mock",
      "is_stale": false
    }
  ]
}
```

### GET /api/market-data/prices/{symbol}

Auth requirement: Placeholder

Request schema: path parameter `symbol`

Response schema: price object

Error schema: common error schema

Example response:

```json
{
  "symbol": "AAPL",
  "price": 190,
  "currency": "USD",
  "as_of": "2026-05-18T00:00:00Z",
  "provider": "mock",
  "is_stale": false
}
```

### GET /api/market-data/history/{symbol}

Auth requirement: Placeholder

Request schema: path parameter `symbol`, query parameters `start`, `end`

Response schema:

```json
{
  "symbol": "AAPL",
  "currency": "USD",
  "points": [
    {
      "date": "2026-05-18",
      "close": 190
    }
  ]
}
```

Error schema: common error schema

Example response:

```json
{
  "symbol": "AAPL",
  "currency": "USD",
  "points": []
}
```

## Analytics

### GET /api/portfolios/{portfolio_id}/analytics/summary

Auth requirement: Placeholder

Request schema: path parameter `portfolio_id`

Response schema:

```json
{
  "portfolio_id": "portfolio_123",
  "total_value": 125000,
  "daily_change": 450,
  "daily_change_pct": 0.0036,
  "total_gain_loss": 12500,
  "total_gain_loss_pct": 0.1111,
  "volatility": 0.18,
  "sharpe_ratio": 1.05,
  "largest_holding": {
    "symbol": "AAPL",
    "weight": 0.32
  },
  "cash_pct": 0,
  "last_updated": "2026-05-18T00:00:00Z"
}
```

Error schema: common error schema

Example response:

```json
{
  "portfolio_id": "portfolio_123",
  "total_value": 0,
  "daily_change": 0,
  "daily_change_pct": 0,
  "total_gain_loss": 0,
  "total_gain_loss_pct": 0,
  "volatility": null,
  "sharpe_ratio": null,
  "largest_holding": null,
  "cash_pct": 0,
  "last_updated": "2026-05-18T00:00:00Z"
}
```

### GET /api/portfolios/{portfolio_id}/analytics/allocation

Auth requirement: Placeholder

Request schema: path parameter `portfolio_id`

Response schema:

```json
{
  "asset_allocation": [
    {
      "asset_class": "Equity",
      "market_value": 100000,
      "weight": 0.8
    }
  ],
  "sector_allocation": [
    {
      "sector": "Technology",
      "market_value": 40000,
      "weight": 0.32
    }
  ],
  "currency_exposure": [
    {
      "currency": "USD",
      "market_value": 125000,
      "weight": 1
    }
  ]
}
```

Error schema: common error schema

Example response:

```json
{
  "asset_allocation": [],
  "sector_allocation": [],
  "currency_exposure": []
}
```

### GET /api/portfolios/{portfolio_id}/analytics/risk

Auth requirement: Placeholder

Request schema: path parameter `portfolio_id`

Response schema:

```json
{
  "volatility": 0.18,
  "sharpe_ratio": 1.05,
  "max_drawdown": null,
  "concentration": {
    "largest_holding_weight": 0.32,
    "top_5_weight": 0.7,
    "hhi": 0.18
  }
}
```

Error schema: common error schema

Example response:

```json
{
  "volatility": null,
  "sharpe_ratio": null,
  "max_drawdown": null,
  "concentration": {
    "largest_holding_weight": 0,
    "top_5_weight": 0,
    "hhi": 0
  }
}
```

### GET /api/portfolios/{portfolio_id}/analytics/performance

Auth requirement: Placeholder

Request schema: path parameter `portfolio_id`

Response schema:

```json
{
  "total_cost": 112500,
  "total_value": 125000,
  "unrealized_gain_loss": 12500,
  "unrealized_gain_loss_pct": 0.1111,
  "daily_change": 450,
  "daily_change_pct": 0.0036
}
```

Error schema: common error schema

Example response:

```json
{
  "total_cost": 0,
  "total_value": 0,
  "unrealized_gain_loss": 0,
  "unrealized_gain_loss_pct": 0,
  "daily_change": 0,
  "daily_change_pct": 0
}
```

### GET /api/portfolios/{portfolio_id}/analytics/rules

Auth requirement: Placeholder

Request schema: path parameter `portfolio_id`

Response schema:

```json
{
  "items": [
    {
      "rule_id": "HIGH_CONCENTRATION",
      "severity": "high",
      "title": "High concentration risk",
      "message": "AAPL represents 32% of your portfolio.",
      "affected_symbols": ["AAPL"]
    }
  ]
}
```

Error schema: common error schema

Example response:

```json
{
  "items": []
}
```

### POST /api/portfolios/{portfolio_id}/analytics/recalculate

Auth requirement: Placeholder

Request schema:

```json
{
  "refresh_prices": false
}
```

Response schema:

```json
{
  "portfolio_id": "portfolio_123",
  "status": "completed",
  "analytics_result_id": "analytics_123",
  "calculated_at": "2026-05-18T00:00:00Z"
}
```

Error schema: common error schema

Example payload:

```json
{
  "refresh_prices": false
}
```

## AI Advisor

### POST /api/portfolios/{portfolio_id}/ai/summary

Auth requirement: Placeholder

Request schema:

```json
{
  "conversation_id": null
}
```

Response schema:

```json
{
  "conversation_id": "conv_123",
  "message_id": "msg_123",
  "summary": "Based on the provided data, your portfolio appears concentrated in Technology...",
  "context": {
    "portfolio_summary": {},
    "risk_metrics": {},
    "allocation": {},
    "rule_based_insights": []
  },
  "usage": {
    "questions_used": 1,
    "questions_limit": 5
  }
}
```

Error schema: common error schema

Example payload:

```json
{
  "conversation_id": null
}
```

### POST /api/portfolios/{portfolio_id}/ai/question

Auth requirement: Placeholder

Request schema:

```json
{
  "conversation_id": "conv_123",
  "question": "What are the biggest risks in my portfolio?"
}
```

Response schema:

```json
{
  "conversation_id": "conv_123",
  "message_id": "msg_124",
  "answer": "Based on the provided data, one risk to review is concentration...",
  "citations": [
    {
      "type": "holding",
      "symbol": "AAPL"
    }
  ],
  "usage": {
    "questions_used": 2,
    "questions_limit": 5
  }
}
```

Error schema: common error schema

Example payload:

```json
{
  "conversation_id": "conv_123",
  "question": "What are the biggest risks in my portfolio?"
}
```

### GET /api/portfolios/{portfolio_id}/ai/conversations

Auth requirement: Placeholder

Request schema: path parameter `portfolio_id`

Response schema:

```json
{
  "items": [
    {
      "id": "conv_123",
      "portfolio_id": "portfolio_123",
      "title": "Portfolio risk review",
      "created_at": "2026-05-18T00:00:00Z",
      "updated_at": "2026-05-18T00:00:00Z"
    }
  ]
}
```

Error schema: common error schema

Example response:

```json
{
  "items": []
}
```

### GET /api/ai/conversations/{conversation_id}

Auth requirement: Placeholder

Request schema: path parameter `conversation_id`

Response schema:

```json
{
  "id": "conv_123",
  "portfolio_id": "portfolio_123",
  "messages": [
    {
      "id": "msg_123",
      "role": "assistant",
      "content": "Based on the provided data...",
      "created_at": "2026-05-18T00:00:00Z"
    }
  ]
}
```

Error schema: common error schema

Example response:

```json
{
  "id": "conv_123",
  "portfolio_id": "portfolio_123",
  "messages": []
}
```

## Watchlist

### GET /api/watchlist

Auth requirement: Placeholder

Request schema: none

Response schema:

```json
{
  "items": [
    {
      "id": "watchlist_123",
      "symbol": "MSFT",
      "company_name": "Microsoft Corporation",
      "target_price": 450,
      "notes": "Review later",
      "created_at": "2026-05-18T00:00:00Z"
    }
  ]
}
```

Error schema: common error schema

Example response:

```json
{
  "items": []
}
```

### POST /api/watchlist

Auth requirement: Placeholder

Request schema:

```json
{
  "symbol": "MSFT",
  "company_name": "Microsoft Corporation",
  "target_price": 450,
  "notes": "Review later"
}
```

Response schema: watchlist item

Error schema: common error schema

Example payload:

```json
{
  "symbol": "MSFT",
  "target_price": 450
}
```

### DELETE /api/watchlist/{watchlist_item_id}

Auth requirement: Placeholder

Request schema: path parameter `watchlist_item_id`

Response schema:

```json
{
  "deleted": true,
  "watchlist_item_id": "watchlist_123"
}
```

Error schema: common error schema

Example response:

```json
{
  "deleted": true,
  "watchlist_item_id": "watchlist_123"
}
```

## Broker Connections Placeholder

### GET /api/broker-connections

Auth requirement: Placeholder

Request schema: none

Response schema:

```json
{
  "items": [
    {
      "id": "broker_conn_123",
      "provider": "plaid",
      "status": "placeholder",
      "created_at": "2026-05-18T00:00:00Z"
    }
  ]
}
```

Error schema: common error schema

Example response:

```json
{
  "items": []
}
```

### POST /api/broker-connections/connect-placeholder

Auth requirement: Placeholder

Request schema:

```json
{
  "provider": "plaid"
}
```

Response schema:

```json
{
  "id": "broker_conn_123",
  "provider": "plaid",
  "status": "placeholder",
  "message": "Broker connection placeholder created."
}
```

Error schema: common error schema

Example payload:

```json
{
  "provider": "plaid"
}
```

### DELETE /api/broker-connections/{connection_id}

Auth requirement: Placeholder

Request schema: path parameter `connection_id`

Response schema:

```json
{
  "deleted": true,
  "connection_id": "broker_conn_123"
}
```

Error schema: common error schema

Example response:

```json
{
  "deleted": true,
  "connection_id": "broker_conn_123"
}
```

## Billing Placeholder

### GET /api/billing/plan

Auth requirement: Placeholder

Request schema: none

Response schema:

```json
{
  "plan": "free",
  "status": "active",
  "limits": {
    "portfolios": 1,
    "holdings": 50,
    "ai_questions_per_month": 5,
    "price_refresh_delay_minutes": 1440
  },
  "usage": {
    "portfolios": 0,
    "holdings": 0,
    "ai_questions_this_month": 0
  }
}
```

Error schema: common error schema

Example response:

```json
{
  "plan": "free",
  "status": "active",
  "limits": {
    "portfolios": 1,
    "holdings": 50,
    "ai_questions_per_month": 5,
    "price_refresh_delay_minutes": 1440
  },
  "usage": {
    "portfolios": 0,
    "holdings": 0,
    "ai_questions_this_month": 0
  }
}
```

### POST /api/billing/create-checkout-session

Auth requirement: Placeholder

Request schema:

```json
{
  "plan": "pro",
  "success_url": "https://app.example.com/billing/success",
  "cancel_url": "https://app.example.com/billing"
}
```

Response schema:

```json
{
  "checkout_url": null,
  "status": "placeholder",
  "message": "Stripe checkout is not configured yet."
}
```

Error schema: common error schema

Example payload:

```json
{
  "plan": "pro",
  "success_url": "https://app.example.com/billing/success",
  "cancel_url": "https://app.example.com/billing"
}
```

### POST /api/billing/webhook

Auth requirement: Webhook

Request schema: Stripe webhook payload

Response schema:

```json
{
  "received": true
}
```

Error schema: common error schema

Example response:

```json
{
  "received": true
}
```

