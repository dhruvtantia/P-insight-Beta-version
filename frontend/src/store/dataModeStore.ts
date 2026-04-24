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

type PersistedDataModeState = Pick<DataModeState, 'mode'>

export const useDataModeStore = create<DataModeState>()(
  persist<DataModeState, [], [], PersistedDataModeState>(
    (set, get) => ({
      // Default to 'uploaded' — mock mode is disabled
      mode: 'uploaded' as DataMode,

      // Feature flags
      isLiveEnabled: true,
      isBrokerEnabled: false,

      setMode: (mode: DataMode) => {
        const state = get()

        // Guard: reject any attempt to switch to deprecated mock mode
        if ((mode as string) === 'mock') {
          console.warn('Mock mode is disabled. Use uploaded or live mode.')
          return
        }

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
      // Migrate any stored 'mock' value to 'uploaded' on hydration
      partialize: (state): PersistedDataModeState => ({ mode: state.mode }),
      merge: (persisted: unknown, current: DataModeState): DataModeState => {
        const stored = (persisted as Partial<PersistedDataModeState> | undefined)?.mode
        const safeModes: DataMode[] = ['uploaded', 'live', 'broker']
        return {
          ...current,
          mode: safeModes.includes(stored as DataMode) ? (stored as DataMode) : 'uploaded',
        }
      },
    }
  )
)
