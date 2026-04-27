/**
 * usePortfolioHistory
 * --------------------
 * Fetches the pre-computed daily portfolio value time series for the active
 * (or specified) portfolio from the canonical GET /history/{id}/daily endpoint.
 *
 * Also fetches benchmark data (^NSEI) in parallel so the Changes page can
 * show a performance overlay.
 *
 * Build status:
 *   - Derived from the canonical /history/{id}/status endpoint.
 *   - While state='building', this hook polls every 5 s until data arrives
 *     or the state becomes 'complete'/'failed'/'not_started'.
 *   - Polling stops automatically once a terminal state is reached.
 *
 * State machine:
 *   building     → poll every 5 s; show "Building…" banner
 *   complete     → data in points[]; stop polling
 *   failed       → empty points; show error note; stop polling
 *   not_started  → empty points; no banner (never built)
 *   null         → initial loading
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { historyApi }                                from '@/services/api'
import type { BenchmarkPoint }                       from '@/types'
import type { HistoryStatusResponse, HistoryDailyResponse } from '@/services/api'

// How often to poll when state is 'building' (ms)
const POLL_INTERVAL_MS = 5_000

interface UsePortfolioHistoryResult {
  /** Daily portfolio value points, sorted oldest → newest. */
  points:        { date: string; total_value: number }[]
  /** Daily benchmark close prices (^NSEI), sorted oldest → newest. */
  benchmark:     BenchmarkPoint[]
  /** True if at least some history data has been built. */
  hasData:       boolean
  /** Honest label for the chart — context note, not an error. */
  note:          string | null
  earliest:      string | null
  latest:        string | null
  loading:       boolean
  error:         string | null
  /**
   * Discriminated history state from canonical endpoint.
   * 'building'    — task actively running; poll continues
   * 'complete'    — points[] has real data
   * 'failed'      — build errored; won't retry without re-upload
   * 'not_started' — never triggered (no upload yet)
   * null          — not yet fetched
   */
  buildStatus:   'building' | 'complete' | 'failed' | 'not_started' | null
  buildNote:     string | null
  /** Manually re-fetch (e.g. after taking a new snapshot). */
  refetch:       () => void
}

export function usePortfolioHistory(
  portfolioId: number | null,
): UsePortfolioHistoryResult {
  const [daily,     setDaily]     = useState<HistoryDailyResponse | null>(null)
  const [benchmark, setBenchmark] = useState<BenchmarkPoint[]>([])
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState<string | null>(null)

  // Track whether we're polling to avoid double-scheduling
  const pollingRef  = useRef<ReturnType<typeof setInterval> | null>(null)
  const mountedRef  = useRef(true)

  const stopPolling = useCallback(() => {
    if (pollingRef.current != null) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }
  }, [])

  const fetchData = useCallback(async (isBackground = false) => {
    if (portfolioId == null) {
      setDaily(null)
      setBenchmark([])
      return
    }

    if (!isBackground) {
      setLoading(true)
      setError(null)
    }

    try {
      // Fetch daily data + benchmark in parallel
      const [dailyRes, benchRes] = await Promise.allSettled([
        historyApi.getDaily(portfolioId),
        historyApi.getBenchmarkHistory(portfolioId),
      ])

      if (!mountedRef.current) return

      if (dailyRes.status === 'fulfilled') {
        setDaily(dailyRes.value)

        // Stop polling once we're in a terminal state
        const terminalStates = ['complete', 'failed', 'not_started']
        if (terminalStates.includes(dailyRes.value.state)) {
          stopPolling()
        }
      } else {
        // Non-fatal — clear data but don't blank benchmark
        setError(null)
        setDaily(null)
        stopPolling()
      }

      if (benchRes.status === 'fulfilled') {
        setBenchmark(benchRes.value)
      }
      // Benchmark fetch failure is silently ignored
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to load portfolio history')
        stopPolling()
      }
    } finally {
      if (!isBackground && mountedRef.current) {
        setLoading(false)
      }
    }
  }, [portfolioId, stopPolling])

  // On portfolioId change: fetch fresh, then set up polling if needed
  useEffect(() => {
    mountedRef.current = true
    stopPolling()
    setDaily(null)
    setBenchmark([])
    setError(null)

    fetchData(false).then(() => {
      // After initial fetch, if state is 'building', start background polling
      // We read the state from the setter to get the most recent value
      setDaily(prev => {
        if (prev?.state === 'building' && pollingRef.current == null) {
          pollingRef.current = setInterval(() => {
            fetchData(true)
          }, POLL_INTERVAL_MS)
        }
        return prev
      })
    })

    return () => {
      mountedRef.current = false
      stopPolling()
    }
  }, [portfolioId]) // eslint-disable-line react-hooks/exhaustive-deps
  // intentionally not including fetchData/stopPolling — they are stable callbacks
  // but adding them would re-run this effect on every render

  // Whenever daily state transitions to building, ensure polling is active
  useEffect(() => {
    if (daily?.state === 'building' && pollingRef.current == null && portfolioId != null) {
      pollingRef.current = setInterval(() => {
        fetchData(true)
      }, POLL_INTERVAL_MS)
    }
  }, [daily?.state, portfolioId, fetchData])

  // Map canonical state to the buildStatus name used by the Changes page
  const buildStatus = daily == null
    ? null
    : (daily.state as 'building' | 'complete' | 'failed' | 'not_started')

  return {
    points:      daily?.points        ?? [],
    benchmark,
    hasData:     daily?.has_data      ?? false,
    note:        daily?.note          ?? null,
    earliest:    daily?.earliest_date ?? null,
    latest:      daily?.latest_date   ?? null,
    loading,
    error,
    buildStatus,
    buildNote:   daily?.note          ?? null,
    refetch:     () => fetchData(false),
  }
}
