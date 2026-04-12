'use client'

/**
 * IndexTicker
 * ------------
 * Compact topbar strip showing NIFTY 50, SENSEX, and BANK NIFTY with change.
 *
 * Data source: GET /api/v1/market/overview (via useIndices hook).
 * Previously used GET /api/v1/live/indices — migrated 2026-04-12 because
 * the legacy endpoint caused OperationalError DB failures and thread-start
 * errors under load.
 *
 * States:
 *   loading      → skeleton pulse
 *   error        → compact "unavailable" chip (only when there is NO prior data)
 *   stale        → last known values shown with a subtle staleness dot
 *   live         → value · ▲/▼ change (abs + %) + status badge
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
        className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0"
      />
    )
  }
  if (status === 'last_close') {
    return (
      <span
        title="Showing last close"
        className="h-1.5 w-1.5 rounded-full bg-slate-400 shrink-0"
      />
    )
  }
  return null
}

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

  const up      = (index.change ?? 0) >= 0
  const Arrow   = up ? TrendingUp : TrendingDown
  const colour  = up ? 'text-emerald-600' : 'text-red-500'
  const bgColour = up ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'

  const fmt = (n: number) =>
    n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  return (
    <div className={cn('flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs', bgColour)}>
      {/* Live / last-close indicator dot */}
      <StatusDot status={index.status} />

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
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-7 w-40 animate-pulse rounded-md bg-slate-100 border border-slate-200"
        />
      ))}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function IndexTicker() {
  const { indices, loading, error, stale, lastFetchAt } = useIndices()

  if (loading) return <IndexSkeleton />

  // Backend completely unreachable AND no prior data — show a compact error
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

      {/* Timestamp + stale indicator */}
      <div className="hidden lg:flex items-center gap-1 text-[10px] text-slate-400 ml-1">
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
