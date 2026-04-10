'use client'

/**
 * WatchlistTable — main watchlist data grid
 * -------------------------------------------
 * Columns: Ticker | Name | Tag | Sector | Target Price | Notes | Added | Delete
 *
 * Design decisions:
 *   - Sector shown as colored dot (from SECTOR_COLORS) + name text
 *   - Notes column truncated at ~2 lines with a hover tooltip for full text
 *   - Target price displayed with ₹ prefix, "—" if null
 *   - Delete button shows a confirm state ("Click to confirm") on first click
 *     to prevent accidental removals
 *   - "Added" date shown as a relative label (Today, Yesterday, or date)
 *   - Sortable by: Ticker, Tag, Added Date (default: newest first)
 */

import { useState, useMemo }                     from 'react'
import { useRouter }                              from 'next/navigation'
import { Trash2, ChevronUp, ChevronDown, ChevronsUpDown, GitFork, Clock } from 'lucide-react'
import { WatchlistTagBadge }                      from './WatchlistTagBadge'
import { SECTOR_COLORS, DEFAULT_SECTOR_COLOR }    from '@/constants'
import { formatCurrency }                         from '@/constants'
import { cn }                                     from '@/lib/utils'
import type { WatchlistItem }                     from '@/types'
import { useWatchlistPrices }                     from '@/hooks/useWatchlistPrices'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relativeDate(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86_400_000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7)  return `${diffDays}d ago`
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })
}

type SortKey = 'ticker' | 'tag' | 'added_at' | 'sector' | 'target_price' | 'live_price'

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  items:        WatchlistItem[]
  onRemove:     (ticker: string) => void
  removing?:    string | null   // ticker currently being removed
}

export function WatchlistTable({ items, onRemove, removing }: Props) {
  const router = useRouter()
  const [sortKey, setSortKey]   = useState<SortKey>('added_at')
  const [sortAsc, setSortAsc]   = useState(false)            // newest first by default
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  // Live prices — auto-refresh every 60 s, independent of data mode
  const tickers = useMemo(() => items.map((i) => i.ticker), [items])
  const { prices: livePrices, lastFetchAt, yfinanceAvailable } = useWatchlistPrices(tickers)

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc((p) => !p)
    } else {
      setSortKey(key)
      // alpha sorts default ascending; date/numeric sorts default descending
      setSortAsc(key === 'ticker' || key === 'tag' || key === 'sector')
    }
  }

  const sorted = useMemo(() => {
    return [...items].sort((a, b) => {
      let cmp = 0
      if (sortKey === 'ticker')       cmp = a.ticker.localeCompare(b.ticker)
      if (sortKey === 'tag')          cmp = (a.tag ?? 'General').localeCompare(b.tag ?? 'General')
      if (sortKey === 'added_at')     cmp = new Date(a.added_at).getTime() - new Date(b.added_at).getTime()
      if (sortKey === 'sector')       cmp = (a.sector ?? '').localeCompare(b.sector ?? '')
      if (sortKey === 'target_price') cmp = (a.target_price ?? -Infinity) - (b.target_price ?? -Infinity)
      if (sortKey === 'live_price')   cmp = (livePrices[a.ticker] ?? -Infinity) - (livePrices[b.ticker] ?? -Infinity)
      return sortAsc ? cmp : -cmp
    })
  }, [items, sortKey, sortAsc, livePrices])

  function handleDeleteClick(ticker: string) {
    if (confirmDelete === ticker) {
      onRemove(ticker)
      setConfirmDelete(null)
    } else {
      setConfirmDelete(ticker)
      // Auto-cancel confirm state after 3 seconds
      setTimeout(() => setConfirmDelete((prev) => prev === ticker ? null : prev), 3000)
    }
  }

  if (items.length === 0) return null

  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Watchlist</h3>
          <p className="text-xs text-slate-400 mt-0.5">{items.length} stock{items.length !== 1 ? 's' : ''} tracked</p>
        </div>
        <div className="flex items-center gap-3">
          {lastFetchAt && yfinanceAvailable && (
            <div className="hidden sm:flex items-center gap-1 text-[10px] text-slate-400">
              <Clock className="h-3 w-3" />
              <span>Prices updated {lastFetchAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          )}
          <p className="text-[11px] text-slate-400 hidden sm:block">Click column headers to sort</p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-slate-50/80 border-b border-slate-100">
              {/* Ticker — sortable */}
              <Th label="Ticker" sortKey="ticker" current={sortKey} asc={sortAsc} onSort={handleSort}
                  className="w-[120px] text-left" />
              <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">
                Name
              </th>
              {/* Tag — sortable */}
              <Th label="Tag" sortKey="tag" current={sortKey} asc={sortAsc} onSort={handleSort}
                  className="w-[130px] text-left" />
              {/* Sector — sortable */}
              <Th label="Sector" sortKey="sector" current={sortKey} asc={sortAsc} onSort={handleSort}
                  className="text-left" />
              {/* Live Price — sortable */}
              <Th label="Live ₹" sortKey="live_price" current={sortKey} asc={sortAsc} onSort={handleSort}
                  className="w-[110px]" align="right" />
              {/* Target Price — sortable */}
              <Th label="Target ₹" sortKey="target_price" current={sortKey} asc={sortAsc} onSort={handleSort}
                  className="w-[110px]" align="right" />
              <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide w-[200px]">
                Notes
              </th>
              {/* Added — sortable */}
              <Th label="Added" sortKey="added_at" current={sortKey} asc={sortAsc} onSort={handleSort}
                  className="w-[80px] text-left" />
              <th className="px-4 py-3 w-[36px]" title="Open in simulator" />
              <th className="px-4 py-3 w-[60px]" />
            </tr>
          </thead>

          <tbody>
            {sorted.map((item, idx) => {
              const sectorColor = SECTOR_COLORS[item.sector ?? ''] ?? DEFAULT_SECTOR_COLOR
              const isRemoving  = removing === item.ticker
              const isConfirm   = confirmDelete === item.ticker

              return (
                <tr
                  key={item.ticker}
                  className={cn(
                    'border-b border-slate-50 transition-colors',
                    isRemoving ? 'opacity-40 pointer-events-none' : 'hover:bg-slate-50/60',
                    idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/20'
                  )}
                >
                  {/* Ticker */}
                  <td className="px-4 py-3">
                    <span className="font-mono font-bold text-indigo-700 text-[13px]">
                      {item.ticker.replace(/\.(NS|BSE|BO)$/i, '')}
                    </span>
                    <span className="text-[9px] text-slate-400 ml-0.5 font-normal font-mono">
                      {item.ticker.match(/\.(NS|BSE|BO)$/i)?.[0] ?? ''}
                    </span>
                  </td>

                  {/* Name */}
                  <td className="px-4 py-3 text-slate-600 text-xs max-w-[160px]">
                    <span className="truncate block">{item.name ?? <span className="text-slate-300 italic">Not set</span>}</span>
                  </td>

                  {/* Tag */}
                  <td className="px-4 py-3">
                    <WatchlistTagBadge tag={item.tag} size="sm" />
                  </td>

                  {/* Sector */}
                  <td className="px-4 py-3">
                    {item.sector ? (
                      <span className="flex items-center gap-1.5 text-xs text-slate-600 whitespace-nowrap">
                        <span className="h-2 w-2 rounded-full shrink-0" style={{ background: sectorColor }} />
                        {item.sector}
                      </span>
                    ) : (
                      <span className="text-slate-300 text-xs">—</span>
                    )}
                  </td>

                  {/* Live Price */}
                  <td className="px-4 py-3 text-right tabular-nums text-xs">
                    {(() => {
                      const lp = livePrices[item.ticker]
                      if (!yfinanceAvailable) {
                        return <span className="text-slate-300" title="yfinance unavailable">—</span>
                      }
                      if (lp !== undefined) {
                        return (
                          <span className="font-semibold text-emerald-700">
                            ₹{lp.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        )
                      }
                      return <span className="text-slate-300 text-[10px] italic">Loading…</span>
                    })()}
                  </td>

                  {/* Target Price */}
                  <td className="px-4 py-3 text-right tabular-nums text-xs">
                    {item.target_price !== null
                      ? <span className="font-semibold text-slate-700">₹{item.target_price.toLocaleString('en-IN')}</span>
                      : <span className="text-slate-300">—</span>
                    }
                  </td>

                  {/* Notes — truncated with title tooltip for full text */}
                  <td className="px-4 py-3 text-xs text-slate-500 max-w-[200px]">
                    {item.notes
                      ? <span
                          title={item.notes}
                          className="block overflow-hidden"
                          style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                        >
                          {item.notes}
                        </span>
                      : <span className="text-slate-300">—</span>
                    }
                  </td>

                  {/* Added date */}
                  <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">
                    {relativeDate(item.added_at)}
                  </td>

                  {/* Simulate */}
                  <td className="px-4 py-3">
                    <button
                      onClick={() => router.push(`/simulate?add=${encodeURIComponent(item.ticker)}`)}
                      title="Open in simulator"
                      className="text-slate-300 hover:text-indigo-500 hover:bg-indigo-50 rounded-md p-1 transition-colors"
                    >
                      <GitFork className="h-3.5 w-3.5" />
                    </button>
                  </td>

                  {/* Delete */}
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleDeleteClick(item.ticker)}
                      disabled={isRemoving}
                      title={isConfirm ? 'Click again to confirm delete' : 'Remove from watchlist'}
                      className={cn(
                        'rounded-md px-2 py-1 text-[11px] font-medium transition-all',
                        isConfirm
                          ? 'bg-red-100 text-red-700 border border-red-200 hover:bg-red-200'
                          : 'text-slate-400 hover:text-red-500 hover:bg-red-50'
                      )}
                    >
                      {isConfirm ? (
                        <span className="whitespace-nowrap">Confirm?</span>
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Sort-able header cell ─────────────────────────────────────────────────────

function Th({
  label, sortKey, current, asc, onSort, className, align = 'left'
}: {
  label: string
  sortKey: SortKey
  current: SortKey
  asc: boolean
  onSort: (k: SortKey) => void
  className?: string
  align?: 'left' | 'right'
}) {
  const active = current === sortKey
  return (
    <th
      onClick={() => onSort(sortKey)}
      className={cn(
        'px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wide',
        'cursor-pointer hover:text-slate-800 whitespace-nowrap select-none transition-colors',
        align === 'right' && 'text-right',
        active && 'text-indigo-700',
        className
      )}
    >
      <span className={cn('inline-flex items-center gap-1', align === 'right' && 'flex-row-reverse')}>
        {label}
        {active
          ? (asc ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)
          : <ChevronsUpDown className="h-3 w-3 text-slate-300" />
        }
      </span>
    </th>
  )
}
