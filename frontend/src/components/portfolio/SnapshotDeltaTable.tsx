/**
 * SnapshotDeltaTable
 * -------------------
 * Sortable table of per-holding changes between two snapshots.
 * Columns: Status | Ticker | Weight (from → to) | Weight Δ | Value Δ | Sector
 *
 * Default sort: by priority (added/removed first) then by |weight_delta| desc.
 * Can be filtered to show only changed holdings.
 */

'use client'

import React, { useState, useMemo } from 'react'
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DeltaBadge } from '@/components/common/DeltaBadge'
import { statusLabel, statusColor, formatWeightDelta, formatValueDelta } from '@/lib/delta'
import type { HoldingDelta, PortfolioDelta } from '@/types'

type SortKey = 'status' | 'ticker' | 'weight_delta' | 'value_delta' | 'sector'
type SortDir = 'asc' | 'desc'

const STATUS_PRIORITY: Record<HoldingDelta['status'], number> = {
  added:     0,
  removed:   1,
  increased: 2,
  decreased: 3,
  unchanged: 4,
}

function SortIcon({ col, sort }: { col: SortKey; sort: { key: SortKey; dir: SortDir } }) {
  if (sort.key !== col) return <ArrowUpDown className="h-3 w-3 text-slate-300 ml-1 inline" />
  return sort.dir === 'asc'
    ? <ArrowUp   className="h-3 w-3 text-indigo-500 ml-1 inline" />
    : <ArrowDown className="h-3 w-3 text-indigo-500 ml-1 inline" />
}

function Th({
  label, col, sort, onSort, align = 'left',
}: {
  label: string; col: SortKey
  sort: { key: SortKey; dir: SortDir }
  onSort: (k: SortKey) => void
  align?: 'left' | 'right'
}) {
  return (
    <th
      className={cn(
        'py-2.5 px-3 text-[10px] font-bold uppercase tracking-wider text-slate-500',
        'cursor-pointer select-none hover:text-slate-700 transition-colors whitespace-nowrap',
        align === 'right' ? 'text-right' : 'text-left',
      )}
      onClick={() => onSort(col)}
    >
      {label}
      <SortIcon col={col} sort={sort} />
    </th>
  )
}

interface SnapshotDeltaTableProps {
  delta:          PortfolioDelta
  showUnchanged?: boolean
  className?:     string
}

export function SnapshotDeltaTable({
  delta,
  showUnchanged = false,
  className,
}: SnapshotDeltaTableProps): React.ReactElement {
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({
    key: 'status', dir: 'asc',
  })
  const [showAll, setShowAll] = useState(showUnchanged)

  const handleSort = (key: SortKey) => {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: key === 'ticker' || key === 'sector' || key === 'status' ? 'asc' : 'desc' }
    )
  }

  const rows = useMemo(() => {
    let items = showAll
      ? delta.holding_deltas
      : delta.holding_deltas.filter((h) => h.status !== 'unchanged')

    items = [...items].sort((a, b) => {
      let cmp = 0
      switch (sort.key) {
        case 'status':
          cmp = STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status]
          if (cmp === 0) cmp = Math.abs(b.weight_delta ?? 0) - Math.abs(a.weight_delta ?? 0)
          break
        case 'ticker':
          cmp = a.ticker.localeCompare(b.ticker)
          break
        case 'weight_delta':
          cmp = (Math.abs(b.weight_delta ?? 0)) - (Math.abs(a.weight_delta ?? 0))
          break
        case 'value_delta':
          cmp = (Math.abs(b.value_delta ?? 0)) - (Math.abs(a.value_delta ?? 0))
          break
        case 'sector':
          cmp = (a.sector ?? '').localeCompare(b.sector ?? '')
          break
      }
      return sort.dir === 'asc' ? cmp : -cmp
    })

    return items
  }, [delta.holding_deltas, sort, showAll])

  const changedCount  = delta.holding_deltas.filter((h) => h.status !== 'unchanged').length
  const totalCount    = delta.holding_deltas.length

  return (
    <div className={cn('space-y-2', className)}>
      {/* Controls */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">
          {changedCount} changed · {totalCount} total
        </p>
        <button
          onClick={() => setShowAll((v) => !v)}
          className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
        >
          {showAll ? 'Hide unchanged' : 'Show all holdings'}
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700">
            <tr>
              <th className="py-2.5 px-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Status
              </th>
              <Th label="Ticker"    col="ticker"       sort={sort} onSort={handleSort} />
              <th className="py-2.5 px-3 text-right text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Weight (Before → After)
              </th>
              <Th label="Weight Δ"  col="weight_delta" sort={sort} onSort={handleSort} align="right" />
              <Th label="Value Δ"   col="value_delta"  sort={sort} onSort={handleSort} align="right" />
              <Th label="Sector"    col="sector"       sort={sort} onSort={handleSort} />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-sm text-slate-400">
                  No changes to display.
                </td>
              </tr>
            ) : rows.map((h) => (
              <tr key={h.ticker} className={cn(
                'transition-colors',
                h.status === 'added'   && 'bg-emerald-50/40  dark:bg-emerald-900/10',
                h.status === 'removed' && 'bg-rose-50/40      dark:bg-rose-900/10',
              )}>
                {/* Status badge */}
                <td className="py-2 px-3">
                  <DeltaBadge
                    status={h.status as 'added' | 'removed' | 'increased' | 'decreased' | 'unchanged'}
                    variant="raw"
                    label={statusLabel(h.status as 'added' | 'removed' | 'increased' | 'decreased' | 'unchanged')}
                    size="xs"
                  />
                </td>

                {/* Ticker + name */}
                <td className="py-2 px-3">
                  <p className="font-semibold text-slate-700 dark:text-slate-200">
                    {h.ticker.replace(/\.(NS|BSE|BO)$/i, '')}
                  </p>
                  {h.name && (
                    <p className="text-[10px] text-slate-400 truncate max-w-[120px]">{h.name}</p>
                  )}
                </td>

                {/* Weight before → after */}
                <td className="py-2 px-3 text-right text-xs text-slate-500 tabular-nums whitespace-nowrap">
                  {h.weight_before != null ? `${h.weight_before.toFixed(1)}%` : '—'}
                  <span className="text-slate-300 mx-1">→</span>
                  {h.weight_after != null ? `${h.weight_after.toFixed(1)}%` : '—'}
                </td>

                {/* Weight delta */}
                <td className="py-2 px-3 text-right">
                  {h.weight_delta != null && Math.abs(h.weight_delta) >= 0.05 ? (
                    <DeltaBadge
                      value={h.weight_delta}
                      variant="weight"
                      size="xs"
                    />
                  ) : (
                    <span className="text-[10px] text-slate-300">—</span>
                  )}
                </td>

                {/* Value delta */}
                <td className="py-2 px-3 text-right text-xs tabular-nums whitespace-nowrap">
                  {h.value_delta != null
                    ? <span className={statusColor(h.status as 'added' | 'removed' | 'increased' | 'decreased' | 'unchanged')}>
                        {formatValueDelta(h.value_delta)}
                      </span>
                    : <span className="text-slate-300">—</span>
                  }
                </td>

                {/* Sector */}
                <td className="py-2 px-3 text-xs text-slate-500">
                  {h.sector ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
