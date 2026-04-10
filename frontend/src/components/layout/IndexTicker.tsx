'use client'

/**
 * IndexTicker
 * ------------
 * Compact topbar widget showing live NIFTY 50 and SENSEX values with change.
 *
 * States:
 *   loading      → skeleton pulse
 *   unavailable  → "Indices unavailable" chip (never shows zeros or mock values)
 *   live         → value · ▲/▼ change (abs + %) + "Last updated HH:MM" timestamp
 *
 * Polls every 60 s via useIndices().
 */

import { TrendingUp, TrendingDown, WifiOff, Clock } from 'lucide-react'
import { useIndices } from '@/hooks/useIndices'
import type { IndexQuote } from '@/types'
import { cn } from '@/lib/utils'

// ─── Single index chip ────────────────────────────────────────────────────────

function IndexChip({ index }: { index: IndexQuote }) {
  if (index.unavailable) {
    return (
      <div className="flex items-center gap-1.5 rounded-md bg-slate-100 px-2.5 py-1 text-xs text-slate-400 border border-slate-200">
        <WifiOff className="h-3 w-3 shrink-0" />
        <span className="font-medium">{index.name}</span>
        <span className="text-[10px]">unavailable</span>
      </div>
    )
  }

  const up = (index.change ?? 0) >= 0
  const Arrow = up ? TrendingUp : TrendingDown
  const colour = up ? 'text-emerald-600' : 'text-red-500'
  const bgColour = up ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'

  const fmt = (n: number) =>
    n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  return (
    <div className={cn('flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs', bgColour)}>
      {/* Label */}
      <span className="font-semibold text-slate-600 text-[10px] uppercase tracking-wide shrink-0">
        {index.name}
      </span>

      {/* Value */}
      <span className="font-bold text-slate-800 tabular-nums">
        {fmt(index.value ?? 0)}
      </span>

      {/* Change */}
      <span className={cn('flex items-center gap-0.5 tabular-nums font-medium shrink-0', colour)}>
        <Arrow className="h-2.5 w-2.5" />
        {fmt(Math.abs(index.change ?? 0))}
        <span className="text-[10px]">
          ({up ? '+' : ''}{(index.change_pct ?? 0).toFixed(2)}%)
        </span>
      </span>
    </div>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function IndexSkeleton() {
  return (
    <div className="flex items-center gap-2">
      {[0, 1].map((i) => (
        <div
          key={i}
          className="h-7 w-48 animate-pulse rounded-md bg-slate-100 border border-slate-200"
        />
      ))}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function IndexTicker() {
  const { indices, loading, error, lastFetchAt } = useIndices()

  if (loading) return <IndexSkeleton />

  // Backend completely unreachable — show a single compact error chip
  if (error && indices.length === 0) {
    return (
      <div className="flex items-center gap-1.5 rounded-md bg-slate-100 px-2.5 py-1 text-xs text-slate-400 border border-slate-200">
        <WifiOff className="h-3 w-3 shrink-0" />
        <span>Market data unavailable</span>
      </div>
    )
  }

  const timeLabel = lastFetchAt
    ? lastFetchAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <div className="flex items-center gap-2">
      {indices.map((idx) => (
        <IndexChip key={idx.symbol} index={idx} />
      ))}
      {timeLabel && (
        <div className="hidden lg:flex items-center gap-1 text-[10px] text-slate-400 ml-1">
          <Clock className="h-2.5 w-2.5" />
          <span>{timeLabel}</span>
        </div>
      )}
    </div>
  )
}
