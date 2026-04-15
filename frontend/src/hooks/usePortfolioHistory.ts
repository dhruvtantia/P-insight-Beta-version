/**
 * usePortfolioHistory
 * --------------------
 * Fetches the pre-computed daily portfolio value time series for the active
 * (or specified) portfolio from GET /portfolios/{id}/history.
 *
 * The data is built once at upload time (background task) and reused everywhere.
 * If no data has been built yet, `hasData` is false and `points` is empty —
 * not an error state; the Changes page falls back to snapshot-based chart.
 *
 * Also fetches benchmark data (^NSEI) so the Changes page can show an overlay.
 *
 * Build status:
 *   buildStatus — 'pending' | 'building' | 'done' | 'failed' | 'unknown' | null
 *   Use this to show a "Building history…" banner while data is being computed.
 *   When status is 'pending'/'building' and hasData is false, the chart should
 *   show the banner rather than the generic empty state.
 */

import { useState, useEffect, useCallback } from 'react'
import { historyApi }                       from '@/services/api'
import type {
  PortfolioHistoryPoint,
  BenchmarkPoint,
  PortfolioHistoryResponse,
} from '@/types'

interface UsePortfolioHistoryResult {
  /** Daily portfolio value points, sorted oldest → newest. */
  points:        PortfolioHistoryPoint[]
  /** Daily benchmark close prices (^NSEI), sorted oldest → newest. */
  benchmark:     BenchmarkPoint[]
  /** True if at least some history data has been built. */
  hasData:       boolean
  /** Honest label for the chart — not a "missing data" warning, just context. */
  note:          string | null
  earliest:      string | null
  latest:        string | null
  loading:       boolean
  error:         string | null
  /**
   * History build status from the background task.
   * 'pending'  — upload done, task queued but not yet started
   * 'building' — task is actively fetching and storing data
   * 'done'     — complete; rows are in the portfolio_history table
   * 'failed'   — build encountered an error
   * 'unknown'  — server restarted; check hasData for existing rows
   * null       — not yet fetched
   */
  buildStatus:   'pending' | 'building' | 'done' | 'failed' | 'unknown' | null
  buildNote:     string | null
  /** Manually re-fetch (e.g. after taking a new snapshot). */
  refetch:       () => void
}

export function usePortfolioHistory(
  portfolioId: number | null,
): UsePortfolioHistoryResult {
  const [response,  setResponse]  = useState<PortfolioHistoryResponse | null>(null)
  const [benchmark, setBenchmark] = useState<BenchmarkPoint[]>([])
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    if (portfolioId == null) {
      setResponse(null)
      setBenchmark([])
      return
    }

    setLoading(true)
    setError(null)

    try {
      // Fetch both in parallel
      const [histRes, benchRes] = await Promise.allSettled([
        historyApi.getPortfolioHistory(portfolioId),
        historyApi.getBenchmarkHistory(portfolioId),
      ])

      if (histRes.status === 'fulfilled') {
        setResponse(histRes.value)
      } else {
        // Not fatal — fall back to snapshot-based chart
        setError(null)           // clear any stale error
        setResponse(null)
      }

      if (benchRes.status === 'fulfilled') {
        setBenchmark(benchRes.value)
      }
      // Benchmark fetch failure is silently ignored
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load portfolio history')
    } finally {
      setLoading(false)
    }
  }, [portfolioId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return {
    points:      response?.points        ?? [],
    benchmark,
    hasData:     response?.has_data      ?? false,
    note:        response?.note          ?? null,
    earliest:    response?.earliest_date ?? null,
    latest:      response?.latest_date   ?? null,
    loading,
    error,
    buildStatus: response?.build_status  ?? null,
    buildNote:   response?.build_note    ?? null,
    refetch:     fetchData,
  }
}
