/**
 * usePortfolio Hook
 * ------------------
 * Single source of truth for all portfolio data in the UI.
 * Reacts to data mode changes from the global Zustand store.
 *
 * Architecture note:
 *   Core fetch (holdings + summary + sectors) is required — failure blocks render.
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
      // ── Core data (all three must succeed) ─────────────────────────────────
      const [holdingsData, summaryData, sectorsData] = await Promise.all([
        portfolioApi.getHoldings(mode),
        portfolioApi.getSummary(mode),
        portfolioApi.getSectorAllocation(mode),
      ])

      // ── Enrich each holding with client-side computed fields ───────────────
      //    These are display values only — the backend never stores them.
      const totalValue = summaryData.total_value
      const enriched: Holding[] = holdingsData.map((h) => {
        const marketValue = h.quantity * (h.current_price ?? h.average_cost)
        const pnl = h.current_price !== null
          ? (h.current_price - h.average_cost) * h.quantity
          : 0
        const pnlPct = h.current_price !== null && h.average_cost > 0
          ? ((h.current_price - h.average_cost) / h.average_cost) * 100
          : 0
        const weight = totalValue > 0 ? (marketValue / totalValue) * 100 : 0

        return {
          ...h,
          market_value: marketValue,
          pnl,
          pnl_pct: pnlPct,
          weight,
        }
      })

      setHoldings(enriched)
      setSummary(summaryData)
      setSectors(sectorsData)

      // ── Supplementary: commentary (non-blocking) ───────────────────────────
      //    Commentary requires additional computation on the backend.
      //    If it fails, dashboard still renders — insights panel shows empty.
      analyticsApi
        .getCommentary(mode)
        .then((data) => setInsights(data.insights))
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
