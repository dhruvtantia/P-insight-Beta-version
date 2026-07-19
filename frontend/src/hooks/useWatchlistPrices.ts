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
import type { Holding } from '@/types'

const REFRESH_INTERVAL_MS = 60_000   // 60 s — matches server-side cache TTL

export type WatchlistQuoteHealth = 'idle' | 'loading' | 'ready' | 'partial' | 'failed' | 'unavailable'

export interface UseWatchlistPricesReturn {
  prices:             Record<string, number>   // ticker → last successful price
  loading:            boolean
  error:              string | null
  missingTickers:     string[]
  statusByTicker:     Record<string, Holding['price_status']>
  priceTimestamps:    Record<string, string>
  lastFetchAt:        Date | null
  yfinanceAvailable:  boolean
  quoteHealth:        WatchlistQuoteHealth
  isDegraded:         boolean
  isUnavailable:      boolean
  refetch:            () => void
}

export function useWatchlistPrices(tickers: string[]): UseWatchlistPricesReturn {
  const [prices, setPrices]                    = useState<Record<string, number>>({})
  const [loading, setLoading]                  = useState(false)
  const [error, setError]                      = useState<string | null>(null)
  const [missingTickers, setMissingTickers]    = useState<string[]>([])
  const [statusByTicker, setStatusByTicker]    = useState<Record<string, Holding['price_status']>>({})
  const [priceTimestamps, setPriceTimestamps]  = useState<Record<string, string>>({})
  const [lastFetchAt, setLastFetch]            = useState<Date | null>(null)
  const [yfAvail, setYfAvail]                  = useState(true)
  const [quoteHealth, setQuoteHealth]          = useState<WatchlistQuoteHealth>('idle')

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchPrices = useCallback(async () => {
    if (tickers.length === 0) {
      setPrices({})
      setError(null)
      setMissingTickers([])
      setStatusByTicker({})
      setPriceTimestamps({})
      setLastFetch(null)
      setQuoteHealth('idle')
      setLoading(false)
      return
    }

    setLoading(true)
    setQuoteHealth('loading')
    try {
      const data = await liveApi.getQuotes(tickers)
      const nextPrices = data.prices ?? {}
      const nextMissing = data.missing ?? []
      const nextStatusByTicker = data.status_by_ticker ?? {}
      const yfinanceAvailable = data.yfinance_available ?? true
      const hasNonLiveStatus = tickers.some((ticker) => {
        const status = nextStatusByTicker[ticker.toUpperCase()]
        return status !== undefined && status !== 'live'
      })

      setPrices(nextPrices)
      setYfAvail(yfinanceAvailable)
      setMissingTickers(nextMissing)
      setStatusByTicker(nextStatusByTicker)
      setPriceTimestamps(data.price_timestamps ?? {})
      setLastFetch(new Date())
      setError(null)

      if (!yfinanceAvailable) {
        setQuoteHealth('unavailable')
      } else if (data.timed_out) {
        setQuoteHealth('failed')
      } else if (nextMissing.length > 0 || hasNonLiveStatus) {
        setQuoteHealth('partial')
      } else {
        setQuoteHealth('ready')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Live watchlist prices could not be refreshed')
      setYfAvail(true)
      setMissingTickers(tickers.map((ticker) => ticker.toUpperCase()))
      setStatusByTicker(
        Object.fromEntries(
          tickers.map((ticker) => [ticker.toUpperCase(), 'provider_failed' as Holding['price_status']]),
        ),
      )
      setPriceTimestamps({})
      setQuoteHealth('failed')
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

  const isDegraded = quoteHealth === 'partial' || quoteHealth === 'failed' || quoteHealth === 'unavailable'
  const isUnavailable = quoteHealth === 'failed' || quoteHealth === 'unavailable'

  return {
    prices,
    loading,
    error,
    missingTickers,
    statusByTicker,
    priceTimestamps,
    lastFetchAt,
    yfinanceAvailable: yfAvail,
    quoteHealth,
    isDegraded,
    isUnavailable,
    refetch: fetchPrices,
  }
}
