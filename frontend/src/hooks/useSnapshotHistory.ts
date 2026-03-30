/**
 * useSnapshotHistory
 * ------------------
 * Extends useSnapshots by lazily fetching SnapshotDetail for each snapshot
 * in the background (up to DETAIL_LIMIT most-recent), enabling history charts.
 *
 * Returns:
 *   summaries   — sorted oldest→newest SnapshotSummary[]
 *   details     — Map<id, SnapshotDetail> (populated progressively)
 *   detailsLoading — true while background fetches are in flight
 */

'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { snapshotApi } from '@/services/api'
import type { SnapshotSummary, SnapshotDetail } from '@/types'

const DETAIL_LIMIT = 12   // max snapshots to hydrate with full details

export interface UseSnapshotHistoryReturn {
  summaries:      SnapshotSummary[]     // oldest → newest
  details:        Map<number, SnapshotDetail>
  loading:        boolean               // initial list fetch
  detailsLoading: boolean               // background detail hydration
  error:          string | null
  refetch:        () => Promise<void>
}

export function useSnapshotHistory(portfolioId: number | null): UseSnapshotHistoryReturn {
  const [summaries,       setSummaries]       = useState<SnapshotSummary[]>([])
  const [details,         setDetails]         = useState<Map<number, SnapshotDetail>>(new Map())
  const [loading,         setLoading]         = useState(false)
  const [detailsLoading,  setDetailsLoading]  = useState(false)
  const [error,           setError]           = useState<string | null>(null)

  // Track in-flight abort controller per portfolioId so we cancel on unmount/change
  const abortRef = useRef<AbortController | null>(null)

  const fetchList = useCallback(async () => {
    if (portfolioId === null) {
      setSummaries([])
      setDetails(new Map())
      return
    }
    setLoading(true)
    setError(null)
    try {
      const raw  = await snapshotApi.list(portfolioId)
      // API returns newest-first; reverse so charts go oldest→newest
      const ordered = [...raw].reverse()
      setSummaries(ordered)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load snapshots')
    } finally {
      setLoading(false)
    }
  }, [portfolioId])

  // Lazily hydrate snapshot details for history charts
  const hydrateDetails = useCallback(async (snaps: SnapshotSummary[]) => {
    if (snaps.length === 0) return

    // Cancel any previous hydration pass
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    // Take the DETAIL_LIMIT most-recent (they appear last in oldest→newest order)
    const toFetch = snaps.slice(-DETAIL_LIMIT)
    setDetailsLoading(true)

    try {
      // Fetch in parallel (Promise.allSettled so one failure doesn't block others)
      const results = await Promise.allSettled(
        toFetch.map((snap) => snapshotApi.getDetail(snap.id))
      )

      if (ctrl.signal.aborted) return

      // Publish all successfully fetched details at once
      const freshEntries: [number, SnapshotDetail][] = []
      results.forEach((result, i) => {
        if (result.status === 'fulfilled') {
          freshEntries.push([toFetch[i].id, result.value])
        }
        // Rejected: non-fatal — skip that snapshot silently
      })

      if (freshEntries.length > 0) {
        setDetails((prev) => new Map([...prev, ...freshEntries]))
      }
    } finally {
      if (!ctrl.signal.aborted) setDetailsLoading(false)
    }
  }, [])

  // Fetch list on mount / portfolioId change
  useEffect(() => {
    fetchList()
  }, [fetchList])

  // Hydrate details whenever summaries list changes
  useEffect(() => {
    if (summaries.length > 0) {
      setDetails(new Map()) // clear stale details from previous portfolio
      hydrateDetails(summaries)
    }
    return () => { abortRef.current?.abort() }
  }, [summaries, hydrateDetails])

  return {
    summaries,
    details,
    loading,
    detailsLoading,
    error,
    refetch: fetchList,
  }
}
