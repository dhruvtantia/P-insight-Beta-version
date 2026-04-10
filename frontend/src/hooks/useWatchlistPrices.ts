/**
 * useWatchlistPrices
 * -------------------
 * Fetches live prices for watchlist tickers directly from /api/v1/live/quotes.
 * Operates independently of the data mode — prices are always attempted when
 * yfinance is available, even in "uploaded" mode.
 *
 * Auto-refreshes every 60 seconds to keep prices current.
 * Returns the timestamp of the last successful update.
 */

'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { liveApi } from '@/services/api'

const REFRESH_INTERVAL_MS = 60_000   // 60 s — matches server-side cache TTL

interface UseWatchlistPricesReturn {
  prices:    Record<string, number>   // ticker → last price
  loading:   boolean
  lastFetchAt: Date | null
  yfinanceAvailable: boolean
}

export function useWatchlistPrices(tickers: string[]): UseWatchlistPricesReturn {
  const [prices, setPrices]          = useState<Record<string, number>>({})
  const [loading, setLoading]        = useState(false)
  const [lastFetchAt, setLastFetch]  = useState<Date | null>(null)
  const [yfAvail, setYfAvail]        = useState(true)

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchPrices = useCallback(async () => {
    if (tickers.length === 0) {
      setPrices({})
      return
    }
    setLoading(true)
    try {
      const data = await liveApi.getQuotes(tickers)
      setPrices(data.prices ?? {})
      setYfAvail(data.yfinance_available ?? true)
      setLastFetch(new Date())
    } catch {
      // Silently swallow — prices are supplemental; don't crash the watchlist
    } finally {
      setLoading(false)
    }
  }, [tickers.join(',')])   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchPrices()
    intervalRef.current = setInterval(fetchPrices, REFRESH_INTERVAL_MS)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [fetchPrices])

  return { prices, loading, lastFetchAt, yfinanceAvailable: yfAvail }
}
