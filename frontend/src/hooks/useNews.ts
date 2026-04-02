'use client'

/**
 * useNews — fetches portfolio news and upcoming events from the backend.
 *
 * Accepts optional filters:
 *   tickers   — only articles/events matching these tickers (default: all holdings)
 *   eventType — narrow by event category (earnings, dividend, deal, …)
 *
 * Returns:
 *   articles       — filtered news articles, newest-first
 *   events         — upcoming corporate events, soonest-first
 *   loading        — true while fetching
 *   error          — error message string or null
 *   refetch        — trigger a fresh fetch
 *
 * Phase 2 extension point:
 *   Swap newsApi with a live provider hook; the component API stays unchanged.
 */

import { useState, useEffect, useCallback } from 'react'
import { newsApi }                           from '@/services/api'
import { useDataModeStore }                  from '@/store/dataModeStore'
import type { NewsArticle, CorporateEvent, NewsEventType } from '@/types'

export interface NewsFilters {
  tickers?:   string[]
  eventType?: NewsEventType
}

interface UseNewsResult {
  articles:        NewsArticle[]
  events:          CorporateEvent[]
  loading:         boolean
  error:           string | null
  refetch:         () => void
  /** True when backend is in live mode and no news API is configured */
  liveUnavailable: boolean
}

export function useNews(filters?: NewsFilters): UseNewsResult {
  const mode = useDataModeStore((s) => s.mode)

  const [articles,        setArticles]        = useState<NewsArticle[]>([])
  const [events,          setEvents]          = useState<CorporateEvent[]>([])
  const [loading,         setLoading]         = useState(true)
  const [error,           setError]           = useState<string | null>(null)
  const [liveUnavailable, setLiveUnavailable] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [newsRes, eventsRes] = await Promise.all([
        newsApi.getNews(mode, {
          tickers:   filters?.tickers,
          eventType: filters?.eventType,
        }),
        newsApi.getEvents(mode, {
          tickers: filters?.tickers,
        }),
      ])
      setArticles(newsRes.articles)
      setEvents(eventsRes.events)
      // Signal the UI when no news is available (any mode — key missing or API failed).
      // news_unavailable covers all modes; live_unavailable is legacy (live mode only).
      setLiveUnavailable(
        !!(newsRes.news_unavailable ?? newsRes.live_unavailable)
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load news.')
    } finally {
      setLoading(false)
    }
  }, [mode, filters?.tickers?.join(','), filters?.eventType]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return { articles, events, loading, error, refetch: fetchData, liveUnavailable }
}
