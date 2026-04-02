/**
 * useIndices
 * -----------
 * Fetches NIFTY 50 and SENSEX live prices + change from GET /api/v1/live/indices.
 *
 * - Polls every 60 seconds (matches the server-side price cache TTL).
 * - On mount, fetches immediately.
 * - If the backend is unreachable or yfinance is unavailable, `unavailable` will
 *   be true on the individual IndexQuote objects. The hook exposes this as-is
 *   so the UI can render an explicit unavailable state rather than zeros.
 * - No mock fallback — live mode shows real data or an explicit unavailable state.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { liveApi } from '@/services/api'
import type { IndexQuote } from '@/types'

const POLL_INTERVAL_MS = 60_000   // 60 seconds — matches server price cache TTL

export interface UseIndicesResult {
  indices:  IndexQuote[]
  loading:  boolean
  error:    string | null
  lastFetchAt: Date | null
}

export function useIndices(): UseIndicesResult {
  const [indices,     setIndices]     = useState<IndexQuote[]>([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState<string | null>(null)
  const [lastFetchAt, setLastFetchAt] = useState<Date | null>(null)

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetch = useCallback(async () => {
    try {
      const res = await liveApi.getIndices()
      setIndices(res.indices ?? [])
      setError(null)
      setLastFetchAt(new Date())
    } catch (e) {
      // Backend unreachable — surface as unavailable entries, not a crash
      setError(e instanceof Error ? e.message : 'Fetch failed')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetch()
    intervalRef.current = setInterval(fetch, POLL_INTERVAL_MS)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [fetch])

  return { indices, loading, error, lastFetchAt }
}
