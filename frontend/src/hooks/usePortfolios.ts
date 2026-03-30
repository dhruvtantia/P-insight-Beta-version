/**
 * usePortfolios Hook
 * ------------------
 * Fetches and manages all portfolios via the /api/v1/portfolios endpoints.
 * Syncs results into the global portfolioStore.
 *
 * Usage:
 *   const { portfolios, activePortfolioId, activate, rename, remove, loading } = usePortfolios()
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import { portfolioMgmtApi } from '@/services/api'
import { usePortfolioStore } from '@/store/portfolioStore'
import type { PortfolioMeta } from '@/types'

export interface UsePortfoliosReturn {
  portfolios:         PortfolioMeta[]
  activePortfolioId:  number | null
  loading:            boolean
  error:              string | null
  refetch:            () => Promise<void>
  activate:           (portfolioId: number) => Promise<void>
  rename:             (portfolioId: number, name: string) => Promise<void>
  remove:             (portfolioId: number) => Promise<void>
  create:             (name: string, description?: string) => Promise<PortfolioMeta>
  /** Optimistically update a single portfolio in the store (e.g. after refresh). */
  updatePortfolio:    (updated: PortfolioMeta) => void
}

export function usePortfolios(): UsePortfoliosReturn {
  const {
    portfolios,
    activePortfolioId,
    setPortfolios,
    setActivePortfolioId,
    setLoaded,
    upsertPortfolio,
    removePortfolio,
  } = usePortfolioStore()

  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await portfolioMgmtApi.list()
      setPortfolios(data.portfolios)
      setActivePortfolioId(data.active_id)
      setLoaded(true)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load portfolios'
      setError(msg)
      console.error('[usePortfolios] fetch failed:', err)
    } finally {
      setLoading(false)
    }
  }, [setPortfolios, setActivePortfolioId, setLoaded])

  // Load on mount (only once — store persists for session lifetime)
  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  const activate = useCallback(async (portfolioId: number) => {
    try {
      await portfolioMgmtApi.activate(portfolioId)
      // Mark all portfolios inactive, then activate the target
      setPortfolios(
        portfolios.map((p) => ({ ...p, is_active: p.id === portfolioId }))
      )
      setActivePortfolioId(portfolioId)
    } catch (err) {
      console.error('[usePortfolios] activate failed:', err)
      throw err
    }
  }, [portfolios, setPortfolios, setActivePortfolioId])

  const rename = useCallback(async (portfolioId: number, name: string) => {
    try {
      const updated = await portfolioMgmtApi.rename(portfolioId, name)
      upsertPortfolio(updated)
    } catch (err) {
      console.error('[usePortfolios] rename failed:', err)
      throw err
    }
  }, [upsertPortfolio])

  const remove = useCallback(async (portfolioId: number) => {
    try {
      await portfolioMgmtApi.delete(portfolioId)
      removePortfolio(portfolioId)
    } catch (err) {
      console.error('[usePortfolios] delete failed:', err)
      throw err
    }
  }, [removePortfolio])

  const create = useCallback(async (name: string, description?: string): Promise<PortfolioMeta> => {
    try {
      const created = await portfolioMgmtApi.create(name, description)
      upsertPortfolio(created)
      return created
    } catch (err) {
      console.error('[usePortfolios] create failed:', err)
      throw err
    }
  }, [upsertPortfolio])

  return {
    portfolios,
    activePortfolioId,
    loading,
    error,
    refetch: fetchAll,
    activate,
    rename,
    remove,
    create,
    updatePortfolio: upsertPortfolio,
  }
}
