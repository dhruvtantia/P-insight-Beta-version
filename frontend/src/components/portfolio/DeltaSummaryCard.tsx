/**
 * DeltaSummaryCard
 * -----------------
 * Top-line summary of what changed between two snapshots.
 *
 * Shows:
 *   - Time span between snapshots
 *   - Portfolio value change (abs + %)
 *   - P&L delta
 *   - Holdings added / removed
 *   - # increased / decreased / unchanged
 *   - Biggest sector weight shift
 */

'use client'

import React from 'react'
import {
  TrendingUp, TrendingDown, Plus, Minus,
  ArrowUpRight, ArrowDownRight, Building2, Clock,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatWeightDelta } from '@/lib/delta'
import type { PortfolioDelta } from '@/types'

function formatCurrency(v: number | null): string {
  if (v == null) return '—'
  const abs = Math.abs(v)
  const sign = v >= 0 ? '+' : '−'
  if (abs >= 1_00_00_000) return `${sign}₹${(abs / 1_00_00_000).toFixed(2)} Cr`
  if (abs >= 1_00_000)    return `${sign}₹${(abs / 1_00_000).toFixed(1)} L`
  return `${sign}₹${abs.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}

function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

interface MetricTileProps {
  label:      string
  value:      React.ReactNode
  sub?:       React.ReactNode
  icon?:      React.ElementType
  positive?:  boolean | null
  className?: string
}

function MetricTile({ label, value, sub, icon: Icon, positive, className }: MetricTileProps) {
  return (
    <div className={cn(
      'rounded-xl border bg-white dark:bg-slate-800 px-4 py-3',
      positive === true  && 'border-emerald-200 dark:border-emerald-700',
      positive === false && 'border-rose-200 dark:border-rose-700',
      positive == null   && 'border-slate-200 dark:border-slate-700',
      className,
    )}>
      <div className="flex items-start justify-between gap-2 mb-1">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
        {Icon && (
          <Icon className={cn(
            'h-3.5 w-3.5 shrink-0',
            positive === true  ? 'text-emerald-500' :
            positive === false ? 'text-rose-500'    : 'text-slate-400',
          )} />
        )}
      </div>
      <p className={cn(
        'text-base font-bold tabular-nums leading-none',
        positive === true  ? 'text-emerald-600 dark:text-emerald-400' :
        positive === false ? 'text-rose-500    dark:text-rose-400'    :
                             'text-slate-700   dark:text-slate-200',
      )}>
        {value}
      </p>
      {sub && (
        <p className="text-[11px] text-slate-400 mt-0.5 leading-none">{sub}</p>
      )}
    </div>
  )
}

interface DeltaSummaryCardProps {
  delta:      PortfolioDelta
  className?: string
}

export function DeltaSummaryCard({ delta, className }: DeltaSummaryCardProps): React.ReactElement {
  const valuePositive  = (delta.total_value_delta ?? 0) >= 0
  const pnlPositive    = (delta.total_pnl_delta   ?? 0) >= 0

  // Biggest sector weight change
  const biggestSector = delta.sector_deltas
    .filter((s) => s.weight_delta != null)
    .sort((a, b) => Math.abs(b.weight_delta ?? 0) - Math.abs(a.weight_delta ?? 0))[0]

  const daysLabel =
    delta.days_apart === 0 ? 'Same day'
    : delta.days_apart === 1 ? '1 day apart'
    : `${delta.days_apart} days apart`

  return (
    <div className={cn('space-y-3', className)}>
      {/* Period banner */}
      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/60 rounded-lg px-3 py-2 border border-slate-200 dark:border-slate-700">
        <span className="flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5" />
          {formatDateShort(delta.captured_at_a)}
          <span className="text-slate-300">→</span>
          {formatDateShort(delta.captured_at_b)}
        </span>
        <span className="font-medium text-slate-600 dark:text-slate-300">{daysLabel}</span>
      </div>

      {/* Metric grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Value change */}
        <MetricTile
          label="Value Δ"
          value={formatCurrency(delta.total_value_delta)}
          sub={delta.total_value_delta_pct != null
            ? `${delta.total_value_delta_pct >= 0 ? '+' : ''}${delta.total_value_delta_pct.toFixed(1)}%`
            : undefined}
          icon={valuePositive ? TrendingUp : TrendingDown}
          positive={delta.total_value_delta != null ? valuePositive : null}
          className="col-span-1"
        />

        {/* P&L change */}
        <MetricTile
          label="P&L Δ"
          value={formatCurrency(delta.total_pnl_delta)}
          icon={pnlPositive ? ArrowUpRight : ArrowDownRight}
          positive={delta.total_pnl_delta != null ? pnlPositive : null}
        />

        {/* Added */}
        <MetricTile
          label="Added"
          value={
            <span className="flex items-center gap-1">
              <Plus className="h-3.5 w-3.5" />
              {delta.added_tickers.length}
            </span>
          }
          sub={delta.added_tickers.slice(0, 3).join(', ') || undefined}
          positive={delta.added_tickers.length > 0 ? true : null}
        />

        {/* Removed */}
        <MetricTile
          label="Removed"
          value={
            <span className="flex items-center gap-1">
              <Minus className="h-3.5 w-3.5" />
              {delta.removed_tickers.length}
            </span>
          }
          sub={delta.removed_tickers.slice(0, 3).join(', ') || undefined}
          positive={delta.removed_tickers.length > 0 ? false : null}
        />

        {/* Weight movers */}
        <MetricTile
          label="Weight Shifts"
          value={delta.increased_tickers.length + delta.decreased_tickers.length}
          sub={`↑${delta.increased_tickers.length} ↓${delta.decreased_tickers.length}`}
          positive={null}
        />

        {/* Top sector shift */}
        {biggestSector ? (
          <MetricTile
            label="Biggest Sector Δ"
            value={formatWeightDelta(biggestSector.weight_delta)}
            sub={biggestSector.sector}
            icon={Building2}
            positive={null}
          />
        ) : (
          <MetricTile
            label="Sector Δ"
            value="—"
            icon={Building2}
            positive={null}
          />
        )}
      </div>
    </div>
  )
}
