/**
 * PortfolioSwitcher
 * ------------------
 * Dropdown in the Topbar letting the user switch the active portfolio.
 * Shows: portfolio name, source badge (from shared SourceBadge), holding count.
 * - last_synced_at shown for uploaded/broker portfolios
 * - Mobile-safe: dropdown is max-w-[calc(100vw-2rem)]
 *
 * On activate, calls the backend and optimistically updates the store.
 */

'use client'

import React, { useState, useRef, useEffect } from 'react'
import { ChevronDown, CheckCircle2, Loader2, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePortfolios } from '@/hooks/usePortfolios'
import { SourceBadge } from './SourceBadge'
import type { PortfolioMeta } from '@/types'

// ─── Relative date ────────────────────────────────────────────────────────────

function relTime(iso: string | null | undefined): string | null {
  if (!iso) return null
  try {
    const diff  = Date.now() - new Date(iso).getTime()
    const days  = Math.floor(diff / 86_400_000)
    const hours = Math.floor(diff / 3_600_000)
    const mins  = Math.floor(diff / 60_000)
    if (mins  < 2)  return 'just now'
    if (hours < 1)  return `${mins}m ago`
    if (hours < 24) return `${hours}h ago`
    return `${days}d ago`
  } catch { return null }
}

// ─── Main component ───────────────────────────────────────────────────────────

export function PortfolioSwitcher(): React.ReactElement {
  const { portfolios, activePortfolioId, loading, activate } = usePortfolios()
  const [open,       setOpen]       = useState(false)
  const [activating, setActivating] = useState<number | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const active = portfolios.find((p) => p.id === activePortfolioId)

  const handleActivate = async (p: PortfolioMeta) => {
    if (p.id === activePortfolioId) { setOpen(false); return }
    setActivating(p.id)
    try {
      await activate(p.id)
    } finally {
      setActivating(null)
      setOpen(false)
    }
  }

  if (loading && portfolios.length === 0) {
    return (
      <div className="flex items-center gap-1.5 text-sm text-slate-400 px-2">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        <span>Loading…</span>
      </div>
    )
  }

  return (
    <div className="relative" ref={ref}>
      {/* Trigger */}
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm',
          'border border-slate-200 bg-white hover:bg-slate-50 transition-colors',
          open && 'ring-2 ring-indigo-500/30 border-indigo-300',
        )}
      >
        {active ? (
          <>
            <span className="max-w-[130px] truncate font-medium text-slate-700">{active.name}</span>
            <SourceBadge source={active.source} size="xs" />
          </>
        ) : (
          <span className="text-slate-400 text-sm">No portfolio</span>
        )}
        <ChevronDown className={cn(
          'h-3.5 w-3.5 text-slate-400 transition-transform shrink-0',
          open && 'rotate-180',
        )} />
      </button>

      {/* Dropdown */}
      {open && (
        <div className={cn(
          'absolute left-0 top-full mt-1 z-50',
          'w-72 max-w-[calc(100vw-2rem)]',
          'rounded-xl border border-slate-200 bg-white shadow-xl',
          'overflow-hidden',
        )}>
          {portfolios.length === 0 ? (
            <p className="px-4 py-3 text-sm text-slate-400 text-center">No portfolios found</p>
          ) : (
            <ul className="py-1 max-h-72 overflow-y-auto divide-y divide-slate-50">
              {portfolios.map((p) => {
                const isActive    = p.id === activePortfolioId
                const isActivating = activating === p.id
                const synced       = relTime(p.last_synced_at)

                return (
                  <li key={p.id}>
                    <button
                      onClick={() => handleActivate(p)}
                      disabled={isActivating}
                      className={cn(
                        'w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors',
                        isActive
                          ? 'bg-indigo-50'
                          : 'hover:bg-slate-50',
                      )}
                    >
                      <div className="w-4 shrink-0 flex items-center justify-center">
                        {isActivating ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-500" />
                        ) : isActive ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-indigo-500" />
                        ) : (
                          <div className="h-3 w-3 rounded-full border border-slate-300" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className={cn(
                          'text-sm truncate',
                          isActive ? 'font-semibold text-indigo-700' : 'font-medium text-slate-700',
                        )}>
                          {p.name}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[10px] text-slate-400">
                            {p.num_holdings} holding{p.num_holdings !== 1 ? 's' : ''}
                          </span>
                          {synced && (
                            <>
                              <span className="text-slate-300">·</span>
                              <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
                                <RefreshCw className="h-2.5 w-2.5" />
                                {synced}
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      <SourceBadge source={p.source} size="xs" />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}

          <div className="border-t border-slate-100 px-3 py-2">
            <a
              href="/portfolios"
              className="text-xs text-indigo-600 hover:underline"
              onClick={() => setOpen(false)}
            >
              Manage portfolios & sources →
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
