'use client'

/**
 * usePeerComparison — fetches peer comparison data for a given ticker.
 *
 * Returns the selected stock's full fundamentals plus each industry peer's
 * fundamentals so the UI can render a side-by-side comparison table.
 *
 * Usage:
 *   const { data, loading, error, refetch } = usePeerComparison(ticker, mode)
 *
 * Architecture notes for Phase 2:
 *   - Swap MockDataProvider with a live provider; hook API is unchanged.
 *   - Add a `staleSecs` option to re-fetch on a timer (background enrichment).
 */

import { useState, useEffect, useCallback } from 'react'
import { peersApi }                          from '@/services/api'
import { useDataModeStore }                  from '@/store/dataModeStore'
import type { PeerComparisonData }           from '@/types'

interface UsePeerComparisonResult {
  data:    PeerComparisonData | null
  loading: boolean
  error:   string | null
  refetch: () => void
}

export function usePeerComparison(ticker: string | null): UsePeerComparisonResult {
  const mode = useDataModeStore((s) => s.mode)

  const [data,    setData]    = useState<PeerComparisonData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    if (!ticker) {
      setData(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const result = await peersApi.getPeers(ticker, mode)
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load peer data.')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [ticker, mode])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return { data, loading, error, refetch: fetchData }
}
