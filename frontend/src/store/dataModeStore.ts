/**
 * Data Mode Global Store (Zustand)
 * ----------------------------------
 * Manages the active data source mode across the entire application.
 * Persisted to localStorage so the selection survives page refreshes.
 *
 * Usage:
 *   const { mode, setMode } = useDataModeStore()
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { DataMode } from '@/types'

interface DataModeState {
  mode: DataMode
  setMode: (mode: DataMode) => void
  isLiveEnabled: boolean
  isBrokerEnabled: boolean
}

export const useDataModeStore = create<DataModeState>()(
  persist(
    (set, get) => ({
      mode: 'mock' as DataMode,

      // Feature flags — Phase 2: live API is now enabled
      isLiveEnabled: true,
      isBrokerEnabled: false,

      setMode: (mode: DataMode) => {
        const state = get()

        if (mode === 'live' && !state.isLiveEnabled) {
          console.warn('Live API mode is not yet enabled.')
          return
        }

        if (mode === 'broker' && !state.isBrokerEnabled) {
          console.warn('Broker Sync mode is not yet enabled.')
          return
        }

        set({ mode })
      },
    }),
    {
      name: 'p-insight-data-mode',
      // Only persist the mode selection, not the flags
      partialize: (state) => ({ mode: state.mode }),
    }
  )
)
