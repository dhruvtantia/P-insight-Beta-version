/**
 * Dashboard Cross-Filter Store (Zustand)
 * ----------------------------------------
 * Manages the active sector and ticker filters for cross-module interactions.
 *
 * Interactions enabled:
 *   - Sector donut click → filters HoldingsTable to that sector
 *   - Holding row click  → navigates to /peers?ticker=...
 *   - Clear filter chip  → resets selectedSector
 *
 * NOT persisted to localStorage — filters are session-only and reset on refresh.
 */

import { create } from 'zustand'

interface FilterState {
  selectedSector: string | null
  setSelectedSector: (sector: string | null) => void
  toggleSector: (sector: string) => void   // click same sector again to deselect
  clearFilters: () => void
}

export const useFilterStore = create<FilterState>((set, get) => ({
  selectedSector: null,

  setSelectedSector: (sector) => set({ selectedSector: sector }),

  toggleSector: (sector) => {
    const current = get().selectedSector
    set({ selectedSector: current === sector ? null : sector })
  },

  clearFilters: () => set({ selectedSector: null }),
}))
