// ─── Risk Analytics ──────────────────────────────────────────────────────────

/**
 * RiskProfile — rule-based portfolio classification.
 * Evaluated in priority order inside computeRiskSnapshot().
 */
export type RiskProfile =
  | 'highly_concentrated'  // max holding ≥ 40% OR HHI ≥ 0.30
  | 'sector_concentrated'  // max sector ≥ 60%
  | 'aggressive'           // top-3 ≥ 60% OR ≤ 2 sectors
  | 'conservative'         // ≥ 5 sectors AND HHI ≤ 0.12
  | 'moderate'             // default / balanced

/**
 * RiskSnapshot — all concentration + diversification metrics derived purely
 * from holdings[] and sectors[]. No historical prices required.
 */
export interface RiskSnapshot {
  // ── Concentration ──────────────────────────────────────────────────────────
  max_holding_weight: number       // % — largest single position
  top3_weight: number              // % — top 3 positions combined
  top5_weight: number              // % — top 5 positions combined
  max_sector_weight: number        // % — largest sector
  max_sector_name: string          // name of largest sector

  // ── Breadth ────────────────────────────────────────────────────────────────
  num_holdings: number
  num_sectors: number

  // ── Diversification ────────────────────────────────────────────────────────
  hhi: number                      // Herfindahl–Hirschman Index (0–1, lower = more diversified)
  effective_n: number              // 1/HHI — equivalent number of equal-weight positions
  diversification_score: number    // 0–100 composite (weight diversity 70% + sector breadth 30%)

  // ── Profile ────────────────────────────────────────────────────────────────
  risk_profile: RiskProfile
  risk_profile_reason: string      // human-readable explanation of classification

  // ── Flags ──────────────────────────────────────────────────────────────────
  single_stock_flag: boolean       // any holding ≥ 30%
  sector_concentration_flag: boolean  // any sector ≥ 50%

  // ── Top holdings (for ConcentrationBreakdown chart) ────────────────────────
  top_holdings_by_weight: Array<{
    ticker: string
    name: string
    weight: number    // %
    sector: string
  }>
}

// ─── Data Mode ────────────────────────────────────────────────────────────────

export type DataMode = 'mock' | 'uploaded' | 'live' | 'broker'

export interface DataModeConfig {
  value: DataMode
  label: string
  description: string
  enabled: boolean
  badge?: string
}

// ─── Portfolio ────────────────────────────────────────────────────────────────

export interface Holding {
  id?: number
  ticker: string
  name: string
  quantity: number
  average_cost: number
  current_price: number | null
  sector: string | null
  asset_class?: string
  currency?: string
  // Provenance — which provider sourced current_price (null = default/mock)
  // 'live'        — yfinance returned a valid price
  // 'db_only'     — yfinance unavailable, using DB-stored price
  // 'unavailable' — yfinance failed and no DB price; using average_cost as fallback
  // 'mock_fallback' — deprecated, kept for legacy mock-mode support
  // 'uploaded'    — price came from uploaded file
  data_source?: 'live' | 'db_only' | 'unavailable' | 'mock_fallback' | 'uploaded' | null
  // Derived (computed on frontend)
  market_value?: number
  pnl?: number
  pnl_pct?: number
  weight?: number
}

export interface PortfolioSummary {
  total_value: number
  total_cost: number
  total_pnl: number
  total_pnl_pct: number
  num_holdings: number
  top_sector: string | null
  data_source: DataMode
}

export interface SectorAllocation {
  sector: string
  value: number
  weight_pct: number
  num_holdings: number
}

// ─── Analytics ────────────────────────────────────────────────────────────────

export interface RiskMetrics {
  beta: number | null
  sharpe_ratio: number | null
  volatility_annualised: number | null
  max_drawdown: number | null
  var_95: number | null
  note: string
}

/** Full fundamentals response matching FinancialRatioResponse on the backend. */
export interface FinancialRatio {
  ticker: string
  name: string
  sector: string | null
  industry: string | null
  source: string

  // Valuation
  pe_ratio: number | null
  forward_pe: number | null
  pb_ratio: number | null
  ev_ebitda: number | null
  peg_ratio: number | null

  // Income
  dividend_yield: number | null

  // Quality
  roe: number | null
  roa: number | null
  operating_margin: number | null
  profit_margin: number | null

  // Growth
  revenue_growth: number | null
  earnings_growth: number | null

  // Balance sheet
  debt_to_equity: number | null
  market_cap: number | null
}

/**
 * A holding enriched with its per-ticker fundamentals.
 * Produced by lib/fundamentals.ts → mergeWithFundamentals().
 */
export interface HoldingWithFundamentals extends Holding {
  fundamentals: FinancialRatio | null
}

/**
 * Portfolio-level weighted-average fundamentals.
 * Each metric is weighted by the holding's share of total portfolio value.
 * Null means no holdings had a non-null value for that metric.
 */
export interface WeightedFundamentals {
  // Valuation
  wtd_pe: number | null
  wtd_forward_pe: number | null
  wtd_pb: number | null
  wtd_ev_ebitda: number | null
  wtd_peg: number | null

  // Income
  wtd_div_yield: number | null

  // Quality
  wtd_roe: number | null
  wtd_roa: number | null
  wtd_operating_margin: number | null
  wtd_profit_margin: number | null

  // Growth
  wtd_revenue_growth: number | null
  wtd_earnings_growth: number | null

  // Leverage
  wtd_debt_to_equity: number | null

  // Coverage counts (how many holdings contributed to each metric)
  coverage: Record<string, number>
}

export interface PortfolioInsight {
  type: 'performance' | 'concentration' | 'diversification' | 'risk'
  title: string
  message: string
  severity: 'info' | 'warning' | 'positive' | 'neutral'
}

// ─── Watchlist ────────────────────────────────────────────────────────────────

/** Conviction/category tags — mirrors backend WATCHLIST_TAGS constant */
export type WatchlistTag =
  | 'General'
  | 'High Conviction'
  | 'Speculative'
  | 'Income'
  | 'Defensive'
  | 'Research'

export interface WatchlistItem {
  id:           number
  ticker:       string
  name:         string | null
  tag:          WatchlistTag | null
  sector:       string | null
  target_price: number | null
  notes:        string | null
  added_at:     string
}

/** Shape of the POST body when adding a new watchlist item */
export interface WatchlistItemInput {
  ticker:       string
  name?:        string
  tag?:         WatchlistTag
  sector?:      string
  target_price?: number
  notes?:       string
}

// ─── Peer Comparison ──────────────────────────────────────────────────────────

/**
 * PeerStock — one stock in the peer comparison response.
 * Same shape as FinancialRatio but name/sector may be null for sparse peer data.
 */
export interface PeerStock {
  ticker: string
  name: string | null
  sector: string | null
  industry: string | null
  source: string
  // Valuation
  pe_ratio: number | null
  forward_pe: number | null
  pb_ratio: number | null
  ev_ebitda: number | null
  peg_ratio: number | null
  // Income
  dividend_yield: number | null
  // Quality
  roe: number | null
  roa: number | null
  operating_margin: number | null
  profit_margin: number | null
  // Growth
  revenue_growth: number | null
  earnings_growth: number | null
  // Balance sheet
  debt_to_equity: number | null
  market_cap: number | null
}

/** Full response from GET /api/v1/peers/{ticker} */
export interface PeerComparisonData {
  ticker: string
  selected: PeerStock
  peers: PeerStock[]
  source: string
}

// ─── News & Events ────────────────────────────────────────────────────────────

/**
 * event_type values — must match backend EVENT_TYPES list in endpoints/news.py
 * and the NEWS_EVENT_TYPES constant in frontend/src/constants/index.ts.
 */
export type NewsEventType =
  | 'earnings'
  | 'dividend'
  | 'deal'
  | 'rating'
  | 'company_update'
  | 'market_event'
  | 'regulatory'
  | 'management'

export type NewsSentiment = 'positive' | 'negative' | 'neutral'

/** Phase 1: served from mock JSON. Phase 2: live news API. */
export interface NewsArticle {
  title:        string
  summary:      string
  url:          string
  published_at: string
  source:       string
  tickers:      string[]
  event_type:   NewsEventType
  sentiment:    NewsSentiment
}

/** Upcoming corporate event — earnings date, dividend record date, AGM, etc. */
export interface CorporateEvent {
  ticker:     string
  name:       string | null
  event_type: 'earnings' | 'dividend' | 'agm' | 'bonus' | 'split'
  title:      string
  date:       string     // ISO date string
  details:    string | null
}

// ─── Efficient Frontier ───────────────────────────────────────────────────────

export interface FrontierPoint {
  risk: number
  return: number
  weights?: Record<string, number>
}

export interface EfficientFrontierData {
  status: string
  note: string
  frontier_points: FrontierPoint[]
  min_variance_portfolio: FrontierPoint | null
  max_sharpe_portfolio: FrontierPoint | null
}

// ─── AI Chat ─────────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

export interface ChatResponse {
  reply: string
  source: string
  enabled: boolean
}

// ─── Quantitative Analytics (Phase 2) ────────────────────────────────────────

export interface PortfolioRiskMetrics {
  annualized_volatility: number | null
  annualized_return:     number | null
  sharpe_ratio:          number | null
  sortino_ratio:         number | null
  max_drawdown:          number | null
  downside_deviation:    number | null
  var_95:                number | null
  beta:                  number | null
  tracking_error:        number | null
  information_ratio:     number | null
  alpha:                 number | null
  error?:                string | null
}

export interface BenchmarkMetrics {
  name:                  string
  ticker:                string
  annualized_return:     number | null
  annualized_volatility: number | null
  sharpe_ratio:          number | null
  max_drawdown:          number | null
  source:                string
}

export interface HoldingContribution {
  ticker:            string
  weight:            number           // %
  annualized_return: number | null    // %
  volatility:        number | null    // %
  beta:              number | null
  error?:            string | null
}

export interface TimeSeriesPoint {
  date:  string   // ISO date
  value: number   // cumulative return in %
}

export interface PairwisePair {
  tickers: [string, string]
  value:   number
}

export interface CorrelationResult {
  tickers:          string[]
  matrix:           number[][]
  average_pairwise: number | null
  min_pair:         PairwisePair | null
  max_pair:         PairwisePair | null
  interpretation:   'low' | 'moderate' | 'high' | 'very_high' | null
}

export interface QuantDateRange {
  start: string
  end:   string
}

export interface QuantMeta {
  provider_mode:       string | null
  period:              string
  valid_tickers:       string[]
  invalid_tickers:     string[]
  /** Per-ticker data source, e.g. {"TCS.NS": "yfinance", "WIPRO.NS": "unavailable"} */
  ticker_status:       Record<string, string>
  data_points:         number
  date_range:          QuantDateRange | null
  benchmark_ticker:    string
  benchmark_name:      string
  benchmark_source:    string | null
  /** False when benchmark fetch failed in live mode — beta/alpha/IR will be null */
  benchmark_available: boolean
  risk_free_rate:      number
  cached:              boolean
  error?:              string | null
}

export interface QuantFullResponse {
  metrics: {
    portfolio: PortfolioRiskMetrics | null
    benchmark: BenchmarkMetrics | null
  }
  performance: {
    portfolio: TimeSeriesPoint[]
    benchmark: TimeSeriesPoint[]
  }
  drawdown:      TimeSeriesPoint[]
  correlation:   CorrelationResult
  contributions: HoldingContribution[]
  meta:          QuantMeta
}

// ─── Live Data ───────────────────────────────────────────────────────────────

/** Response from GET /api/v1/live/quotes */
export interface LiveQuotesResponse {
  prices: Record<string, number>    // ticker → last close price
  requested: string[]
  found: string[]
  missing: string[]
  yfinance_available: boolean
  source: string
  note?: string
}

/** Cache entry in the live status response */
export interface CachedPriceTicker {
  ticker: string
  price: number
  age_seconds: number
  fresh: boolean
}

/** Response from GET /api/v1/live/status */
export interface LiveProviderStatus {
  live_api_enabled: boolean
  yfinance_available: boolean
  provider: string
  note: string | null
  cache: {
    yfinance_available: boolean
    price_cache_size: number
    fund_cache_size: number
    price_ttl_seconds: number
    fund_ttl_seconds: number
    cached_price_tickers: CachedPriceTicker[]
  } | null
}

// ─── API Response Wrappers ────────────────────────────────────────────────────

export interface ApiResponse<T> {
  data: T | null
  error: string | null
  loading: boolean
}

export interface UploadResponse {
  success: boolean
  filename: string
  holdings_parsed: number
  message: string
}

// ─── Portfolio Optimization ───────────────────────────────────────────────────

/**
 * A single portfolio plotted on the efficient frontier (risk × return plane).
 * Used for current, min_variance, max_sharpe, and frontier[] points.
 */
export interface PortfolioPoint {
  label:           string
  expected_return: number          // annualised % (e.g. 14.5 = 14.5%)
  volatility:      number          // annualised % (e.g. 18.2 = 18.2%)
  sharpe_ratio:    number
  weights:         Record<string, number>  // ticker → allocation (0–1 scale)
}

/**
 * A single buy/sell recommendation to move from current → max Sharpe.
 */
export interface RebalanceDelta {
  ticker:         string
  current_weight: number   // %
  target_weight:  number   // %
  delta_pct:      number   // positive = buy, negative = sell
  action:         'buy' | 'sell'
}

export interface OptimizationMeta {
  provider_mode:           string | null
  period:                  string
  valid_tickers:           string[]
  invalid_tickers:         string[]
  n_observations:          number
  expected_returns_method: string | null
  covariance_method:       string | null
  optimizer_method:        string | null
  n_frontier_points:       number
  risk_free_rate:          number
  constraints:             string[]
  scipy_available:         boolean | null
  sklearn_available:       boolean | null
  cached:                  boolean
  error:                   string | null
}

export interface OptimizationInputsSummary {
  expected_returns:    Record<string, number>  // ticker → annualised %
  covariance_diagonal: Record<string, number> // ticker → variance
}

/**
 * Full response from GET /api/v1/optimization/full
 */
export interface OptimizationFullResponse {
  current:      PortfolioPoint | null
  min_variance: PortfolioPoint | null
  max_sharpe:   PortfolioPoint | null
  frontier:     PortfolioPoint[]
  rebalance:    RebalanceDelta[]
  inputs:       OptimizationInputsSummary
  meta:         OptimizationMeta
}

// ─── Portfolio Management (Phase 5) ──────────────────────────────────────────

/** Source-specific metadata stored as JSON on the backend. */
export interface PortfolioSourceMeta {
  filename?:     string | null
  row_count?:    number | null
  import_time?:  string | null   // ISO datetime of last import
  broker_name?:  string | null   // e.g. "zerodha" (future)
  account_id?:   string | null   // broker account (future)
  sync_frequency?: string | null // e.g. "daily" (future)
}

export interface PortfolioMeta {
  id:               number
  name:             string
  source:           'mock' | 'uploaded' | 'manual' | 'broker'
  is_active:        boolean
  description:      string | null
  upload_filename:  string | null
  num_holdings:     number
  last_synced_at:   string | null   // ISO datetime, null for mock/manual
  source_metadata:  string | null   // JSON string — parse with parseSourceMeta()
  is_refreshable:   boolean         // computed by backend
  created_at:       string   // ISO datetime
  updated_at:       string   // ISO datetime
}

export interface PortfolioListResponse {
  portfolios: PortfolioMeta[]
  active_id:  number | null
}

/** Convenience helper — parses source_metadata JSON safely. */
export function parseSourceMeta(p: PortfolioMeta): PortfolioSourceMeta {
  if (!p.source_metadata) return {}
  try { return JSON.parse(p.source_metadata) as PortfolioSourceMeta }
  catch { return {} }
}

// ─── Snapshots ────────────────────────────────────────────────────────────────

export interface SnapshotHoldingRow {
  ticker:       string
  name:         string | null
  quantity:     number | null
  average_cost: number | null
  market_value: number | null
  weight_pct:   number | null
  sector:       string | null
}

export interface SnapshotSummary {
  id:            number
  portfolio_id:  number
  label:         string | null
  captured_at:   string   // ISO datetime
  total_value:   number | null
  total_cost:    number | null
  total_pnl:     number | null
  total_pnl_pct: number | null
  num_holdings:  number | null
  top_sector:    string | null
}

export interface SnapshotDetail extends SnapshotSummary {
  holdings:       SnapshotHoldingRow[]
  sector_weights: Record<string, number>
  risk_metrics:   Record<string, number>
  top_holdings:   Array<{ ticker: string; weight: number; sector: string }>
}

// ─── Delta ────────────────────────────────────────────────────────────────────

export interface HoldingDelta {
  ticker:        string
  name:          string | null
  sector:        string | null
  weight_before: number | null
  weight_after:  number | null
  weight_delta:  number | null
  value_before:  number | null
  value_after:   number | null
  value_delta:   number | null
  qty_before:    number | null
  qty_after:     number | null
  status:        'added' | 'removed' | 'increased' | 'decreased' | 'unchanged'
}

export interface SectorDelta {
  sector:        string
  weight_before: number | null
  weight_after:  number | null
  weight_delta:  number | null
}

export interface PortfolioDelta {
  snapshot_a_id:         number
  snapshot_b_id:         number
  captured_at_a:         string
  captured_at_b:         string
  days_apart:            number
  total_value_delta:     number | null
  total_value_delta_pct: number | null
  total_pnl_delta:       number | null
  holding_deltas:        HoldingDelta[]
  sector_deltas:         SectorDelta[]
  added_tickers:         string[]
  removed_tickers:       string[]
  increased_tickers:     string[]
  decreased_tickers:     string[]
  unchanged_tickers:     string[]
  has_changes:           boolean
}

// ─── Broker Connectors (Broker Sync Phase) ───────────────────────────────────

/** Sync / connection state for a broker-linked portfolio. */
export type BrokerSyncState =
  | 'disconnected'
  | 'pending'
  | 'connected'
  | 'syncing'
  | 'error'

/** Static metadata for one available broker connector. */
export interface BrokerInfo {
  broker_name:             string
  display_name:            string
  description:             string
  auth_method:             string    // "api_key" | "oauth" | "client_portal"
  region:                  string    // "IN" | "US" | "Global"
  asset_classes:           string[]
  is_configured:           boolean   // true = env vars present on server
  is_implemented:          boolean   // false = scaffold, not yet production-ready
  required_config_fields:  string[]
  docs_url:                string | null
  logo_slug:               string | null
}

/** Per-portfolio broker connection state (from BrokerConnection DB row). */
export interface BrokerConnection {
  id:               number | null   // null = no row exists
  portfolio_id:     number
  broker_name:      string | null
  connection_state: BrokerSyncState
  account_id:       string | null
  last_sync_at:     string | null   // ISO datetime
  sync_error:       string | null
  created_at:       string | null
  updated_at:       string | null
}

export interface BrokerListResponse {
  brokers: BrokerInfo[]
  total:   number
}

export interface BrokerConnectResponse {
  success:          boolean
  portfolio_id:     number
  broker_name:      string
  connection_state: BrokerSyncState
  account_id:       string | null
  message:          string
  scaffolded:       boolean
}

export interface BrokerSyncResponse {
  success:         boolean
  portfolio_id:    number
  broker_name:     string
  holdings_synced: number
  rows_skipped:    number
  pre_snap_id:     number | null
  post_snap_id:    number | null
  last_sync_at:    string | null
  message:         string
  scaffolded:      boolean
}

// ─── AI Advisor ──────────────────────────────────────────────────────────────

/** Which LLM provider is powering the advisor */
export type AdvisorProviderName = 'claude' | 'openai' | 'none'

/** Response from GET /advisor/status */
export interface AdvisorStatus {
  available:  boolean
  provider:   AdvisorProviderName
  model:      string | null
  message:    string
  ai_enabled: boolean
}

/** Context metadata included with each AI response */
export interface AdvisorContextSummary {
  holdings_count:     number
  snapshots_count:    number
  sectors_count:      number
  has_recent_changes: boolean
}

/** Response from POST /advisor/ask */
export interface AIAdvisorResponse {
  query:            string
  summary:          string
  insights:         string[]
  recommendations:  string[]
  follow_ups:       string[]
  category:         string

  provider:         AdvisorProviderName | 'fallback'
  model:            string | null
  latency_ms:       number
  fallback_used:    boolean
  error_message:    string | null
  context_summary:  AdvisorContextSummary | null
}

/** Request body for POST /advisor/ask */
export interface AdvisorQueryRequest {
  query:                string
  portfolio_id?:        number | null
  include_snapshots?:   boolean
  include_optimization?: boolean
}

// Context payload types (for debug endpoint GET /advisor/context/{id})

export interface HoldingBrief {
  ticker:     string
  name:       string
  weight_pct: number
  value:      number
  pnl_pct:    number
  sector:     string
}

export interface SectorBrief {
  sector:       string
  weight_pct:   number
  num_holdings: number
}

export interface SnapshotBrief {
  id:           number
  label:        string | null
  captured_at:  string
  total_value:  number
  num_holdings: number
}

export interface PortfolioRecentChanges {
  days_apart:      number
  value_delta:     number
  value_delta_pct: number
  added_tickers:   string[]
  removed_tickers: string[]
  increased_count: number
  decreased_count: number
}

export interface PortfolioContextPayload {
  portfolio_id:          number
  portfolio_name:        string
  source:                string
  total_value:           number
  total_cost:            number
  total_pnl:             number
  total_pnl_pct:         number
  num_holdings:          number
  top_holdings:          HoldingBrief[]
  sector_allocation:     SectorBrief[]
  risk_profile:          string
  hhi:                   number
  diversification_score: number
  max_holding_ticker:    string
  max_holding_weight:    number
  top3_weight:           number
  num_sectors:           number
  snapshot_count:        number
  snapshots:             SnapshotBrief[]
  recent_changes:        PortfolioRecentChanges | null
  built_at:              string
}

// ─── Action Center ────────────────────────────────────────────────────────────

export type ActionType     = 'warning' | 'suggestion' | 'info' | 'success'
export type ActionCategory = 'portfolio' | 'optimizer' | 'upload' | 'watchlist' | 'snapshot' | 'advisor'

export interface Action {
  id:          string
  type:        ActionType
  category:    ActionCategory
  title:       string
  description: string
  href?:       string
  cta?:        string
  priority:    number   // lower = higher priority
  dismissible: boolean
}
