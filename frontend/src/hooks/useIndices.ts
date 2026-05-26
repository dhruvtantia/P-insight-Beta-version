/**
 * useIndices
 * -----------
 * Fetches NIFTY 50, SENSEX, and BANK NIFTY from GET /api/v1/market/overview
 * and returns them as IndexQuote[].
 *
 * SOURCE CHANGE (2026-04-12):
 *   Previously called GET /api/v1/live/indices which used LiveAPIProvider
 *   (opens a DB session → OperationalError) and was subject to thread-startup
 *   failures under load.  The market/overview endpoint is DB-free, uses
 *   per-symbol yfinance calls with timeout guards, and has a 2-minute
 *   server-side cache.
 *
 * Stale-while-revalidate safety:
 *   On a failed refresh, the last successful data is kept visible.
 *   A full unavailable state is only shown if there has NEVER been a
 *   successful fetch.  This prevents the topbar from blanking on
 *   transient network errors.
 *
 * Poll interval: 120 seconds — matches the server-side cache TTL.
 *   Polling faster than 120s is pointless (same cached data is returned).
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { marketApi } from '@/services/api'
import { resolveFeatureRequestStatus, type FeatureRequestStatus } from '@/hooks/featureRequestStatus'
import type { IndexQuote } from '@/types'

const POLL_INTERVAL_MS = 120_000   // 2 minutes — matches server-side cache TTL

// Symbols from main_indices we want in the topbar (all three main indices)
const TOPBAR_SYMBOLS = new Set(['^NSEI', '^BSESN', '^NSEBANK'])

export interface UseIndicesResult {
  indices:     IndexQuote[]
  loading:     boolean
  error:       string | null
  /** True if the data being shown is from a previous successful fetch (stale) */
  stale:       boolean
  status:      FeatureRequestStatus
  lastFetchAt: Date | null
}

export function useIndices(): UseIndicesResult {
  const [indices,     setIndices]     = useState<IndexQuote[]>([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState<string | null>(null)
  const [stale,       setStale]       = useState(false)
  const [lastFetchAt, setLastFetchAt] = useState<Date | null>(null)

  // Keep a ref to the last known-good data so we can restore it on failure
  const lastGoodRef = useRef<IndexQuote[]>([])

  const fetchIndices = useCallback(async () => {
    try {
      const data = await marketApi.getOverview()

      // Extract main_indices from the market overview response
      // Each entry already has: symbol, name, value, change, change_pct,
      // unavailable, reason, status, data_date, last_updated
      const rawMain: IndexQuote[] = data.main_indices ?? []
      const topbar: IndexQuote[] = rawMain
        .filter((e) => TOPBAR_SYMBOLS.has(e.symbol))
        .map((e) => ({
          symbol:      e.symbol,
          name:        e.name,
          value:       e.value,
          change:      e.change,
          change_pct:  e.change_pct,
          unavailable: e.unavailable ?? (e.status === 'unavailable'),
          reason:      e.reason,
          status:      e.status,
          data_date:   e.data_date,
          last_updated: e.last_updated,
        }))

      // Successful fetch — update state and last-good cache
      setIndices(topbar)
      setError(null)
      setStale(false)
      setLastFetchAt(data.fetched_at ? new Date(data.fetched_at) : new Date())
      lastGoodRef.current = topbar

    } catch (e) {
      const msg = e instanceof Error
        ? (e.name === 'AbortError' ? 'Request timed out' : e.message)
        : 'Fetch failed'

      // ── Stale-while-revalidate ─────────────────────────────────────────────
      // If we have prior data, keep it visible and mark it stale.
      // Only surface a full error if there's nothing to show.
      if (lastGoodRef.current.length > 0) {
        setIndices(lastGoodRef.current)
        setStale(true)
        setError(null)   // don't surface error when we have stale data
      } else {
        setError(msg)
      }

    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchIndices()
    const interval = setInterval(fetchIndices, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [fetchIndices])

  const status = resolveFeatureRequestStatus({
    loading,
    error,
    stale,
    hasData: indices.length > 0,
  })

  return { indices, loading, error, stale, status, lastFetchAt }
}
