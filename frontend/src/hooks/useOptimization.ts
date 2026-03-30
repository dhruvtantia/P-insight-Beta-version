/**
 * useOptimization Hook
 * ---------------------
 * Fetches the full portfolio optimization result from /api/v1/optimization/full.
 * Re-fetches automatically when data mode, period, or method options change.
 *
 * Returns:
 *   - data:      OptimizationFullResponse | null
 *   - loading:   boolean
 *   - error:     string | null
 *   - period:    current period selection
 *   - erMethod:  expected returns method
 *   - covMethod: covariance method
 *   - setters for each option
 *   - refetch:   manual refresh
 *
 * Architecture:
 *   - Single API call (server computes everything together)
 *   - Server-side cache: 24h mock / 10min live
 *   - No client-side math — pure display hook
 *   - Optimization inputs (expected_returns, cov diagonal) accessible for debug
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import { optimizationApi } from '@/services/api'
import type { OptPeriod, ErMethod, CovMethod } from '@/services/api'
import { useDataModeStore } from '@/store/dataModeStore'
import type { OptimizationFullResponse } from '@/types'

export type { OptPeriod, ErMethod, CovMethod }

interface UseOptimizationReturn {
  data:         OptimizationFullResponse | null
  loading:      boolean
  error:        string | null
  period:       OptPeriod
  erMethod:     ErMethod
  covMethod:    CovMethod
  setPeriod:    (p: OptPeriod)    => void
  setErMethod:  (m: ErMethod)     => void
  setCovMethod: (m: CovMethod)    => void
  refetch:      () => void
}

export function useOptimization(): UseOptimizationReturn {
  const { mode } = useDataModeStore()

  const [data,      setData]      = useState<OptimizationFullResponse | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState<string | null>(null)
  const [period,    setPeriod]    = useState<OptPeriod>('1y')
  const [erMethod,  setErMethod]  = useState<ErMethod>('historical_mean')
  const [covMethod, setCovMethod] = useState<CovMethod>('auto')

  const fetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await optimizationApi.getFull(mode, period, erMethod, covMethod)
      setData(result)
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Failed to load optimization data. Check that the backend is running.'
      setError(message)
      console.error('[useOptimization] Fetch failed:', err)
    } finally {
      setLoading(false)
    }
  }, [mode, period, erMethod, covMethod])

  useEffect(() => {
    fetch()
  }, [fetch])

  return {
    data,
    loading,
    error,
    period,
    erMethod,
    covMethod,
    setPeriod,
    setErMethod,
    setCovMethod,
    refetch: fetch,
  }
}
