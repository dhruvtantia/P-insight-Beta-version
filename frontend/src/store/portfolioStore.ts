/**
 * Portfolio Global Store (Zustand)
 * ----------------------------------
 * Tracks the active portfolio ID and a lightweight portfolio list for the
 * switcher UI.  The store is NOT persisted — we always fetch the current
 * active portfolio from the backend on mount so the UI stays in sync with
 * what the server considers active.
 *
 * Usage:
 *   const { activePortfolioId, setActivePortfolioId } = usePortfolioStore()
 */

import { create } from 'zustand'
import type { PortfolioMeta } from '@/types'

interface PortfolioStoreState {
  /** ID of the currently active portfolio, null while loading or if none exist */
  activePortfolioId: number | null

  /** Lightweight list — populated by usePortfolios on mount */
  portfolios: PortfolioMeta[]

  /** Whether the initial list fetch has completed */
  loaded: boolean

  // ── Setters ─────────────────────────────────────────────────────────────────

  setActivePortfolioId:  (id: number | null) => void
  setPortfolios:         (portfolios: PortfolioMeta[]) => void
  setLoaded:             (loaded: boolean) => void

  /** Merge-update a single portfolio in the list (e.g. after rename / activate) */
  upsertPortfolio: (portfolio: PortfolioMeta) => void

  /** Remove a deleted portfolio from the local list */
  removePortfolio: (id: number) => void
}

export const usePortfolioStore = create<PortfolioStoreState>((set) => ({
  activePortfolioId: null,
  portfolios: [],
  loaded: false,

  setActivePortfolioId: (id) => set({ activePortfolioId: id }),

  setPortfolios: (portfolios) => set({ portfolios }),

  setLoaded: (loaded) => set({ loaded }),

  upsertPortfolio: (updated) =>
    set((state) => ({
      portfolios: state.portfolios.some((p) => p.id === updated.id)
        ? state.portfolios.map((p) => (p.id === updated.id ? updated : p))
        : [...state.portfolios, updated],
      activePortfolioId: updated.is_active ? updated.id : state.activePortfolioId,
    })),

  removePortfolio: (id) =>
    set((state) => ({
      portfolios: state.portfolios.filter((p) => p.id !== id),
      activePortfolioId:
        state.activePortfolioId === id ? null : state.activePortfolioId,
    })),
}))
