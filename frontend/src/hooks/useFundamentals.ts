/**
 * useFundamentals — fetches per-ticker financial ratios and derives weighted metrics
 * -----------------------------------------------------------------------------------
 *
 * Accepts holdings from the parent's usePortfolio() call — does NOT re-fetch the
 * portfolio itself. This avoids any duplicate API calls.
 *
 * Returns:
 *   enrichedHoldings   — Holding[] joined with FinancialRatio (null if not found)
 *   weightedMetrics    — portfolio-level weighted-average fundamentals
 *   ratios             — raw per-ticker ratios array (for FundamentalsTable)
 *   loading            — true while fetching
 *   error              — error message string or null
 *   refetch            — manual re-trigger
 */

'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import type { Holding, FinancialRatio, WeightedFundamentals, HoldingWithFundamentals } from '@/types'
import { mergeWithFundamentals, computeWeightedMetrics } from '@/lib/fundamentals'
import { analyticsApi } from '@/services/api'
import { useDataModeStore } from '@/store/dataModeStore'

interface UseFundamentalsResult {
  enrichedHoldings:  HoldingWithFundamentals[]
  weightedMetrics:   WeightedFundamentals | null
  ratios:            FinancialRatio[]
  loading:           boolean
  error:             string | null
  refetch:           () => void
}

export function useFundamentals(holdings: Holding[]): UseFundamentalsResult {
  const { mode } = useDataModeStore()

  const [ratios,   setRatios]   = useState<FinancialRatio[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)

  const fetchRatios = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await analyticsApi.getFinancialRatios(mode)
      setRatios(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load fundamentals')
      setRatios([])
    } finally {
      setLoading(false)
    }
  }, [mode])

  useEffect(() => {
    fetchRatios()
  }, [fetchRatios])

  const enrichedHoldings = useMemo(
    () => mergeWithFundamentals(holdings, ratios),
    [holdings, ratios]
  )

  const weightedMetrics = useMemo(
    () => computeWeightedMetrics(enrichedHoldings),
    [enrichedHoldings]
  )

  return {
    enrichedHoldings,
    weightedMetrics,
    ratios,
    loading,
    error,
    refetch: fetchRatios,
  }
}
