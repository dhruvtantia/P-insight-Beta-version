/**
 * API Service Layer
 * ------------------
 * All HTTP calls to the FastAPI backend go through this file.
 * Components and hooks never call fetch() directly.
 *
 * To add a new endpoint:
 *   1. Add a function to the appropriate namespace below
 *   2. Import and use it in the relevant hook or component
 */

import type { DataMode, PortfolioSummary, Holding, SectorAllocation, RiskMetrics, FinancialRatio, PortfolioInsight, NewsArticle, WatchlistItem, WatchlistItemInput, EfficientFrontierData, ChatMessage, UploadResponse, PeerComparisonData, CorporateEvent, NewsEventType, LiveQuotesResponse, LiveProviderStatus, QuantFullResponse, OptimizationFullResponse, PortfolioMeta, PortfolioListResponse, SnapshotSummary, SnapshotDetail, PortfolioDelta, BrokerListResponse, BrokerConnection, BrokerConnectResponse, BrokerSyncResponse } from '@/types'

// ─── Refresh Response (not yet in types/index.ts — defined inline) ────────────
export interface RefreshResponse {
  success:                   boolean
  portfolio_id:              number
  filename:                  string
  holdings_parsed:           number
  rows_skipped:              number
  pre_refresh_snapshot_id:   number | null
  post_refresh_snapshot_id:  number | null
  message:                   string
}

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

// ─── Base Fetch Utility ───────────────────────────────────────────────────────

async function apiFetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }))
    throw new Error(error.detail ?? `API error: ${response.status}`)
  }

  return response.json()
}

function withMode(endpoint: string, mode: DataMode): string {
  return `${endpoint}?mode=${mode}`
}

// ─── Portfolio API ────────────────────────────────────────────────────────────

export const portfolioApi = {
  getHoldings: (mode: DataMode) =>
    apiFetch<Holding[]>(withMode('/api/v1/portfolio/', mode)),

  getSummary: (mode: DataMode) =>
    apiFetch<PortfolioSummary>(withMode('/api/v1/portfolio/summary', mode)),

  getSectorAllocation: (mode: DataMode) =>
    apiFetch<SectorAllocation[]>(withMode('/api/v1/portfolio/sectors', mode)),

  uploadPortfolio: async (file: File): Promise<UploadResponse> => {
    const formData = new FormData()
    formData.append('file', file)
    const response = await fetch(`${BASE_URL}/api/v1/portfolio/upload`, {
      method: 'POST',
      body: formData,
    })
    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(error.detail ?? 'Upload failed')
    }
    return response.json()
  },
}

// ─── Analytics API ────────────────────────────────────────────────────────────

export const analyticsApi = {
  getRiskMetrics: (mode: DataMode) =>
    apiFetch<RiskMetrics>(withMode('/api/v1/analytics/risk', mode)),

  getFinancialRatios: (mode: DataMode) =>
    apiFetch<FinancialRatio[]>(withMode('/api/v1/analytics/ratios', mode)),

  getCommentary: (mode: DataMode) =>
    apiFetch<{ insights: PortfolioInsight[]; total: number }>(
      withMode('/api/v1/analytics/commentary', mode)
    ),
}

// ─── Efficient Frontier API ───────────────────────────────────────────────────

export const frontierApi = {
  getFrontier: (mode: DataMode) =>
    apiFetch<EfficientFrontierData>(withMode('/api/v1/frontier/', mode)),
}

// ─── Watchlist API ────────────────────────────────────────────────────────────

export const watchlistApi = {
  getWatchlist: () =>
    apiFetch<WatchlistItem[]>('/api/v1/watchlist/'),

  addToWatchlist: (payload: WatchlistItemInput) =>
    apiFetch<WatchlistItem>('/api/v1/watchlist/', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  removeFromWatchlist: (ticker: string) =>
    apiFetch<{ success: boolean }>(`/api/v1/watchlist/${ticker}`, {
      method: 'DELETE',
    }),
}

// ─── Peers API ────────────────────────────────────────────────────────────────

export const peersApi = {
  getPeers: (ticker: string, mode: DataMode) =>
    apiFetch<PeerComparisonData>(
      withMode(`/api/v1/peers/${ticker}`, mode)
    ),
}

// ─── News API ─────────────────────────────────────────────────────────────────

export const newsApi = {
  getNews: (
    mode: DataMode,
    options?: { tickers?: string[]; eventType?: NewsEventType }
  ) => {
    const params = new URLSearchParams({ mode })
    if (options?.tickers?.length)  params.set('tickers', options.tickers.join(','))
    if (options?.eventType)        params.set('event_type', options.eventType)
    return apiFetch<{ articles: NewsArticle[]; total: number; source: string; event_types: string[] }>(
      `/api/v1/news/?${params.toString()}`
    )
  },

  getEvents: (
    mode: DataMode,
    options?: { tickers?: string[]; eventType?: string }
  ) => {
    const params = new URLSearchParams({ mode })
    if (options?.tickers?.length) params.set('tickers', options.tickers.join(','))
    if (options?.eventType)       params.set('event_type', options.eventType)
    return apiFetch<{ events: CorporateEvent[]; total: number; source: string }>(
      `/api/v1/news/events?${params.toString()}`
    )
  },
}

// ─── AI Chat API ──────────────────────────────────────────────────────────────

export const aiChatApi = {
  sendMessage: (message: string, portfolioContext?: object) =>
    apiFetch<{ reply: string; source: string; enabled: boolean }>('/api/v1/ai-chat/', {
      method: 'POST',
      body: JSON.stringify({ message, portfolio_context: portfolioContext }),
    }),
}

// ─── Quantitative Analytics API ──────────────────────────────────────────────

export const quantApi = {
  /**
   * Full quantitative analytics bundle: risk metrics, cumulative performance,
   * drawdown series, correlation matrix, per-holding contributions.
   *
   * Results are cached server-side (24h mock / 10min live).
   * One call fetches everything — use `useQuantAnalytics()` hook.
   */
  getFull: (mode: DataMode, period: '1y' | '6mo' | '3mo' = '1y') =>
    apiFetch<QuantFullResponse>(
      `/api/v1/quant/full?mode=${mode}&period=${period}`
    ),

  /** Meta only — provider status, valid tickers, date range. No heavy computation. */
  getStatus: (mode: DataMode, period: '1y' | '6mo' | '3mo' = '1y') =>
    apiFetch<QuantFullResponse['meta']>(
      `/api/v1/quant/status?mode=${mode}&period=${period}`
    ),
}

// ─── Live Data API ────────────────────────────────────────────────────────────

export const liveApi = {
  /**
   * Fetch live closing prices for one or more tickers.
   * @param tickers  Array of ticker symbols, e.g. ["TCS.NS", "INFY.NS"]
   */
  getQuotes: (tickers: string[]) =>
    apiFetch<LiveQuotesResponse>(
      `/api/v1/live/quotes?tickers=${tickers.map(encodeURIComponent).join(',')}`
    ),

  /**
   * Fetch full fundamental data for a single ticker from Yahoo Finance.
   * Includes P/E, P/B, ROE, margins, growth rates, etc.
   */
  getFundamentals: (ticker: string) =>
    apiFetch<FinancialRatio & { from_cache: boolean; source: string }>(
      `/api/v1/live/fundamentals?ticker=${encodeURIComponent(ticker)}`
    ),

  /**
   * Fetch the live provider status: yfinance availability + cache health.
   * Safe to call frequently — makes no external requests.
   */
  getProviderStatus: () =>
    apiFetch<LiveProviderStatus>('/api/v1/live/status'),
}

// ─── Optimization API ─────────────────────────────────────────────────────────

export type OptPeriod     = '1y' | '6mo' | '3mo'
export type ErMethod      = 'historical_mean' | 'ema_mean'
export type CovMethod     = 'auto' | 'sample' | 'ledoit_wolf'

export const optimizationApi = {
  /**
   * Full optimization result: efficient frontier, min-variance, max-Sharpe,
   * current portfolio point, rebalance deltas, and debug inputs.
   *
   * Cached server-side (24h mock / 10min live).
   */
  getFull: (
    mode:      DataMode,
    period:    OptPeriod  = '1y',
    erMethod:  ErMethod   = 'historical_mean',
    covMethod: CovMethod  = 'auto',
    nPoints:   number     = 40,
  ) => {
    const params = new URLSearchParams({
      mode, period,
      er_method:  erMethod,
      cov_method: covMethod,
      n_points:   String(nPoints),
    })
    return apiFetch<OptimizationFullResponse>(`/api/v1/optimization/full?${params}`)
  },

  /** Meta only — quick status for the debug panel. */
  getStatus: (mode: DataMode, period: OptPeriod = '1y') =>
    apiFetch<OptimizationFullResponse['meta']>(
      `/api/v1/optimization/status?mode=${mode}&period=${period}`
    ),
}

// ─── Portfolio Management API ─────────────────────────────────────────────────

export const portfolioMgmtApi = {
  /** List all portfolios + active_id */
  list: () =>
    apiFetch<PortfolioListResponse>('/api/v1/portfolios/'),

  /** Get the currently active portfolio metadata */
  getActive: () =>
    apiFetch<PortfolioMeta>('/api/v1/portfolios/active'),

  /** Set a portfolio as active */
  activate: (portfolioId: number) =>
    apiFetch<{ success: boolean; activated_id: number; activated_name: string; previously_active: number | null }>(
      `/api/v1/portfolios/${portfolioId}/activate`,
      { method: 'POST' }
    ),

  /** Rename a portfolio */
  rename: (portfolioId: number, name: string) =>
    apiFetch<PortfolioMeta>(`/api/v1/portfolios/${portfolioId}/rename`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    }),

  /** Delete a portfolio */
  delete: (portfolioId: number) =>
    apiFetch<{ success: boolean; deleted_id: number; message: string }>(
      `/api/v1/portfolios/${portfolioId}`,
      { method: 'DELETE' }
    ),

  /** Create an empty manual portfolio */
  create: (name: string, description?: string) =>
    apiFetch<PortfolioMeta>('/api/v1/portfolios/', {
      method: 'POST',
      body: JSON.stringify({ name, description }),
    }),

  /** Get a specific portfolio's metadata */
  getById: (portfolioId: number) =>
    apiFetch<PortfolioMeta>(`/api/v1/portfolios/${portfolioId}`),

  /**
   * Re-import a new file into an existing portfolio (refresh / re-upload).
   * Creates pre- and post-refresh snapshots automatically.
   * Uses FormData — does NOT go through apiFetch (no Content-Type: application/json).
   */
  refresh: async (
    portfolioId: number,
    file: File,
    columnMapping: Record<string, string | null>,
  ): Promise<RefreshResponse> => {
    const form = new FormData()
    form.append('file', file)
    form.append('column_mapping', JSON.stringify(columnMapping))
    const res = await fetch(`${BASE_URL}/api/v1/portfolios/${portfolioId}/refresh`, {
      method: 'POST',
      body: form,
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.detail ?? `Refresh failed: ${res.status}`)
    }
    return res.json()
  },
}

// ─── Snapshot API ─────────────────────────────────────────────────────────────

export const snapshotApi = {
  /** List all snapshots for a portfolio */
  list: (portfolioId: number) =>
    apiFetch<SnapshotSummary[]>(`/api/v1/portfolios/${portfolioId}/snapshots`),

  /** Create a snapshot for a portfolio */
  create: (portfolioId: number, label?: string) =>
    apiFetch<SnapshotSummary>(`/api/v1/portfolios/${portfolioId}/snapshot`, {
      method: 'POST',
      body: JSON.stringify(label ? { label } : {}),
    }),

  /** Get full snapshot detail */
  getDetail: (snapshotId: number) =>
    apiFetch<SnapshotDetail>(`/api/v1/snapshots/${snapshotId}`),

  /** Compute delta between two snapshots */
  getDelta: (snapshotAId: number, snapshotBId: number) =>
    apiFetch<PortfolioDelta>(`/api/v1/snapshots/${snapshotAId}/delta/${snapshotBId}`),

  /** Delete a snapshot */
  delete: (snapshotId: number) =>
    apiFetch<{ success: boolean; deleted_id: number }>(
      `/api/v1/snapshots/${snapshotId}`,
      { method: 'DELETE' }
    ),
}

// ─── Broker API ───────────────────────────────────────────────────────────────

export const brokerApi = {
  /** List all registered broker connectors with their metadata. */
  listConnectors: () =>
    apiFetch<BrokerListResponse>('/api/v1/brokers/'),

  /** Get the broker connection state for a specific portfolio. */
  getConnection: (portfolioId: number) =>
    apiFetch<BrokerConnection>(`/api/v1/brokers/${portfolioId}/connection`),

  /**
   * Connect a broker to a portfolio.
   * For scaffolded connectors returns `scaffolded: true` instead of erroring.
   */
  connect: (portfolioId: number, brokerName: string, accountId?: string, config?: Record<string, string>) =>
    apiFetch<BrokerConnectResponse>(`/api/v1/brokers/${portfolioId}/connect`, {
      method: 'POST',
      body: JSON.stringify({
        broker_name: brokerName,
        account_id:  accountId ?? null,
        config:      config    ?? {},
      }),
    }),

  /**
   * Trigger a broker sync — pulls holdings from the connected broker
   * and replaces the portfolio's holdings (with pre/post snapshots).
   */
  sync: (portfolioId: number) =>
    apiFetch<BrokerSyncResponse>(`/api/v1/brokers/${portfolioId}/sync`, {
      method: 'POST',
    }),

  /** Disconnect the broker from a portfolio. */
  disconnect: (portfolioId: number) =>
    apiFetch<{ success: boolean; portfolio_id: number; broker_name: string | null; message: string }>(
      `/api/v1/brokers/${portfolioId}/connection`,
      { method: 'DELETE' }
    ),
}

// ─── Health Check ─────────────────────────────────────────────────────────────

export const systemApi = {
  health: () => apiFetch<{ status: string; features: Record<string, boolean> }>('/health'),
}
