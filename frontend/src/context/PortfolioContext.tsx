/**
 * PortfolioContext — Shared portfolio data provider
 * --------------------------------------------------
 * Single source of truth for all portfolio data in the application.
 * Mounted once in AppShell; all pages and components consume via usePortfolio().
 *
 * Architecture:
 *   PortfolioProvider (AppShell)
 *     └─ fetches GET /portfolio/full once on mount + on mode change
 *     └─ exposes holdings, summary, sectors, riskSnapshot, fundamentalsSummary,
 *        meta, insights, loading, error, refetch via context
 *
 *   usePortfolio() (all pages)
 *     └─ thin wrapper over useContext(PortfolioContext)
 *     └─ throws if called outside PortfolioProvider
 *
 * Benefits over the previous per-page usePortfolio() pattern:
 *   - One fetch per mode change (not one per page mount)
 *   - riskSnapshot comes from the backend — no per-page useMemo + client math
 *   - Shared refetch: Refresh button on any page refreshes for everyone
 *   - Active portfolio ID is backend-authoritative (from meta.portfolio_id)
 */

'use client'

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from 'react'
import { portfolioApi, analyticsApi, ApiError } from '@/services/api'
import { useDataModeStore }                      from '@/store/dataModeStore'
import type {
  Holding,
  PortfolioSummary,
  SectorAllocation,
  PortfolioInsight,
  RiskSnapshot,
  FundamentalsSummary,
  PortfolioBundleMeta,
} from '@/types'

// ─── Context value shape ───────────────────────────────────────────────────────

export interface PortfolioContextValue {
  // Core portfolio data
  holdings:            Holding[]
  summary:             PortfolioSummary | null
  sectors:             SectorAllocation[]

  // Backend-computed risk snapshot (replaces client-side computeRiskSnapshot)
  riskSnapshot:        RiskSnapshot | null

  // Fundamentals availability (lightweight — no API call on backend)
  fundamentalsSummary: FundamentalsSummary | null

  // Provenance metadata
  meta:                PortfolioBundleMeta | null

  // Rule-based portfolio insights (supplementary, non-blocking)
  insights:            PortfolioInsight[]

  // Fetch state
  loading:             boolean
  error:               string | null
  /** true when we're showing stale data because a refresh failed */
  stale:               boolean
  refetch:             () => void
}

// ─── Context ───────────────────────────────────────────────────────────────────

const PortfolioContext = createContext<PortfolioContextValue | null>(null)

// ─── Provider ──────────────────────────────────────────────────────────────────

export function PortfolioProvider({ children }: { children: ReactNode }) {
  const { mode } = useDataModeStore()

  const [holdings,            setHoldings]            = useState<Holding[]>([])
  const [summary,             setSummary]             = useState<PortfolioSummary | null>(null)
  const [sectors,             setSectors]             = useState<SectorAllocation[]>([])
  const [riskSnapshot,        setRiskSnapshot]        = useState<RiskSnapshot | null>(null)
  const [fundamentalsSummary, setFundamentalsSummary] = useState<FundamentalsSummary | null>(null)
  const [meta,                setMeta]                = useState<PortfolioBundleMeta | null>(null)
  const [insights,            setInsights]            = useState<PortfolioInsight[]>([])
  const [loading,             setLoading]             = useState(true)
  const [error,               setError]               = useState<string | null>(null)
  const [stale,               setStale]               = useState(false)

  // Track whether we have ever successfully loaded data in this session.
  // If we have good data and a subsequent refresh fails, we preserve the
  // existing state rather than blanking the UI.
  const hasGoodDataRef = useRef(false)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      // ── Single bundled call — one round trip for all portfolio data ──────────
      //    Holdings already contain market_value, pnl, pnl_pct, weight.
      //    risk_snapshot is computed server-side — no client math needed.
      const data = await portfolioApi.getPortfolioFull(mode)

      setHoldings(data.holdings)
      setSummary(data.summary)
      setSectors(data.sectors)
      setRiskSnapshot(data.risk_snapshot ?? null)
      setFundamentalsSummary(data.fundamentals_summary ?? null)
      setMeta(data.meta ?? null)
      setStale(false)
      hasGoodDataRef.current = true

      // ── Supplementary: commentary (non-blocking) ─────────────────────────────
      //    If it fails, dashboard still renders — insights panel shows empty.
      analyticsApi
        .getCommentary(mode)
        .then((res) => setInsights(res.insights))
        .catch((err) => {
          console.warn('[PortfolioContext] Commentary unavailable (non-fatal):', err)
          setInsights([])
        })

    } catch (err) {
      // ── Classify the error for a useful message ──────────────────────────────
      let message: string
      if (err instanceof ApiError) {
        message = err.friendlyMessage
      } else if (err instanceof Error) {
        message = err.message
      } else {
        message = 'Failed to load portfolio data. Check that the backend is running on port 8000.'
      }

      setError(message)
      console.error('[PortfolioContext] Core fetch failed:', err)

      // ── Preserve stale data rather than blanking the UI ──────────────────────
      // If we have previously loaded good data, mark as stale and keep the
      // existing holdings/summary/sectors in state so the page remains usable.
      // Only on the very first load (no data yet) does the error state replace content.
      if (hasGoodDataRef.current) {
        setStale(true)
        // Do NOT reset holdings/summary/sectors/etc. — they remain from last good fetch.
      }
    } finally {
      setLoading(false)
    }
  }, [mode])

  // Re-fetch automatically when data mode changes.
  // When mode changes, clear stale flag so the user doesn't see old-mode data
  // while new-mode data loads.
  useEffect(() => {
    setStale(false)
    fetchAll()
  }, [fetchAll])

  const value: PortfolioContextValue = {
    holdings,
    summary,
    sectors,
    riskSnapshot,
    fundamentalsSummary,
    meta,
    insights,
    loading,
    error,
    stale,
    refetch: fetchAll,
  }

  return (
    <PortfolioContext.Provider value={value}>
      {children}
    </PortfolioContext.Provider>
  )
}

// ─── Consumer hook ─────────────────────────────────────────────────────────────

/**
 * usePortfolioContext
 * --------------------
 * Raw context consumer — throws if called outside PortfolioProvider.
 * Prefer usePortfolio() from '@/hooks/usePortfolio' which is the public API.
 */
export function usePortfolioContext(): PortfolioContextValue {
  const ctx = useContext(PortfolioContext)
  if (ctx === null) {
    throw new Error(
      'usePortfolioContext must be used inside <PortfolioProvider>. ' +
      'Make sure AppShell wraps children with PortfolioProvider.'
    )
  }
  return ctx
}
