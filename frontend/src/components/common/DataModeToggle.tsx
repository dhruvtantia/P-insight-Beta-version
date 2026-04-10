'use client'

import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Check, Lock, Upload, Wifi, Link } from 'lucide-react'
import { useDataMode } from '@/hooks/useDataMode'
import { cn } from '@/lib/utils'
import type { DataMode } from '@/types'

const MODE_ICONS: Record<DataMode, React.ElementType> = {
  uploaded: Upload,
  live:     Wifi,
  broker:   Link,
}

const MODE_COLORS: Record<DataMode, string> = {
  uploaded: 'text-emerald-600 bg-emerald-50',
  live:     'text-emerald-600 bg-emerald-50',
  broker:   'text-rose-600 bg-rose-50',
}

/**
 * DataModeToggle — the global data source switcher in the Topbar.
 * Uploaded and Live API are selectable. Broker Sync is Phase 3.
 * Mock mode has been removed.
 */
export function DataModeToggle() {
  const { mode, setMode, allModes, currentConfig } = useDataMode()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const CurrentIcon = MODE_ICONS[mode]

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors',
          'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
        )}
      >
        <CurrentIcon className={cn(
          'h-3.5 w-3.5',
          mode === 'live' ? 'text-emerald-500' : 'text-indigo-500'
        )} />
        <span>{currentConfig?.label ?? 'Select Mode'}</span>
        {mode === 'live' && (
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
        )}
        <ChevronDown className={cn('h-3.5 w-3.5 text-slate-400 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-72 rounded-xl border border-slate-200 bg-white shadow-lg z-50 overflow-hidden">
          <div className="px-3 pt-3 pb-1">
            <p className="text-[10px] uppercase tracking-widest font-semibold text-slate-400">
              Data Source
            </p>
          </div>

          <ul className="p-1.5 space-y-0.5">
            {allModes.map((m) => {
              const Icon = MODE_ICONS[m.value]
              const isActive = mode === m.value
              const isDisabled = !m.enabled

              return (
                <li key={m.value}>
                  <button
                    disabled={isDisabled}
                    onClick={() => {
                      if (!isDisabled) {
                        setMode(m.value)
                        setOpen(false)
                      }
                    }}
                    className={cn(
                      'flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors',
                      isActive && !isDisabled
                        ? 'bg-indigo-50 text-indigo-900'
                        : isDisabled
                        ? 'cursor-not-allowed opacity-50'
                        : 'hover:bg-slate-50 text-slate-700'
                    )}
                  >
                    <div className={cn('mt-0.5 rounded-md p-1.5', isDisabled ? 'bg-slate-100 text-slate-400' : MODE_COLORS[m.value])}>
                      <Icon className="h-3.5 w-3.5" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold leading-tight">{m.label}</span>
                        {m.badge && (
                          <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-500">
                            {m.badge}
                          </span>
                        )}
                        {isDisabled && <Lock className="h-3 w-3 text-slate-400 ml-auto" />}
                        {isActive && !isDisabled && <Check className="h-3.5 w-3.5 text-indigo-600 ml-auto" />}
                      </div>
                      <p className="mt-0.5 text-[11px] text-slate-500 leading-tight">{m.description}</p>
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>

          <div className="border-t border-slate-100 px-4 py-2">
            <p className="text-[10px] text-slate-400">
              Live API uses Yahoo Finance (yfinance). Broker Sync coming in Phase 3.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
