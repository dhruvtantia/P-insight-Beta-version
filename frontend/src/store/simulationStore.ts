/**
 * Simulation Store (Zustand)
 * ---------------------------
 * Persists simHoldings across in-app navigation (page switches within the session).
 * NOT persisted to localStorage — this is intentionally session-only.
 *
 * Why: useSimulation previously used local useState, which resets every time the
 * Simulator page unmounts (i.e. whenever the user navigates to Watchlist and back).
 * This store is the minimal fix — it lifts exactly the mutable sim state out of the
 * component tree so it survives navigation without touching the rest of the hook.
 *
 * Cleared when:
 *   - The active portfolio changes (detected in useSimulation by comparing portfolioId)
 *   - The user explicitly hits "Reset to base" (calls clearSimulation())
 *
 * Usage: imported only by useSimulation.ts — do NOT consume directly from UI components.
 */

import { create } from 'zustand'
import type { SimulatedHolding } from '@/lib/simulation'

interface SimulationStoreState {
  /** The user's current simulated allocation — mutated by all sim actions */
  simHoldings:  SimulatedHolding[]

  /**
   * Which portfolio these holdings belong to.
   * Set to activePortfolioId when first initialised from base.
   * Used to detect portfolio switches so we know to reinitialise.
   */
  portfolioId:  number | null

  /**
   * Whether the store has ever been initialised from a base portfolio in this session.
   * Prevents the init effect from re-firing on every re-mount once we already have state.
   */
  hasHydrated:  boolean

  // ── Setters (all stable — safe to use in useCallback without deps) ──────────
  setSimHoldings:  (holdings: SimulatedHolding[]) => void
  setPortfolioId:  (id: number | null) => void
  setHasHydrated:  (v: boolean) => void
  clearSimulation: () => void
}

export const useSimulationStore = create<SimulationStoreState>((set) => ({
  simHoldings:  [],
  portfolioId:  null,
  hasHydrated:  false,

  setSimHoldings:  (simHoldings)  => set({ simHoldings }),
  setPortfolioId:  (portfolioId)  => set({ portfolioId }),
  setHasHydrated:  (hasHydrated)  => set({ hasHydrated }),
  clearSimulation: ()             => set({ simHoldings: [], portfolioId: null, hasHydrated: false }),
}))
