# P-Insight Environment

Last updated: 2026-05-18

## Rules

- Never commit real `.env` files.
- Secrets stay backend-only.
- Frontend environment variables are public once bundled.
- Market data, broker, payment, and AI keys must not use frontend prefixes.
- Production should use PostgreSQL, not local SQLite.
- Missing optional providers should degrade gracefully with placeholders or disabled features.

## Frontend Variables

Target Vite variables:

```text
VITE_API_BASE_URL=
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_APP_ENV=
VITE_POSTHOG_KEY=
VITE_SENTRY_DSN=
```

Current repo compatibility note:

- The current frontend is Next.js, so it currently reads `NEXT_PUBLIC_API_URL`.
- During a future Vite migration, replace public variable usage with `VITE_*`.
- Never expose AI, market data, broker, Stripe secret, or database credentials in frontend variables.

## Backend Variables

```text
DATABASE_URL=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
JWT_SECRET=
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
MARKET_DATA_PROVIDER=
MARKET_DATA_API_KEY=
POLYGON_API_KEY=
FMP_API_KEY=
PLAID_CLIENT_ID=
PLAID_SECRET=
PLAID_ENV=
ZERODHA_API_KEY=
ZERODHA_API_SECRET=
IBKR_CLIENT_ID=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
REDIS_URL=
RESEND_API_KEY=
SENTRY_DSN=
```

Existing compatibility variables:

```text
APP_NAME=
APP_VERSION=
APP_ENV=
DEBUG=
LOG_LEVEL=
DOCS_ENABLED=
FRONTEND_URL=
ALLOWED_ORIGINS=
DEFAULT_DATA_MODE=
LIVE_API_ENABLED=
BROKER_SYNC_ENABLED=
AI_CHAT_ENABLED=
ADVANCED_ANALYTICS_ENABLED=
FEATURE_PORTFOLIO_CORE=
FEATURE_UPLOAD=
FEATURE_WATCHLIST=
FEATURE_QUANT=
FEATURE_FUNDAMENTALS=
FEATURE_HISTORY=
FEATURE_MARKET_DATA=
FEATURE_NEWS=
FEATURE_ADVISOR=
FEATURE_BROKER_SYNC=
ALPHA_VANTAGE_API_KEY=
FINANCIAL_MODELING_PREP_API_KEY=
NEWS_API_KEY=
```

## Local Development Defaults

Backend:

```text
APP_ENV=development
DEBUG=false
DOCS_ENABLED=true
DATABASE_URL=sqlite:///./p_insight.db
MARKET_DATA_PROVIDER=mock
AI_CHAT_ENABLED=false
BROKER_SYNC_ENABLED=false
```

Frontend:

```text
NEXT_PUBLIC_API_URL=http://localhost:8000
VITE_API_BASE_URL=http://localhost:8000
VITE_APP_ENV=development
```

## Production Defaults

Backend:

```text
APP_ENV=production
DEBUG=false
DOCS_ENABLED=false
DATABASE_URL=postgresql+psycopg2://USER:PASSWORD@HOST:5432/DB
MARKET_DATA_PROVIDER=mock
```

Set `ALLOWED_ORIGINS` to the deployed frontend origins.

Frontend:

```text
VITE_API_BASE_URL=https://api.example.com
VITE_APP_ENV=production
```

## Provider Notes

### Supabase

- `SUPABASE_URL` can be public in the frontend if used by Supabase client auth.
- `SUPABASE_ANON_KEY` can be public.
- `SUPABASE_SERVICE_ROLE_KEY` is backend-only.

### AI

- `OPENAI_API_KEY` and `ANTHROPIC_API_KEY` are backend-only.
- AI routes should return provider-unavailable errors if keys are absent.

### Market Data

- `MARKET_DATA_PROVIDER=mock` for local development.
- `POLYGON_API_KEY`, `FMP_API_KEY`, and generic `MARKET_DATA_API_KEY` are backend-only.
- Frontend must call only P-Insight market-data endpoints.

### Broker Providers

- Plaid, Zerodha, IBKR, and Alpaca credentials are backend-only.
- Broker connection endpoints remain placeholders until provider security and normalization are implemented.

### Stripe

- `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are backend-only.
- Checkout endpoint can remain placeholder until billing is activated.

### Observability

- `SENTRY_DSN` may exist on backend and frontend, but use separate projects/DSNs where possible.
- `VITE_POSTHOG_KEY` is public analytics instrumentation.

