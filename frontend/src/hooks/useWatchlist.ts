/**
 * useWatchlist — data + mutation layer for the watchlist feature
 * ---------------------------------------------------------------
 * All API calls for the watchlist go through this hook.
 * Components stay pure — they receive data + callback props only.
 *
 * Returns:
 *   items         — current watchlist items (sorted added_at DESC)
 *   loading       — initial fetch in progress (false if cache hit)
 *   error         — error string or null
 *   addItem()     — POST new item; throws on duplicate (409)
 *   removeItem()  — DELETE by ticker (optimistic local update)
 *   refetch()     — manual reload
 *
 * State persistence:
 *   Module-level _itemCache survives re-mounts (page navigation) within the
 *   same session. When you navigate away from /watchlist and back, the cached
 *   items render immediately — no loading flash — while a background re-fetch
 *   still runs to pick up any server-side changes.
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import { watchlistApi }   from '@/services/api'
import type { WatchlistItem, WatchlistItemInput } from '@/types'

// Module-level cache — survives re-mounts within the same JS session.
// null = never fetched; [] = fetched and empty; [...] = fetched with items.
let _itemCache: WatchlistItem[] | null = null

type WatchlistUpdatePayload = Partial<Pick<WatchlistItemInput, 'name' | 'tag' | 'sector' | 'target_price' | 'notes'>>

interface UseWatchlistReturn {
  items:       WatchlistItem[]
  loading:     boolean
  error:       string | null
  addItem:     (payload: WatchlistItemInput) => Promise<void>
  updateItem:  (ticker: string, updates: WatchlistUpdatePayload) => Promise<void>
  removeItem:  (ticker: string) => Promise<void>
  refetch:     () => void
  clearError:  () => void
}

export function useWatchlist(): UseWatchlistReturn {
  // Initialise from cache so re-navigation renders immediately with known items
  const [items,   setItems]   = useState<WatchlistItem[]>(_itemCache ?? [])
  // Only show the spinner on the very first load (no cache yet)
  const [loading, setLoading] = useState(_itemCache === null)
  const [error,   setError]   = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    // If we already have a cache, don't show the global spinner — update silently
    if (_itemCache === null) setLoading(true)
    setError(null)
    try {
      const data = await watchlistApi.getWatchlist()
      _itemCache = data          // update module-level cache
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
    const normalised: WatchlistItemInput = {
      ...payload,
      ticker: payload.ticker.trim().toUpperCase(),
    }
    const newItem = await watchlistApi.addToWatchlist(normalised)
    // Prepend to local state and update cache
    setItems((prev) => {
      const updated = [newItem, ...prev]
      _itemCache = updated
      return updated
    })
  }, [])

  const updateItem = useCallback(async (ticker: string, updates: WatchlistUpdatePayload) => {
    // Optimistic update — apply changes to cache and state immediately
    setItems((prev) => {
      const updated = prev.map((i) =>
        i.ticker === ticker ? { ...i, ...updates } : i
      )
      _itemCache = updated
      return updated
    })
    try {
      const updatedItem = await watchlistApi.updateWatchlistItem(ticker, updates)
      // Reconcile with server response (in case server normalised anything)
      setItems((prev) => {
        const reconciled = prev.map((i) => (i.ticker === ticker ? updatedItem : i))
        _itemCache = reconciled
        return reconciled
      })
    } catch (err) {
      // Rollback on failure
      setError(err instanceof Error ? err.message : 'Update failed')
      fetchAll()
    }
  }, [fetchAll])

  const removeItem = useCallback(async (ticker: string) => {
    // Optimistic update — remove from UI and cache immediately
    setItems((prev) => {
      const updated = prev.filter((i) => i.ticker !== ticker)
      _itemCache = updated
      return updated
    })
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
    updateItem,
    removeItem,
    refetch: fetchAll,
    clearError: () => setError(null),
  }
}
