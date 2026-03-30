/**
 * useDataMode Hook
 * -----------------
 * Convenience wrapper around the data mode store.
 * Provides the active mode, setter, and mode config metadata.
 */

'use client'

import { useDataModeStore } from '@/store/dataModeStore'
import { DATA_MODES } from '@/constants'
import type { DataMode, DataModeConfig } from '@/types'

interface UseDataModeReturn {
  mode: DataMode
  setMode: (mode: DataMode) => void
  currentConfig: DataModeConfig | undefined
  allModes: DataModeConfig[]
  isMock: boolean
  isUploaded: boolean
  isLive: boolean
  isBroker: boolean
}

export function useDataMode(): UseDataModeReturn {
  const { mode, setMode } = useDataModeStore()
  const currentConfig = DATA_MODES.find((m) => m.value === mode)

  return {
    mode,
    setMode,
    currentConfig,
    allModes: DATA_MODES,
    isMock: mode === 'mock',
    isUploaded: mode === 'uploaded',
    isLive: mode === 'live',
    isBroker: mode === 'broker',
  }
}
