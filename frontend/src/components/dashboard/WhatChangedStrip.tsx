/**
 * WhatChangedStrip
 * -----------------
 * Compact dashboard section that auto-loads the two latest snapshots for
 * the active portfolio and shows a high-level summary of what changed.
 *
 * Shows:
 *   - Portfolio value delta
 *   - Holdings added / removed count
 *   - Biggest single weight change
 *   - Latest snapshot timestamp
 *   - Link to full /changes page
 *
 * Renders nothing if fewer than 2 snapshots exist, to avoid visual noise.
 */

'use client'

import React from 'react'
import Link from 'next/link'
import {
  GitCompare, TrendingUp, TrendingDown, Plus, Minus,
  Clock, ArrowRight, Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePortfolioStore }  from '@/store/portfolioStore'
import { useSnapshots }       from '@/hooks/useSnapshots'
import { useDelta }           from '@/hooks/useDelta'
import { formatWeightDelta }  from '@/lib/delta'

function formatCurrency(v: number | null): string {
  if (v == null) return '—'
  const abs = Math.abs(v)
  const sign = v >= 0 ? '+' : '−'
  if (abs >= 1_00_00_000) return `${sign}₹${(abs / 1_00_00_000).toFixed(1)} Cr`
  if (abs >= 1_00_000)    return `${sign}₹${(abs / 1_00_000).toFixed(1)} L`
  return `${sign}₹${abs.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}

function formatRelativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins  = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days  = Math.floor(diff / 86_400_000)
  if (mins  < 1)   return 'just now'
  if (mins  < 60)  return `${mins}m ago`
  if (hours < 24)  return `${hours}h ago`
  if (days  < 7)   return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
}

interface ChipProps {
  icon:     React.ElementType
  label:    string
  value:    React.ReactNode
  positive?: boolean | null
}

function Chip({ icon: Icon, label, value, positive }: ChipProps) {
  return (
    <div className={cn(
      'flex items-center gap-2 rounded-lg px-3 py-2 border',
      positive === true  ? 'border-emerald-200 bg-emerald-50  dark:border-emerald-700 dark:bg-emerald-900/20'  :
      positive === false ? 'border-rose-200    bg-rose-50     dark:border-rose-700    dark:bg-rose-900/20'     :
                           'border-slate-200   bg-white       dark:border-slate-700   dark:bg-slate-800',
    )}>
      <Icon className={cn(
        'h-3.5 w-3.5 shrink-0',
        positive === true  ? 'text-emerald-500' :
        positive === false ? 'text-rose-500'    : 'text-slate-400',
      )} />
      <div>
        <p className="text-[10px] text-slate-400 leading-none uppercase tracking-wide">{label}</p>
        <p className={cn(
          'text-sm font-semibold tabular-nums leading-tight mt-0.5',
          positive === true  ? 'text-emerald-600 dark:text-emerald-400' :
          positive === false ? 'text-rose-500    dark:text-rose-400'    :
                               'text-slate-700   dark:text-slate-200',
        )}>
          {value}
        </p>
      </div>
    </div>
  )
}

export function WhatChangedStrip(): React.ReactElement | null {
  const { activePortfolioId } = usePortfolioStore()
  const { snapshots, loading } = useSnapshots(activePortfolioId)

  // Use two latest snapshots (snapshots are newest-first)
  const toId   = snapshots.length >= 2 ? snapshots[0].id   : null
  const fromId = snapshots.length >= 2 ? snapshots[1].id   : null
  const latest = snapshots[0] ?? null

  const { delta, loading: deltaLoading } = useDelta(fromId, toId)

  // Don't render if <2 snapshots — avoids noise on fresh portfolios
  if (!loading && snapshots.length < 2) return null

  if (loading || deltaLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-400 py-2">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading change summary…
      </div>
    )
  }

  if (!delta) return null

  const valuePositive = (delta.total_value_delta ?? 0) >= 0

  // Biggest weight mover (excluding added/removed which have no weight_a)
  const biggestMover = delta.holding_deltas
    .filter((h) => h.status === 'increased' || h.status === 'decreased')
    .sort((a, b) => Math.abs(b.weight_delta ?? 0) - Math.abs(a.weight_delta ?? 0))[0]

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <GitCompare className="h-4 w-4 text-indigo-500" />
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            What Changed
          </h3>
          {latest && (
            <span className="flex items-center gap-1 text-[10px] text-slate-400">
              <Clock className="h-3 w-3" />
              {formatRelativeDate(latest.captured_at)}
            </span>
          )}
        </div>
        <Link
          href="/changes"
          className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
        >
          Full comparison <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {/* Chips row */}
      <div className="flex flex-wrap gap-2">
        {/* Value change */}
        <Chip
          icon={valuePositive ? TrendingUp : TrendingDown}
          label="Value Δ"
          value={formatCurrency(delta.total_value_delta)}
          positive={delta.total_value_delta != null ? valuePositive : null}
        />

        {/* Added */}
        {delta.added_tickers.length > 0 && (
          <Chip
            icon={Plus}
            label="Added"
            value={`${delta.added_tickers.length} holding${delta.added_tickers.length !== 1 ? 's' : ''}`}
            positive={true}
          />
        )}

        {/* Removed */}
        {delta.removed_tickers.length > 0 && (
          <Chip
            icon={Minus}
            label="Removed"
            value={`${delta.removed_tickers.length} holding${delta.removed_tickers.length !== 1 ? 's' : ''}`}
            positive={false}
          />
        )}

        {/* Biggest mover */}
        {biggestMover && (
          <Chip
            icon={biggestMover.status === 'increased' ? TrendingUp : TrendingDown}
            label={biggestMover.ticker.replace(/\.(NS|BSE|BO)$/i, '')}
            value={formatWeightDelta(biggestMover.weight_delta)}
            positive={biggestMover.status === 'increased' ? true : false}
          />
        )}

        {/* Unchanged count */}
        {delta.unchanged_tickers.length > 0 && (
          <Chip
            icon={GitCompare}
            label="Unchanged"
            value={`${delta.unchanged_tickers.length}`}
            positive={null}
          />
        )}
      </div>
    </div>
  )
}
