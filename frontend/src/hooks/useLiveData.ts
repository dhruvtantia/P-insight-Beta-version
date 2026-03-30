/**
 * useLiveData Hook
 * -----------------
 * Fetches live price quotes for a list of tickers when the app is in "live" mode.
 * Returns a price map that other components can use to show live vs mock indicators.
 *
 * Usage:
 *   const { prices, loading, error, yfinanceAvailable } = useLiveData(tickers)
 *
 * Architecture note:
 *   This hook is intentionally separate from usePortfolio.
 *   The main portfolio fetch always goes through the backend provider pipeline
 *   (which handles fallback gracefully). useLiveData is for supplemental UI
 *   enrichment — e.g. showing live price chips on the watchlist or a quote strip.
 *
 *   Do NOT use this to re-implement the portfolio pricing logic.
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import { liveApi } from '@/services/api'
import { useDataModeStore } from '@/store/dataModeStore'

interface UseLiveDataReturn {
  /** Map of ticker → last close price. Empty if mode is not 'live' or yfinance unavailable. */
  prices: Record<string, number>
  /** True only when mode='live' and a fetch is in-flight. */
  loading: boolean
  /** Non-null if the quote fetch failed entirely. Individual missing tickers are not errors. */
  error: string | null
  /** True if yfinance library is installed on the backend. */
  yfinanceAvailable: boolean
  /** Tickers that were requested but not found on Yahoo Finance. */
  missingTickers: string[]
  refetch: () => void
}

export function useLiveData(tickers: string[]): UseLiveDataReturn {
  const { mode, isLiveEnabled } = useDataModeStore()

  const [prices, setPrices]               = useState<Record<string, number>>({})
  const [loading, setLoading]             = useState(false)
  const [error, setError]                 = useState<string | null>(null)
  const [yfinanceAvailable, setYfAvail]  = useState(true)
  const [missingTickers, setMissing]      = useState<string[]>([])

  const shouldFetch = mode === 'live' && isLiveEnabled && tickers.length > 0

  const fetch = useCallback(async () => {
    if (!shouldFetch) {
      setPrices({})
      setMissing([])
      return
    }

    setLoading(true)
    setError(null)
    try {
      const data = await liveApi.getQuotes(tickers)
      setPrices(data.prices ?? {})
      setYfAvail(data.yfinance_available ?? true)
      setMissing(data.missing ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Live quote fetch failed')
      setPrices({})
    } finally {
      setLoading(false)
    }
  }, [shouldFetch, tickers.join(',')])   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetch()
  }, [fetch])

  return { prices, loading, error, yfinanceAvailable, missingTickers, refetch: fetch }
}
