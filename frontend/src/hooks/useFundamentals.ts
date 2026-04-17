/**
 * useFundamentals — fetches per-ticker financial ratios and exposes weighted metrics
 * -----------------------------------------------------------------------------------
 *
 * Accepts holdings from the parent's usePortfolio() call — does NOT re-fetch the
 * portfolio itself. This avoids any duplicate API calls.
 *
 * Returns:
 *   enrichedHoldings   — Holding[] joined with FinancialRatio (null if not found)
 *   weightedMetrics    — portfolio-level weighted-average fundamentals (from backend)
 *   ratios             — raw per-ticker ratios array (for FundamentalsTable)
 *   meta               — trust / freshness metadata (source, incomplete flag, unavailable tickers)
 *   loading            — true while fetching
 *   error              — error message string or null
 *   refetch            — manual re-trigger
 *
 * Architecture note:
 *   Weighted portfolio metrics (wtd_pe, wtd_pb, etc.) are now computed by the backend
 *   and returned in the `weighted` block of the /analytics/ratios response.
 *   The frontend no longer runs computeWeightedMetrics() — it consumes backend values directly.
 *   mergeWithFundamentals() is kept: it is a join operation (not financial math) and
 *   runs client-side without network cost.
 */

'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import type {
  Holding,
  FinancialRatio,
  WeightedFundamentals,
  HoldingWithFundamentals,
  FundamentalsMeta,
} from '@/types'
import { mergeWithFundamentals } from '@/lib/fundamentals'
import { analyticsApi } from '@/services/api'
import { useDataModeStore } from '@/store/dataModeStore'

export interface UseFundamentalsResult {
  enrichedHoldings:  HoldingWithFundamentals[]
  weightedMetrics:   WeightedFundamentals | null
  ratios:            FinancialRatio[]
  /** Trust / freshness metadata. Null until the first fetch completes. */
  meta:              FundamentalsMeta | null
  loading:           boolean
  error:             string | null
  refetch:           () => void
}

export function useFundamentals(holdings: Holding[]): UseFundamentalsResult {
  const { mode } = useDataModeStore()

  const [ratios,          setRatios]          = useState<FinancialRatio[]>([])
  const [weightedMetrics, setWeightedMetrics] = useState<WeightedFundamentals | null>(null)
  const [meta,            setMeta]            = useState<FundamentalsMeta | null>(null)
  const [loading,         setLoading]         = useState(true)
  const [error,           setError]           = useState<string | null>(null)

  const fetchRatios = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // Single call — backend returns per-holding ratios, weighted portfolio metrics,
      // and trust metadata in one bundled response.
      const data = await analyticsApi.getFinancialRatios(mode)
      setRatios(data.holdings)
      setWeightedMetrics(data.weighted)
      setMeta(data.meta)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load fundamentals')
      setRatios([])
      setWeightedMetrics(null)
      setMeta(null)
    } finally {
      setLoading(false)
    }
  }, [mode])

  useEffect(() => {
    fetchRatios()
  }, [fetchRatios])

  // Join holdings with their per-ticker fundamentals (client-side lookup, no network cost)
  const enrichedHoldings = useMemo(
    () => mergeWithFundamentals(holdings, ratios),
    [holdings, ratios]
  )

  return {
    enrichedHoldings,
    weightedMetrics,
    ratios,
    meta,
    loading,
    error,
    refetch: fetchRatios,
  }
}
