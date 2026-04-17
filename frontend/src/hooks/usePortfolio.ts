/**
 * usePortfolio Hook
 * ------------------
 * Single source of truth for all portfolio data in the UI.
 * Reacts to data mode changes from the global Zustand store.
 *
 * Architecture note:
 *   Core fetch uses GET /portfolio/full — one bundled call instead of three.
 *   The backend pre-computes market_value, pnl, pnl_pct, and weight per holding,
 *   so no client-side financial math is needed here.
 *
 *   Commentary fetch is supplementary — failure is swallowed and logged.
 *   This prevents a slow/broken analytics endpoint from crashing the dashboard.
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import { portfolioApi, analyticsApi } from '@/services/api'
import { useDataModeStore } from '@/store/dataModeStore'
import type { Holding, PortfolioSummary, SectorAllocation, PortfolioInsight } from '@/types'

export interface UsePortfolioReturn {
  holdings: Holding[]
  summary: PortfolioSummary | null
  sectors: SectorAllocation[]
  insights: PortfolioInsight[]
  loading: boolean
  error: string | null
  refetch: () => void
}

export function usePortfolio(): UsePortfolioReturn {
  const { mode } = useDataModeStore()

  const [holdings, setHoldings]   = useState<Holding[]>([])
  const [summary, setSummary]     = useState<PortfolioSummary | null>(null)
  const [sectors, setSectors]     = useState<SectorAllocation[]>([])
  const [insights, setInsights]   = useState<PortfolioInsight[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      // ── Single bundled call (replaces 3 parallel requests) ─────────────────
      //    Holdings already contain market_value, pnl, pnl_pct, weight —
      //    pre-computed by the backend in one provider pass.
      const data = await portfolioApi.getPortfolioFull(mode)

      setHoldings(data.holdings)
      setSummary(data.summary)
      setSectors(data.sectors)

      // ── Supplementary: commentary (non-blocking) ───────────────────────────
      //    Commentary requires additional computation on the backend.
      //    If it fails, dashboard still renders — insights panel shows empty.
      analyticsApi
        .getCommentary(mode)
        .then((res) => setInsights(res.insights))
        .catch((err) => {
          console.warn('[usePortfolio] Commentary unavailable (non-fatal):', err)
          setInsights([])
        })

    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Failed to load portfolio data. Check that the backend is running on port 8000.'
      setError(message)
      console.error('[usePortfolio] Core fetch failed:', err)
    } finally {
      setLoading(false)
    }
  }, [mode])

  // Re-fetch automatically whenever data mode changes
  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  return {
    holdings,
    summary,
    sectors,
    insights,
    loading,
    error,
    refetch: fetchAll,
  }
}
