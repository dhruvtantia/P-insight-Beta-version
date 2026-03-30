/**
 * SnapshotSummaryCard
 * --------------------
 * Displays a single snapshot summary in a compact card.
 * Used in the /portfolios page snapshot timeline.
 *
 * Shows: label, timestamp, total value, P&L, holdings count, top sector.
 */

'use client'

import React from 'react'
import { Camera, TrendingUp, TrendingDown, Layers, Building2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SnapshotSummary } from '@/types'

interface SnapshotSummaryCardProps {
  snapshot:  SnapshotSummary
  isLatest?: boolean
  onClick?:  () => void
  onDelete?: () => void
  className?: string
}

function formatCurrency(value: number): string {
  if (Math.abs(value) >= 1_00_00_000) {
    return `₹${(value / 1_00_00_000).toFixed(2)} Cr`
  }
  if (Math.abs(value) >= 1_00_000) {
    return `₹${(value / 1_00_000).toFixed(1)} L`
  }
  return `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}

function formatDate(isoStr: string): string {
  const d = new Date(isoStr)
  return d.toLocaleDateString('en-IN', {
    day:   '2-digit',
    month: 'short',
    year:  'numeric',
    hour:  '2-digit',
    minute: '2-digit',
  })
}

export function SnapshotSummaryCard({
  snapshot,
  isLatest  = false,
  onClick,
  onDelete,
  className,
}: SnapshotSummaryCardProps): React.ReactElement {
  const pnlPositive = (snapshot.total_pnl ?? 0) >= 0

  return (
    <div
      className={cn(
        'relative rounded-xl border bg-white dark:bg-slate-800 p-4',
        'transition-shadow',
        onClick && 'cursor-pointer hover:shadow-md',
        isLatest
          ? 'border-indigo-300 dark:border-indigo-600 shadow-sm'
          : 'border-slate-200 dark:border-slate-700',
        className,
      )}
      onClick={onClick}
    >
      {isLatest && (
        <span className="absolute -top-2.5 left-3 bg-indigo-600 text-white text-[10px] font-semibold rounded-full px-2 py-0.5 leading-none">
          Latest
        </span>
      )}

      {/* Header row */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <Camera className="h-4 w-4 shrink-0 text-slate-400" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">
              {snapshot.label ?? `Snapshot #${snapshot.id}`}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {formatDate(snapshot.captured_at)}
            </p>
          </div>
        </div>

        {onDelete && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete() }}
            className="shrink-0 text-slate-300 hover:text-rose-500 dark:text-slate-600 dark:hover:text-rose-400 transition-colors"
            title="Delete snapshot"
          >
            ×
          </button>
        )}
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-2 gap-2 text-sm">
        {/* Total value */}
        <div className="rounded-lg bg-slate-50 dark:bg-slate-700/50 px-3 py-2">
          <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-0.5">Value</p>
          <p className="font-semibold text-slate-700 dark:text-slate-200">
            {snapshot.total_value != null ? formatCurrency(snapshot.total_value) : '—'}
          </p>
        </div>

        {/* P&L */}
        <div className="rounded-lg bg-slate-50 dark:bg-slate-700/50 px-3 py-2">
          <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-0.5">P&L</p>
          <div className="flex items-center gap-1">
            {pnlPositive
              ? <TrendingUp   className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
              : <TrendingDown className="h-3.5 w-3.5 text-rose-500   shrink-0" />
            }
            <p className={cn(
              'font-semibold',
              pnlPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'
            )}>
              {snapshot.total_pnl != null
                ? (pnlPositive ? '+' : '−') + formatCurrency(Math.abs(snapshot.total_pnl))
                : '—'
              }
            </p>
          </div>
          {snapshot.total_pnl_pct != null && (
            <p className={cn(
              'text-[11px] mt-0.5',
              pnlPositive ? 'text-emerald-500' : 'text-rose-400'
            )}>
              {pnlPositive ? '+' : ''}{snapshot.total_pnl_pct.toFixed(1)}%
            </p>
          )}
        </div>

        {/* Holdings count */}
        <div className="rounded-lg bg-slate-50 dark:bg-slate-700/50 px-3 py-2">
          <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-0.5">Holdings</p>
          <div className="flex items-center gap-1">
            <Layers className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            <p className="font-semibold text-slate-700 dark:text-slate-200">
              {snapshot.num_holdings ?? '—'}
            </p>
          </div>
        </div>

        {/* Top sector */}
        <div className="rounded-lg bg-slate-50 dark:bg-slate-700/50 px-3 py-2">
          <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-0.5">Top Sector</p>
          <div className="flex items-center gap-1">
            <Building2 className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            <p className="font-semibold text-slate-700 dark:text-slate-200 truncate text-xs">
              {snapshot.top_sector ?? '—'}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
