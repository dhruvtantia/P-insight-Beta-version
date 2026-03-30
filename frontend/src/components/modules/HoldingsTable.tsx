/**
 * HoldingsTable
 * --------------
 * Sortable, fully typed table of all portfolio holdings.
 *
 * Features:
 *   - Click any column header to sort ascending; click again to reverse
 *   - Default sort: Market Value descending (largest holding first)
 *   - Colour-coded P&L columns (green gain / red loss)
 *   - Sector shown as a colour-coded badge
 *   - Weight % shown with an inline mini-bar
 *   - Handles null current_price gracefully (shows em-dash)
 *   - Loading: renders skeleton rows
 *
 * Extension points (Phase 2):
 *   - Add onClick row handler to open holding detail drawer
 *   - Add column visibility toggle
 *   - Add CSV/Excel export button
 */

'use client'

import { useState, useMemo }              from 'react'
import { useRouter }                       from 'next/navigation'
import { ArrowUp, ArrowDown, ArrowUpDown,
         X, GitCompareArrows }            from 'lucide-react'
import { TooltipHelp }                    from '@/components/common/TooltipHelp'
import { formatCurrency, SECTOR_COLORS,
         DEFAULT_SECTOR_COLOR }           from '@/constants'
import { cn }                             from '@/lib/utils'
import type { Holding }                   from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

type SortKey =
  | 'ticker'
  | 'quantity'
  | 'average_cost'
  | 'current_price'
  | 'market_value'
  | 'pnl'
  | 'pnl_pct'
  | 'weight'

type SortDir = 'asc' | 'desc'

interface ColumnDef {
  key: SortKey | 'name' | 'sector'
  label: string
  sortable: boolean
  align: 'left' | 'right'
  tooltipMetric?: string
  tooltipText?: string
}

interface HoldingsTableProps {
  holdings:      Holding[]
  loading?:      boolean
  /** Max rows to display. Defaults to all. */
  limit?:        number
  /** Show a "View all →" link when limit is applied */
  showViewAll?:  boolean
  /** Filter rows to only show holdings in this sector */
  sectorFilter?: string | null
  /** Called when sector filter badge ✕ is clicked */
  onClearSectorFilter?: () => void
}

// ─── Column definitions ───────────────────────────────────────────────────────

const COLUMNS: ColumnDef[] = [
  { key: 'ticker',        label: 'Ticker',        sortable: true,  align: 'left'  },
  { key: 'name',          label: 'Name',          sortable: false, align: 'left'  },
  { key: 'sector',        label: 'Sector',        sortable: false, align: 'left'  },
  { key: 'quantity',      label: 'Qty',           sortable: true,  align: 'right' },
  { key: 'average_cost',  label: 'Avg Cost',      sortable: true,  align: 'right',
    tooltipText: 'The average price at which you purchased this holding.' },
  { key: 'current_price', label: 'CMP',           sortable: true,  align: 'right',
    tooltipText: 'Current Market Price — the latest available price for this stock.' },
  { key: 'market_value',  label: 'Mkt Value',     sortable: true,  align: 'right',
    tooltipText: 'Current Market Price × Quantity held.' },
  { key: 'pnl',           label: 'P&L (₹)',       sortable: true,  align: 'right',
    tooltipText: 'Profit or loss in absolute rupee terms — (Current Price − Avg Cost) × Quantity.' },
  { key: 'pnl_pct',       label: 'P&L %',         sortable: true,  align: 'right',
    tooltipText: 'Percentage return — (Current Price − Avg Cost) ÷ Avg Cost × 100.' },
  { key: 'weight',        label: 'Wt %',          sortable: true,  align: 'right',
    tooltipText: 'This holding\'s share of the total portfolio value.' },
]

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i} className="animate-pulse border-b border-slate-50">
          {COLUMNS.map((col) => (
            <td key={col.key} className="px-4 py-3">
              <div
                className="h-3 rounded bg-slate-100"
                style={{ width: col.align === 'right' ? '70%' : '85%', marginLeft: col.align === 'right' ? 'auto' : undefined }}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}

// ─── Sort Icon ────────────────────────────────────────────────────────────────

function SortIcon({ columnKey, sortKey, sortDir }: { columnKey: string; sortKey: string; sortDir: SortDir }) {
  if (columnKey !== sortKey) return <ArrowUpDown className="h-3 w-3 text-slate-300 ml-1 shrink-0" />
  return sortDir === 'asc'
    ? <ArrowUp className="h-3 w-3 text-indigo-500 ml-1 shrink-0" />
    : <ArrowDown className="h-3 w-3 text-indigo-500 ml-1 shrink-0" />
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function HoldingsTable({
  holdings,
  loading = false,
  limit,
  showViewAll = false,
  sectorFilter,
  onClearSectorFilter,
}: HoldingsTableProps) {
  const router                          = useRouter()
  const [sortKey, setSortKey]           = useState<SortKey>('market_value')
  const [sortDir, setSortDir]           = useState<SortDir>('desc')

  // ── Sort handler ───────────────────────────────────────────────────────────
  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  // ── Sector-filtered + sorted + limited rows ────────────────────────────────
  const displayedHoldings = useMemo(() => {
    let list = sectorFilter
      ? holdings.filter((h) => h.sector === sectorFilter)
      : holdings

    const sorted = [...list].sort((a, b) => {
      const av = a[sortKey] ?? -Infinity
      const bv = b[sortKey] ?? -Infinity
      if (typeof av === 'string' && typeof bv === 'string') {
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
      }
      return sortDir === 'asc'
        ? (av as number) - (bv as number)
        : (bv as number) - (av as number)
    })

    return limit ? sorted.slice(0, limit) : sorted
  }, [holdings, sortKey, sortDir, limit, sectorFilter])

  const isTruncated    = limit !== undefined && holdings.length > limit
  const filteredCount  = sectorFilter ? holdings.filter((h) => h.sector === sectorFilter).length : holdings.length

  return (
    <div className="card overflow-hidden">
      {/* Card header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-sm font-semibold text-slate-800">Holdings</h3>
          {!loading && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
              {sectorFilter ? filteredCount : holdings.length}
              {sectorFilter && <span className="text-slate-400"> / {holdings.length}</span>}
            </span>
          )}
          {/* Active sector filter chip */}
          {sectorFilter && (
            <span className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
              {sectorFilter}
              {onClearSectorFilter && (
                <button
                  onClick={onClearSectorFilter}
                  className="ml-0.5 rounded-full hover:bg-indigo-200 transition-colors p-0.5"
                  title="Clear sector filter"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              )}
            </span>
          )}
        </div>
        {showViewAll && isTruncated && (
          <a
            href="/holdings"
            className="text-xs font-medium text-indigo-600 hover:text-indigo-800 transition-colors shrink-0"
          >
            View all {holdings.length} →
          </a>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/80">
              <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-400 w-8">#</th>
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    'px-4 py-3 text-[11px] font-semibold text-slate-500 whitespace-nowrap select-none',
                    col.align === 'right' && 'text-right',
                    col.sortable && 'cursor-pointer hover:text-slate-800 hover:bg-slate-100 transition-colors'
                  )}
                  onClick={col.sortable ? () => handleSort(col.key as SortKey) : undefined}
                >
                  <span className={cn('inline-flex items-center gap-0.5', col.align === 'right' && 'justify-end w-full')}>
                    {col.label}
                    {(col.tooltipText || col.tooltipMetric) && (
                      <TooltipHelp text={col.tooltipText} metric={col.tooltipMetric} />
                    )}
                    {col.sortable && (
                      <SortIcon columnKey={col.key} sortKey={sortKey} sortDir={sortDir} />
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-50">
            {loading ? (
              <TableSkeleton rows={8} />
            ) : displayedHoldings.length === 0 ? (
              <tr>
                <td
                  colSpan={COLUMNS.length + 1}
                  className="px-4 py-12 text-center text-sm text-slate-400"
                >
                  No holdings found.
                </td>
              </tr>
            ) : (
              displayedHoldings.map((h, index) => {
                const pnlPositive = (h.pnl ?? 0) >= 0
                const sectorColor = SECTOR_COLORS[h.sector ?? ''] ?? DEFAULT_SECTOR_COLOR

                return (
                  <tr
                    key={h.ticker}
                    className="hover:bg-indigo-50/30 transition-colors group cursor-pointer"
                    onClick={() => router.push(`/peers?ticker=${encodeURIComponent(h.ticker)}`)}
                    title={`Compare ${h.ticker} against peers →`}
                  >
                    {/* Row number */}
                    <td className="px-4 py-3 text-[11px] text-slate-300 tabular-nums font-medium">
                      {index + 1}
                    </td>

                    {/* Ticker + compare hint */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs font-bold text-indigo-700 tracking-wide">
                          {h.ticker.replace(/\.(NS|BSE|BO)$/i, '')}
                          <span className="text-slate-300 font-normal">.NS</span>
                        </span>
                        <GitCompareArrows className="h-3 w-3 text-slate-200 group-hover:text-indigo-400 transition-colors shrink-0" />
                      </div>
                    </td>

                    {/* Name */}
                    <td className="px-4 py-3 max-w-[180px]">
                      <span className="text-xs text-slate-700 truncate block" title={h.name}>
                        {h.name}
                      </span>
                    </td>

                    {/* Sector badge */}
                    <td className="px-4 py-3">
                      <span
                        className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium text-white whitespace-nowrap"
                        style={{ backgroundColor: sectorColor }}
                      >
                        {h.sector ?? 'Unknown'}
                      </span>
                    </td>

                    {/* Quantity */}
                    <td className="px-4 py-3 text-xs text-slate-600 text-right tabular-nums">
                      {h.quantity.toLocaleString('en-IN')}
                    </td>

                    {/* Avg Cost */}
                    <td className="px-4 py-3 text-xs text-slate-600 text-right tabular-nums">
                      {formatCurrency(h.average_cost)}
                    </td>

                    {/* Current Price */}
                    <td className="px-4 py-3 text-xs text-slate-800 text-right tabular-nums font-medium">
                      {h.current_price !== null ? formatCurrency(h.current_price) : <span className="text-slate-300">—</span>}
                    </td>

                    {/* Market Value */}
                    <td className="px-4 py-3 text-xs text-slate-800 text-right tabular-nums font-semibold">
                      {h.market_value !== undefined ? formatCurrency(h.market_value) : '—'}
                    </td>

                    {/* P&L ₹ */}
                    <td className={cn(
                      'px-4 py-3 text-xs text-right tabular-nums font-semibold',
                      pnlPositive ? 'text-emerald-600' : 'text-red-500'
                    )}>
                      {h.pnl !== undefined
                        ? (pnlPositive ? '+' : '') + formatCurrency(h.pnl)
                        : '—'}
                    </td>

                    {/* P&L % */}
                    <td className={cn(
                      'px-4 py-3 text-xs text-right tabular-nums font-bold',
                      pnlPositive ? 'text-emerald-600' : 'text-red-500'
                    )}>
                      <span className="inline-flex items-center justify-end gap-0.5">
                        {h.pnl_pct !== undefined ? (
                          <>
                            <span>{pnlPositive ? '▲' : '▼'}</span>
                            <span>{Math.abs(h.pnl_pct).toFixed(2)}%</span>
                          </>
                        ) : '—'}
                      </span>
                    </td>

                    {/* Weight % with mini-bar */}
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <span className="text-xs text-slate-600 tabular-nums w-10 text-right">
                          {h.weight !== undefined ? `${h.weight.toFixed(1)}%` : '—'}
                        </span>
                        <div className="w-10 h-1.5 rounded-full bg-slate-100 overflow-hidden hidden sm:block">
                          <div
                            className="h-full rounded-full bg-indigo-400 transition-all duration-500"
                            style={{ width: `${Math.min(h.weight ?? 0, 100)}%` }}
                          />
                        </div>
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>

          {/* Footer: totals row */}
          {!loading && holdings.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-slate-200 bg-slate-50/80">
                <td colSpan={4} className="px-4 py-3 text-xs font-bold text-slate-700">
                  Total · {holdings.length} holdings
                </td>
                <td className="px-4 py-3" />
                <td className="px-4 py-3" />
                <td className="px-4 py-3" />
                <td className="px-4 py-3 text-xs font-bold text-slate-800 text-right tabular-nums">
                  {formatCurrency(holdings.reduce((s, h) => s + (h.market_value ?? 0), 0))}
                </td>
                <td className={cn(
                  'px-4 py-3 text-xs font-bold text-right tabular-nums',
                  holdings.reduce((s, h) => s + (h.pnl ?? 0), 0) >= 0
                    ? 'text-emerald-600'
                    : 'text-red-500'
                )}>
                  {(() => {
                    const totalPnl = holdings.reduce((s, h) => s + (h.pnl ?? 0), 0)
                    return (totalPnl >= 0 ? '+' : '') + formatCurrency(totalPnl)
                  })()}
                </td>
                <td className="px-4 py-3" />
                <td className="px-4 py-3 text-xs font-bold text-slate-600 text-right">100%</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}
