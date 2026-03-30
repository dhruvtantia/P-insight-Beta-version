/**
 * useWatchlist — data + mutation layer for the watchlist feature
 * ---------------------------------------------------------------
 * All API calls for the watchlist go through this hook.
 * Components stay pure — they receive data + callback props only.
 *
 * Returns:
 *   items         — current watchlist items (sorted added_at DESC)
 *   loading       — initial fetch in progress
 *   error         — error string or null
 *   addItem()     — POST new item; throws on duplicate (409)
 *   removeItem()  — DELETE by ticker (optimistic local update)
 *   refetch()     — manual reload
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import { watchlistApi }   from '@/services/api'
import type { WatchlistItem, WatchlistItemInput } from '@/types'

interface UseWatchlistReturn {
  items:       WatchlistItem[]
  loading:     boolean
  error:       string | null
  addItem:     (payload: WatchlistItemInput) => Promise<void>
  removeItem:  (ticker: string) => Promise<void>
  refetch:     () => void
  clearError:  () => void
}

export function useWatchlist(): UseWatchlistReturn {
  const [items,   setItems]   = useState<WatchlistItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await watchlistApi.getWatchlist()
      setItems(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load watchlist')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  const addItem = useCallback(async (payload: WatchlistItemInput) => {
    setError(null)
    // Normalise ticker to uppercase before sending
    const normalised: WatchlistItemInput = {
      ...payload,
      ticker: payload.ticker.trim().toUpperCase(),
    }
    const newItem = await watchlistApi.addToWatchlist(normalised)
    // Prepend to local state (API returns sorted desc; newest first)
    setItems((prev) => [newItem, ...prev])
  }, [])

  const removeItem = useCallback(async (ticker: string) => {
    // Optimistic update — remove from UI immediately
    setItems((prev) => prev.filter((i) => i.ticker !== ticker))
    try {
      await watchlistApi.removeFromWatchlist(ticker)
    } catch (err) {
      // Rollback on failure
      setError(err instanceof Error ? err.message : 'Remove failed')
      fetchAll()
    }
  }, [fetchAll])

  return {
    items,
    loading,
    error,
    addItem,
    removeItem,
    refetch: fetchAll,
    clearError: () => setError(null),
  }
}
