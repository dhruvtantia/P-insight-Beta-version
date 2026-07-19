'use client'

/**
 * WatchlistTable — main watchlist data grid
 * -------------------------------------------
 * Columns: Ticker | Name | Tag | Sector | Live ₹ | Target ₹ | Notes | Added | Simulate | Delete
 *
 * Props changes vs original:
 *   - livePrices, lastFetchAt, yfinanceAvailable: accepted as props (lifted to page)
 *   - onSelect: called when a row is clicked; updates detail panel in parent
 *   - selectedTicker: highlights the currently-selected row (controlled by page)
 *
 * Design decisions:
 *   - Rows are fully clickable — clicking anywhere calls onSelect(ticker)
 *   - Selected row gets a subtle indigo highlight
 *   - Simulate/delete buttons stopPropagation so clicks don't also trigger selection
 *   - Sort columns: Ticker, Tag, Sector, Live Price, Target Price, Added Date
 */

import { useState, useMemo }                     from 'react'
import { useRouter }                              from 'next/navigation'
import { Trash2, ChevronUp, ChevronDown, ChevronsUpDown, GitFork, Clock } from 'lucide-react'
import { WatchlistTagBadge }                      from './WatchlistTagBadge'
import { SECTOR_COLORS, DEFAULT_SECTOR_COLOR }    from '@/constants'
import { cn }                                     from '@/lib/utils'
import type { Holding, WatchlistItem }            from '@/types'
import type { WatchlistQuoteHealth }              from '@/hooks/useWatchlistPrices'

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

function priceStatusLabel(status: Holding['price_status'] | undefined, fallback = 'Unavailable') {
  if (status === 'missing') return 'Missing'
  if (status === 'provider_failed') return 'Failed'
  if (status === 'stale') return 'Stale'
  if (status === 'pending') return 'Pending'
  if (status === 'unknown') return 'Unknown'
  return fallback
}

function priceStatusClass(status: Holding['price_status'] | undefined) {
  if (status === 'provider_failed') return 'border-red-200 bg-red-50 text-red-700'
  if (status === 'missing') return 'border-amber-200 bg-amber-50 text-amber-700'
  return 'border-slate-200 bg-slate-50 text-slate-500'
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  items:              WatchlistItem[]
  onRemove:           (ticker: string) => void
  removing?:          string | null
  /** Live price map — lifted from page so detail panel can share the same data */
  livePrices:         Record<string, number>
  quoteLoading:       boolean
  quoteHealth:        WatchlistQuoteHealth
  isDegraded:         boolean
  isUnavailable:      boolean
  missingTickers:     string[]
  statusByTicker:     Record<string, Holding['price_status']>
  priceTimestamps:    Record<string, string>
  lastFetchAt:        Date | null
  yfinanceAvailable:  boolean
  /** Called when the user clicks a row — parent should update its selectedTicker */
  onSelect?:          (ticker: string) => void
  /** Which row to highlight — controlled by parent */
  selectedTicker?:    string | null
}

export function WatchlistTable({
  items,
  onRemove,
  removing,
  livePrices,
  quoteLoading,
  quoteHealth,
  isDegraded,
  isUnavailable,
  missingTickers,
  statusByTicker,
  priceTimestamps,
  lastFetchAt,
  yfinanceAvailable,
  onSelect,
  selectedTicker,
}: Props) {
  const router = useRouter()
  const [sortKey, setSortKey]         = useState<SortKey>('added_at')
  const [sortAsc, setSortAsc]         = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc((p) => !p)
    } else {
      setSortKey(key)
      setSortAsc(key === 'ticker' || key === 'tag' || key === 'sector')
    }
  }

  function getTickerPrice(ticker: string) {
    return livePrices[ticker] ?? livePrices[ticker.toUpperCase()]
  }

  function getTickerStatus(ticker: string) {
    return statusByTicker[ticker] ?? statusByTicker[ticker.toUpperCase()]
  }

  function sortableLivePrice(ticker: string) {
    const price = getTickerPrice(ticker)
    const status = getTickerStatus(ticker)
    const isLive = price !== undefined && quoteHealth !== 'failed' && (
      status === 'live' || (status === undefined && quoteHealth === 'ready')
    )
    return isLive ? price : -Infinity
  }

  const sorted = useMemo(() => {
    return [...items].sort((a, b) => {
      let cmp = 0
      if (sortKey === 'ticker')       cmp = a.ticker.localeCompare(b.ticker)
      if (sortKey === 'tag')          cmp = (a.tag ?? 'General').localeCompare(b.tag ?? 'General')
      if (sortKey === 'added_at')     cmp = new Date(a.added_at).getTime() - new Date(b.added_at).getTime()
      if (sortKey === 'sector')       cmp = (a.sector ?? '').localeCompare(b.sector ?? '')
      if (sortKey === 'target_price') cmp = (a.target_price ?? -Infinity) - (b.target_price ?? -Infinity)
      if (sortKey === 'live_price')   cmp = sortableLivePrice(a.ticker) - sortableLivePrice(b.ticker)
      return sortAsc ? cmp : -cmp
    })
  }, [items, sortKey, sortAsc, livePrices, quoteHealth, statusByTicker])

  function handleDeleteClick(e: React.MouseEvent, ticker: string) {
    e.stopPropagation()   // prevent row-selection click
    if (confirmDelete === ticker) {
      onRemove(ticker)
      setConfirmDelete(null)
    } else {
      setConfirmDelete(ticker)
      setTimeout(() => setConfirmDelete((prev) => prev === ticker ? null : prev), 3000)
    }
  }

  function handleSimulateClick(e: React.MouseEvent, ticker: string) {
    e.stopPropagation()   // prevent row-selection click
    router.push(`/simulate?add=${encodeURIComponent(ticker)}`)
  }

  if (items.length === 0) return null

  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Watchlist</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            {items.length} stock{items.length !== 1 ? 's' : ''} tracked
            {onSelect && (
              <span className="ml-1 text-indigo-400">· click a row to inspect</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastFetchAt && (
            <div className={cn(
              'hidden sm:flex items-center gap-1 text-[10px]',
              isDegraded ? 'text-amber-600' : 'text-slate-400',
            )}>
              <Clock className="h-3 w-3" />
              <span>{quoteHealth === 'failed' ? 'Stale prices' : 'Prices'} {lastFetchAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          )}
          <p className="text-[11px] text-slate-400 hidden sm:block">Click headers to sort</p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-slate-50/80 border-b border-slate-100">
              <Th label="Ticker"   sortKey="ticker"       current={sortKey} asc={sortAsc} onSort={handleSort} className="w-[120px] text-left" />
              <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">Name</th>
              <Th label="Tag"      sortKey="tag"          current={sortKey} asc={sortAsc} onSort={handleSort} className="w-[130px] text-left" />
              <Th label="Sector"   sortKey="sector"       current={sortKey} asc={sortAsc} onSort={handleSort} className="text-left" />
              <Th label="Live ₹"   sortKey="live_price"   current={sortKey} asc={sortAsc} onSort={handleSort} className="w-[110px]" align="right" />
              <Th label="Target ₹" sortKey="target_price" current={sortKey} asc={sortAsc} onSort={handleSort} className="w-[110px]" align="right" />
              <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide w-[200px]">Notes</th>
              <Th label="Added"    sortKey="added_at"     current={sortKey} asc={sortAsc} onSort={handleSort} className="w-[80px] text-left" />
              <th className="px-4 py-3 w-[36px]" title="Open in simulator" />
              <th className="px-4 py-3 w-[60px]" />
            </tr>
          </thead>

          <tbody>
            {sorted.map((item, idx) => {
              const sectorColor = SECTOR_COLORS[item.sector ?? ''] ?? DEFAULT_SECTOR_COLOR
              const isRemoving  = removing === item.ticker
              const isConfirm   = confirmDelete === item.ticker
              const isSelected  = selectedTicker === item.ticker

              return (
                <tr
                  key={item.ticker}
                  onClick={() => onSelect?.(item.ticker)}
                  className={cn(
                    'border-b border-slate-50 transition-colors',
                    isRemoving    ? 'opacity-40 pointer-events-none' : '',
                    onSelect      ? 'cursor-pointer' : '',
                    isSelected
                      ? 'bg-indigo-50/70 border-l-2 border-l-indigo-400'
                      : idx % 2 === 0
                        ? 'bg-white hover:bg-slate-50/60'
                        : 'bg-slate-50/20 hover:bg-slate-50/60',
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
                    <span className="truncate block">
                      {item.name ?? <span className="text-slate-300 italic">Not set</span>}
                    </span>
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
                      const ticker = item.ticker.toUpperCase()
                      const lp = getTickerPrice(item.ticker)
                      const status = getTickerStatus(item.ticker)
                      const timestamp = priceTimestamps[item.ticker] ?? priceTimestamps[ticker]
                      const isMissing = missingTickers.includes(ticker)
                      const isLivePrice = lp !== undefined && quoteHealth !== 'failed' && (
                        status === 'live' || (status === undefined && quoteHealth === 'ready')
                      )

                      if (!yfinanceAvailable || quoteHealth === 'unavailable') return (
                        <span className="inline-flex rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700" title="Live quote provider unavailable">
                          Unavailable
                        </span>
                      )
                      if (isLivePrice) return (
                        <span
                          className="font-semibold text-emerald-700"
                          title={timestamp ? `Live quote fetched ${new Date(timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}` : 'Live quote'}
                        >
                          ₹{lp.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      )
                      if (lp !== undefined && quoteHealth === 'failed') return (
                        <span className="inline-flex flex-col items-end leading-tight" title="Quote refresh failed; showing last successful price">
                          <span className="font-semibold text-amber-700">
                            ₹{lp.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                          <span className="text-[9px] font-semibold uppercase text-amber-600">Stale</span>
                        </span>
                      )
                      if (quoteLoading && quoteHealth === 'loading') {
                        return <span className="text-slate-300 text-[10px] italic">Loading…</span>
                      }
                      return (
                        <span className={cn(
                          'inline-flex rounded border px-1.5 py-0.5 text-[10px] font-semibold',
                          priceStatusClass(status),
                        )}>
                          {priceStatusLabel(status, isMissing ? 'Missing' : isUnavailable ? 'Failed' : 'Unavailable')}
                        </span>
                      )
                    })()}
                  </td>

                  {/* Target Price */}
                  <td className="px-4 py-3 text-right tabular-nums text-xs">
                    {item.target_price !== null
                      ? <span className="font-semibold text-slate-700">
                          ₹{item.target_price.toLocaleString('en-IN')}
                        </span>
                      : <span className="text-slate-300">—</span>
                    }
                  </td>

                  {/* Notes */}
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
                      onClick={(e) => handleSimulateClick(e, item.ticker)}
                      title="Open in simulator"
                      className="text-slate-300 hover:text-indigo-500 hover:bg-indigo-50 rounded-md p-1 transition-colors"
                    >
                      <GitFork className="h-3.5 w-3.5" />
                    </button>
                  </td>

                  {/* Delete */}
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={(e) => handleDeleteClick(e, item.ticker)}
                      disabled={isRemoving}
                      title={isConfirm ? 'Click again to confirm delete' : 'Remove from watchlist'}
                      className={cn(
                        'rounded-md px-2 py-1 text-[11px] font-medium transition-all',
                        isConfirm
                          ? 'bg-red-100 text-red-700 border border-red-200 hover:bg-red-200'
                          : 'text-slate-400 hover:text-red-500 hover:bg-red-50',
                      )}
                    >
                      {isConfirm
                        ? <span className="whitespace-nowrap">Confirm?</span>
                        : <Trash2 className="h-4 w-4" />
                      }
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
        className,
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
