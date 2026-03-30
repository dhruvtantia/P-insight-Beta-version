/**
 * useProviderStatus Hook
 * -----------------------
 * Polls GET /api/v1/live/status to surface yfinance availability and cache health.
 *
 * Usage:
 *   const { status, loading, error } = useProviderStatus()
 *
 * Refreshes every 30 seconds automatically. Also exposes a manual `refetch`.
 * Designed for the /debug page — do not use on high-traffic pages.
 */

'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { liveApi } from '@/services/api'
import type { LiveProviderStatus } from '@/types'

const POLL_INTERVAL_MS = 30_000   // 30 seconds

interface UseProviderStatusReturn {
  status: LiveProviderStatus | null
  loading: boolean
  error: string | null
  refetch: () => void
  lastFetchedAt: Date | null
}

export function useProviderStatus(): UseProviderStatusReturn {
  const [status, setStatus]     = useState<LiveProviderStatus | null>(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(null)

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await liveApi.getProviderStatus()
      setStatus(data)
      setLastFetchedAt(new Date())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not fetch provider status')
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

  return { status, loading, error, refetch: fetch, lastFetchedAt }
}
