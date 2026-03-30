/**
 * useQuantAnalytics Hook
 * -----------------------
 * Fetches the full quantitative analytics bundle from /api/v1/quant/full.
 * Re-fetches automatically when data mode or period changes.
 *
 * Returns all risk metrics, performance series, correlation matrix,
 * per-holding contributions, and drawdown series in a single call.
 *
 * Architecture:
 *   - One API call fetches everything (server computes all metrics together)
 *   - Results are cached server-side (24h mock / 10min live)
 *   - Client state: loading / error / data
 *   - No client-side computation — pure display hook
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import { quantApi } from '@/services/api'
import { useDataModeStore } from '@/store/dataModeStore'
import type { QuantFullResponse } from '@/types'

export type QuantPeriod = '1y' | '6mo' | '3mo'

interface UseQuantAnalyticsReturn {
  data:     QuantFullResponse | null
  loading:  boolean
  error:    string | null
  period:   QuantPeriod
  setPeriod: (p: QuantPeriod) => void
  refetch:  () => void
}

export function useQuantAnalytics(): UseQuantAnalyticsReturn {
  const { mode } = useDataModeStore()

  const [data, setData]       = useState<QuantFullResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [period, setPeriod]   = useState<QuantPeriod>('1y')

  const fetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await quantApi.getFull(mode, period)
      setData(result)
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Failed to load quantitative analytics. Check that the backend is running.'
      setError(message)
      console.error('[useQuantAnalytics] Fetch failed:', err)
    } finally {
      setLoading(false)
    }
  }, [mode, period])

  useEffect(() => {
    fetch()
  }, [fetch])

  return { data, loading, error, period, setPeriod, refetch: fetch }
}
