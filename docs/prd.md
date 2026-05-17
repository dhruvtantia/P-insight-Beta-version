# P-Insight Product Requirements

Last updated: 2026-05-18

## Product Summary

P-Insight is a portfolio analytics dashboard that helps investors upload or connect portfolio data and quickly understand portfolio value, holdings, allocation, gain/loss, risk, rule-based insights, and AI-generated explanations.

The first launch target is a stable web application. Mobile support comes later and must reuse the same backend, database, API contracts, authentication boundary, analytics engine, market data abstraction, and AI advisor service.

## Primary Launch Goal

Ship a stable private-beta web product quickly enough to onboard real users and learn from usage.

The MVP should prioritize:

- Reliability and clear error handling over feature breadth.
- Modular backend contracts over tightly coupled endpoints.
- Deterministic analytics over opaque AI output.
- Professional finance-dashboard UI over novelty.
- Upload/manual portfolio workflows before broker sync.

## Target Users

- Retail investors who manage their own equity portfolios.
- Users who keep broker exports or spreadsheets and want immediate portfolio diagnostics.
- Early beta users willing to upload holdings manually before broker connections exist.

## Core Jobs To Be Done

- Upload a portfolio file and convert it into normalized holdings.
- Create and maintain holdings manually.
- See total value, allocation, weights, and gain/loss.
- Understand concentration and basic risk metrics.
- Ask cautious, data-grounded AI questions about the portfolio.
- Track usage limits and plan state without requiring full payments on day one.

## MVP Scope

### Must Have

- Landing page.
- Auth placeholder pages and backend auth abstraction.
- Portfolio creation.
- CSV/XLSX portfolio upload.
- Column mapping.
- Upload validation before import.
- Holdings table with add, edit, delete, search, sort, and filters.
- Market data provider abstraction.
- Mock market data provider.
- Portfolio dashboard.
- Basic analytics.
- Rule-based insight framework.
- AI advisor summary endpoint.
- AI advisor Q&A endpoint.
- Watchlist placeholder or MVP list.
- Billing placeholder.
- Settings page.
- Broker connection placeholder.
- Admin and monitoring placeholder.

### Explicitly Out Of Scope For MVP

- Live broker sync.
- Trading or order routing.
- Peer comparison as a launch blocker.
- Tax analytics.
- Complex optimization.
- Social/community features.
- Mobile app.
- Real-time WebSocket streaming unless the backend foundation is already stable.

## Success Criteria For Private Beta

- A user can create a portfolio and persist it.
- A user can upload a supported file, map columns, validate rows, confirm import, and see holdings.
- Invalid tickers and missing prices do not crash the backend or frontend.
- Empty portfolios render clean empty states.
- Analytics endpoints return deterministic outputs for the same holdings.
- AI summary uses structured portfolio context and avoids investment guarantees.
- Frontend errors are readable and actionable.
- Deployed frontend can reach deployed backend.
- Database persistence is verified with PostgreSQL-compatible migrations.

## Product Pages

- Landing.
- Login.
- Signup.
- Onboarding.
- Dashboard.
- Holdings.
- Upload.
- Analytics.
- AI Advisor.
- Watchlist.
- Broker Connections.
- Billing.
- Settings.
- Admin placeholder.

## Core User Flows

### Upload Portfolio

1. User selects or creates a portfolio.
2. User uploads CSV/XLSX.
3. Backend creates an upload job and parsed upload rows.
4. Frontend shows preview.
5. User maps columns.
6. Backend validates rows.
7. Frontend shows accepted rows, rejected rows, and warnings.
8. User confirms import.
9. Backend writes normalized holdings.
10. User goes to dashboard.

### Manual Holdings Management

1. User opens holdings page.
2. User adds, edits, or deletes holdings.
3. Backend validates request schema.
4. Repository writes holdings.
5. Analytics can be recalculated from persisted holdings.

### AI Advisor

1. User requests summary or asks a question.
2. Backend builds structured context from portfolio data and analytics outputs.
3. AI service calls configured provider only from the backend.
4. Backend stores conversation/messages.
5. Response includes cautious language and relevant context metadata.

## Pricing Placeholders

### Free

- 1 portfolio.
- Manual upload.
- Limited holdings.
- Basic analytics.
- Limited AI questions.
- Delayed price refresh.

### Pro

- Multiple portfolios.
- Higher holdings limit.
- Advanced analytics.
- More AI questions.
- Export reports.
- Faster price refresh.
- Watchlist.
- Benchmark comparison.

### Premium Later

- Broker sync.
- Automated daily updates.
- Advanced diagnostics.
- Scenario analysis.
- Weekly AI reports.
- Mobile alerts.

## Feature Contract Template

Every feature must have a contract in docs or module-level docs:

```text
Feature:
Owner module:
Inputs:
Outputs:
Database tables touched:
External APIs used:
Error cases:
Frontend states:
Permissions:
Test cases:
```

## Initial Feature Contracts

### Feature: Portfolio Upload

Owner module: uploads

Inputs: CSV/XLSX file, portfolio_id, column_mapping

Outputs: upload_job_id, imported_rows, rejected_rows, warnings

Database tables touched: upload_jobs, upload_rows, holdings

External APIs used: None during import. Market data refresh may run after successful import through the market_data module.

Error cases:

- Missing symbol.
- Invalid quantity.
- Unsupported file type.
- Duplicate holdings.
- Invalid portfolio_id.
- Malformed file.
- Invalid column mapping.

Frontend states:

- Idle.
- Uploading.
- Previewing.
- Mapping.
- Validating.
- Validation failed.
- Ready to confirm.
- Import successful.
- Import failed.

Permissions: Only owner of portfolio can upload.

Test cases:

- Valid CSV imports.
- Valid XLSX imports.
- Invalid rows rejected.
- Empty file rejected.
- Duplicate symbols handled.
- Wrong column mapping fails safely.
- Confirm step writes holdings only after validation.

### Feature: Holdings CRUD

Owner module: holdings

Inputs: portfolio_id, holding payload

Outputs: holding response, updated holdings collection

Database tables touched: portfolios, holdings, assets, asset_prices

External APIs used: None directly. Price refresh goes through market_data.

Error cases:

- Portfolio not found.
- Holding not found.
- Invalid quantity.
- Invalid average cost.
- Unsupported currency.
- Unauthorized portfolio access.

Frontend states:

- Loading.
- Empty.
- Table ready.
- Saving.
- Delete confirmation.
- Error.

Permissions: Only owner of portfolio can mutate holdings.

Test cases:

- Add valid holding.
- Edit valid holding.
- Delete holding.
- Reject invalid quantity.
- Reject access to another user's portfolio.

### Feature: Analytics Summary

Owner module: analytics

Inputs: portfolio_id

Outputs: total value, daily change, gain/loss, weights, allocation, risk metrics, rule-based insights

Database tables touched: portfolios, holdings, asset_prices, analytics_results

External APIs used: None directly. Analytics reads cached price data.

Error cases:

- Portfolio not found.
- Empty portfolio.
- Missing price.
- Unsupported asset class.
- Insufficient history for volatility.

Frontend states:

- Loading.
- Empty.
- Partial data.
- Ready.
- Error.

Permissions: Only owner of portfolio can view analytics.

Test cases:

- Deterministic total value.
- Weights sum to 100 within tolerance.
- Missing price does not crash.
- Empty portfolio returns empty analytics response.
- High concentration rule triggers.

### Feature: AI Advisor

Owner module: ai_advisor

Inputs: portfolio_id, optional conversation_id, user_question

Outputs: summary or answer, conversation metadata, usage metadata

Database tables touched: portfolios, holdings, analytics_results, ai_conversations, ai_messages, feature_usage

External APIs used: OpenAI or Anthropic through backend-only provider service.

Error cases:

- Portfolio not found.
- Empty portfolio.
- AI provider not configured.
- Usage limit reached.
- Provider timeout.
- Unsafe or unsupported prompt.

Frontend states:

- Loading context.
- Empty portfolio.
- Ready.
- Sending.
- Answer received.
- Provider unavailable.
- Usage limit reached.

Permissions: Only owner of portfolio can ask questions about that portfolio.

Test cases:

- Context builder emits expected shape.
- Summary endpoint uses analytics outputs.
- Question endpoint stores conversation turn.
- Provider unavailable returns readable error.
- AI response disclaimer and cautious language guardrails are present.

