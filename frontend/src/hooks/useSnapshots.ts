/**
 * useSnapshots Hook
 * ------------------
 * Fetches and manages snapshots for a given portfolio.
 * Also provides helpers for creating snapshots and fetching deltas.
 *
 * Usage:
 *   const { snapshots, loading, createSnapshot, getDelta } = useSnapshots(portfolioId)
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import { snapshotApi } from '@/services/api'
import type { SnapshotSummary, SnapshotDetail, PortfolioDelta } from '@/types'

export interface UseSnapshotsReturn {
  snapshots:       SnapshotSummary[]
  loading:         boolean
  error:           string | null
  refetch:         () => Promise<void>
  createSnapshot:  (label?: string) => Promise<SnapshotSummary>
  getDetail:       (snapshotId: number) => Promise<SnapshotDetail>
  getDelta:        (snapshotAId: number, snapshotBId: number) => Promise<PortfolioDelta>
  deleteSnapshot:  (snapshotId: number) => Promise<void>
}

export function useSnapshots(portfolioId: number | null): UseSnapshotsReturn {
  const [snapshots, setSnapshots] = useState<SnapshotSummary[]>([])
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    if (portfolioId === null) {
      setSnapshots([])
      return
    }
    setLoading(true)
    setError(null)
    try {
      const data = await snapshotApi.list(portfolioId)
      setSnapshots(data)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load snapshots'
      setError(msg)
      console.error('[useSnapshots] fetch failed:', err)
    } finally {
      setLoading(false)
    }
  }, [portfolioId])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  const createSnapshot = useCallback(async (label?: string): Promise<SnapshotSummary> => {
    if (portfolioId === null) throw new Error('No portfolio selected')
    const snap = await snapshotApi.create(portfolioId, label)
    setSnapshots((prev) => [snap, ...prev])
    return snap
  }, [portfolioId])

  const getDetail = useCallback(async (snapshotId: number): Promise<SnapshotDetail> => {
    return snapshotApi.getDetail(snapshotId)
  }, [])

  const getDelta = useCallback(async (
    snapshotAId: number,
    snapshotBId: number
  ): Promise<PortfolioDelta> => {
    return snapshotApi.getDelta(snapshotAId, snapshotBId)
  }, [])

  const deleteSnapshot = useCallback(async (snapshotId: number) => {
    await snapshotApi.delete(snapshotId)
    setSnapshots((prev) => prev.filter((s) => s.id !== snapshotId))
  }, [])

  return {
    snapshots,
    loading,
    error,
    refetch: fetchAll,
    createSnapshot,
    getDetail,
    getDelta,
    deleteSnapshot,
  }
}
