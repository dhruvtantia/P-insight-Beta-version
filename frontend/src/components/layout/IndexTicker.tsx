'use client'

/**
 * IndexTicker
 * ------------
 * Topbar strip showing NIFTY 50, SENSEX, and BANK NIFTY.
 * Each chip uses a stacked layout: name / value / change — more readable
 * than the previous single-row inline layout.
 *
 * Data source: GET /api/v1/market/overview (via useIndices hook).
 * Poll: 120s. Stale-while-revalidate — never blanks on refresh failure.
 */

import { TrendingUp, TrendingDown, WifiOff, Clock } from 'lucide-react'
import { useIndices } from '@/hooks/useIndices'
import type { IndexQuote } from '@/types'
import { cn } from '@/lib/utils'

// ─── Status dot ───────────────────────────────────────────────────────────────

function StatusDot({ status }: { status?: string }) {
  if (status === 'live') {
    return (
      <span
        title="Live session"
        className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0"
      />
    )
  }
  if (status === 'last_close') {
    return (
      <span
        title="Showing last close"
        className="inline-block h-1.5 w-1.5 rounded-full bg-slate-400 shrink-0"
      />
    )
  }
  return null
}

// ─── Single index chip — stacked layout ──────────────────────────────────────

function IndexChip({ index }: { index: IndexQuote }) {
  if (index.unavailable) {
    return (
      <div className="flex flex-col gap-0.5 items-start rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 min-w-[110px]">
        <div className="flex items-center gap-1">
          <WifiOff className="h-2.5 w-2.5 text-slate-300 shrink-0" />
          <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">
            {index.name}
          </span>
        </div>
        <span className="text-[11px] text-slate-300 font-medium">unavailable</span>
      </div>
    )
  }

  const up       = (index.change ?? 0) >= 0
  const Arrow    = up ? TrendingUp : TrendingDown
  const colour   = up ? 'text-emerald-600' : 'text-red-500'
  const border   = up ? 'border-emerald-100' : 'border-red-100'
  const bg       = up ? 'bg-emerald-50/60' : 'bg-red-50/60'

  const fmtVal = (n: number) =>
    n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const changePct = (index.change_pct ?? 0).toFixed(2)
  const sign      = up ? '+' : ''

  return (
    <div className={cn(
      'flex flex-col gap-0.5 rounded-xl border px-3 py-2 min-w-[118px]',
      border, bg,
    )}>
      {/* Row 1: name + status dot */}
      <div className="flex items-center gap-1">
        <StatusDot status={index.status} />
        <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500 truncate">
          {index.name}
        </span>
      </div>

      {/* Row 2: current value */}
      <span className="text-sm font-extrabold text-slate-800 tabular-nums leading-tight">
        {fmtVal(index.value ?? 0)}
      </span>

      {/* Row 3: absolute change + % */}
      <div className={cn('flex items-center gap-0.5 tabular-nums font-semibold leading-none', colour)}>
        <Arrow className="h-2.5 w-2.5 shrink-0" />
        <span className="text-[10px]">{sign}{changePct}%</span>
      </div>
    </div>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function IndexSkeleton() {
  return (
    <div className="flex items-center gap-2">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-[58px] w-[118px] animate-pulse rounded-xl bg-slate-100 border border-slate-200"
        />
      ))}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function IndexTicker() {
  const { indices, loading, error, stale, lastFetchAt } = useIndices()

  if (loading) return <IndexSkeleton />

  // Backend completely unreachable AND no prior data — compact error
  if (error && indices.length === 0) {
    return (
      <div className="flex items-center gap-1.5 rounded-xl bg-slate-100 px-3 py-2 text-xs text-slate-400 border border-slate-200">
        <WifiOff className="h-3 w-3 shrink-0" />
        <span>Market data unavailable</span>
      </div>
    )
  }

  const timeLabel = lastFetchAt
    ? lastFetchAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <div className="flex items-center gap-2 overflow-x-auto">
      {indices.map((idx) => (
        <IndexChip key={idx.symbol} index={idx} />
      ))}

      {/* Timestamp + stale indicator — shown only when wide enough */}
      <div className="hidden xl:flex items-center gap-1 text-[10px] text-slate-400 ml-1 shrink-0">
        {stale && (
          <span
            title="Refresh failed — showing last known values"
            className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0"
          />
        )}
        {timeLabel && (
          <>
            <Clock className="h-2.5 w-2.5" />
            <span>{timeLabel}</span>
          </>
        )}
      </div>
    </div>
  )
}
