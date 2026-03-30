/**
 * useDelta Hook
 * --------------
 * Fetches and caches the delta between two snapshots.
 * The result is cached by the (a, b) pair in a module-level Map so
 * multiple components referencing the same comparison don't re-fetch.
 *
 * Usage:
 *   const { delta, loading, error } = useDelta(snapAId, snapBId)
 */

'use client'

import { useState, useEffect, useRef } from 'react'
import { snapshotApi } from '@/services/api'
import type { PortfolioDelta } from '@/types'

// ─── Module-level cache (survives component re-mounts) ───────────────────────

const _cache = new Map<string, PortfolioDelta>()

function cacheKey(a: number, b: number): string {
  return `${Math.min(a, b)}-${Math.max(a, b)}`
}

export interface UseDeltaReturn {
  delta:    PortfolioDelta | null
  loading:  boolean
  error:    string | null
  refetch:  () => void
}

export function useDelta(
  snapshotAId: number | null,
  snapshotBId: number | null,
): UseDeltaReturn {
  const [delta,   setDelta]   = useState<PortfolioDelta | null>(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const fetch = async (a: number, b: number) => {
    const key = cacheKey(a, b)
    const cached = _cache.get(key)
    if (cached) {
      setDelta(cached)
      setLoading(false)
      return
    }

    // Cancel any in-flight request for a previous pair
    abortRef.current?.abort()
    abortRef.current = new AbortController()

    setLoading(true)
    setError(null)
    try {
      // Always compare oldest → newest so the delta is "what improved"
      const older = Math.min(a, b)
      const newer = Math.max(a, b)
      const result = await snapshotApi.getDelta(older, newer)
      _cache.set(key, result)
      setDelta(result)
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return
      const msg = err instanceof Error ? err.message : 'Failed to compute delta'
      setError(msg)
      console.error('[useDelta] fetch failed:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (snapshotAId === null || snapshotBId === null || snapshotAId === snapshotBId) {
      setDelta(null)
      return
    }
    fetch(snapshotAId, snapshotBId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshotAId, snapshotBId])

  const refetch = () => {
    if (snapshotAId === null || snapshotBId === null) return
    const key = cacheKey(snapshotAId, snapshotBId)
    _cache.delete(key)
    fetch(snapshotAId, snapshotBId)
  }

  return { delta, loading, error, refetch }
}

/** Clear the entire delta cache (e.g. after creating a new snapshot) */
export function clearDeltaCache(): void {
  _cache.clear()
}
