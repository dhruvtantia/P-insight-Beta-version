/**
 * Watchlist Page — v2
 * ---------------------
 * Layout:
 *   1. Page header (title + item count + refresh)
 *   2. WatchlistForm      — add new item with StockSearchInput autocomplete
 *   3. WatchlistTable     — all items, sortable, selectable
 *      or EmptyWatchlistState
 *   4. WatchlistDetailPanel — shown when a row is selected; live price + stock info
 *
 * Key changes vs v1:
 *   - useWatchlistPrices lifted to page level so the detail panel shares the same
 *     price data without a second API call
 *   - selectedTicker state drives both the table row highlight and the detail panel
 *   - WatchlistTable receives prices as props (no internal hook call any more)
 *   - WatchlistForm uses StockSearchInput — autocomplete with dropdown
 *   - New stock is auto-selected after being added
 */

'use client'

import { useRef, useState, useMemo, useCallback }  from 'react'
import { useRouter }                               from 'next/navigation'
import { Star, RefreshCw, AlertCircle, GitFork,
         MessageCircle, X, TrendingUp,
         DollarSign, Tag, Info, Pencil, Check }    from 'lucide-react'
import { useWatchlist }                            from '@/hooks/useWatchlist'
import { useWatchlistPrices }                      from '@/hooks/useWatchlistPrices'
import { WatchlistForm }                           from '@/components/watchlist/WatchlistForm'
import { WatchlistTable }                          from '@/components/watchlist/WatchlistTable'
import { EmptyWatchlistState }                     from '@/components/watchlist/EmptyWatchlistState'
import { WatchlistTagBadge }                       from '@/components/watchlist/WatchlistTagBadge'
import { QuickActionBar }                          from '@/components/ui/QuickActionBar'
import { SECTOR_COLORS, DEFAULT_SECTOR_COLOR }     from '@/constants'
import type { WatchlistItemInput, WatchlistItem, WatchlistTag } from '@/types'
import { cn }                                      from '@/lib/utils'

export default function WatchlistPage() {
  const {
    items,
    loading,
    error,
    addItem,
    updateItem,
    removeItem,
    refetch,
    clearError,
  } = useWatchlist()

  // Lift prices to page level so both table + detail panel share them
  const tickers = useMemo(() => items.map((i) => i.ticker), [items])
  const { prices: livePrices, lastFetchAt, yfinanceAvailable } = useWatchlistPrices(tickers)

  const [submitting,     setSubmitting]  = useState(false)
  const [formError,      setFormError]   = useState<string | null>(null)
  const [removingTicker, setRemoving]    = useState<string | null>(null)
  const [selectedTicker, setSelected]    = useState<string | null>(null)

  const formRef   = useRef<HTMLDivElement>(null)
  const detailRef = useRef<HTMLDivElement>(null)

  // The full WatchlistItem for the currently selected ticker
  const selectedItem = useMemo(
    () => items.find((i) => i.ticker === selectedTicker) ?? null,
    [items, selectedTicker],
  )

  // ── Handlers ─────────────────────────────────────────────────────────────────

  async function handleAdd(payload: WatchlistItemInput) {
    setSubmitting(true)
    setFormError(null)
    try {
      await addItem(payload)
      // Auto-select the newly added stock so the detail panel shows immediately
      setSelected(payload.ticker.trim().toUpperCase())
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not add stock to watchlist.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleRemove(ticker: string) {
    setRemoving(ticker)
    if (selectedTicker === ticker) setSelected(null)
    try {
      await removeItem(ticker)
    } finally {
      setRemoving(null)
    }
  }

  function handleSelect(ticker: string) {
    // Toggle: clicking the selected row again deselects it
    setSelected((prev) => prev === ticker ? null : ticker)
    // Scroll detail panel into view (especially useful on mobile / narrow screens)
    setTimeout(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 60)
  }

  const handleUpdate = useCallback(async (ticker: string, updates: Parameters<typeof updateItem>[1]) => {
    await updateItem(ticker, updates)
  }, [updateItem])

  function scrollToForm() {
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 max-w-[1200px]">

      {/* ── 1. Page header ─────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Star className="h-5 w-5 text-amber-400" />
            <h1 className="text-lg font-bold text-slate-900">Watchlist</h1>
            {!loading && items.length > 0 && (
              <span className="ml-1 rounded-full bg-amber-50 border border-amber-200
                               px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                {items.length}
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500">
            Track stocks you're researching or considering for your portfolio.
            Search by ticker or company name — sector and name auto-fill on selection.
          </p>
        </div>

        <button
          onClick={refetch}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white
                     px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50
                     disabled:opacity-40 transition-colors shrink-0"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {/* ── Global error ────────────────────────────────────────────────────── */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-red-700">Failed to load watchlist</p>
              <p className="text-xs text-red-600 mt-0.5">{error}</p>
              <button
                onClick={() => { clearError(); refetch() }}
                className="mt-2 text-xs font-medium text-red-700 hover:text-red-900 underline"
              >
                Retry
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Quick actions ────────────────────────────────────────────────────── */}
      {items.length > 0 && (
        <QuickActionBar
          actions={[
            {
              icon: GitFork,
              label: 'Open in Simulator',
              description: 'Explore what adding a stock would do',
              href: '/simulate',
              color: 'violet',
            },
            {
              icon: MessageCircle,
              label: 'Ask Advisor',
              description: 'Get watchlist opportunities analysis',
              href: '/advisor?q=watchlist+opportunities',
              color: 'indigo',
            },
          ]}
        />
      )}

      {/* ── 2. Add form ─────────────────────────────────────────────────────── */}
      <div ref={formRef}>
        <WatchlistForm
          onAdd={handleAdd}
          submitting={submitting}
          error={formError}
          onClearError={() => setFormError(null)}
        />
      </div>

      {/* ── 3. Table or empty state ─────────────────────────────────────────── */}
      {loading ? (
        <LoadingSkeleton />
      ) : items.length === 0 ? (
        <div className="card overflow-hidden">
          <EmptyWatchlistState onStartAdding={scrollToForm} />
        </div>
      ) : (
        <WatchlistTable
          items={items}
          onRemove={handleRemove}
          removing={removingTicker}
          livePrices={livePrices}
          lastFetchAt={lastFetchAt}
          yfinanceAvailable={yfinanceAvailable}
          onSelect={handleSelect}
          selectedTicker={selectedTicker}
        />
      )}

      {/* ── 4. Detail panel (appears when a row is selected) ────────────────── */}
      {selectedItem && (
        <div ref={detailRef}>
          <WatchlistDetailPanel
            item={selectedItem}
            livePrice={livePrices[selectedItem.ticker]}
            yfinanceAvailable={yfinanceAvailable}
            onClose={() => setSelected(null)}
            onUpdate={handleUpdate}
          />
        </div>
      )}
    </div>
  )
}

// ─── Detail panel ─────────────────────────────────────────────────────────────

// Matches WatchlistUpdatePayload in useWatchlist — uses WatchlistItemInput fields
// (no nulls; omit a key to leave that field unchanged on the server)
type UpdatePayload = Partial<Pick<WatchlistItemInput, 'name' | 'tag' | 'sector' | 'target_price' | 'notes'>>

interface DetailPanelProps {
  item:              WatchlistItem
  livePrice?:        number
  yfinanceAvailable: boolean
  onClose:           () => void
  onUpdate:          (ticker: string, updates: UpdatePayload) => Promise<void>
}

const TAG_OPTIONS: WatchlistTag[] = ['General', 'High Conviction', 'Speculative', 'Income', 'Defensive', 'Research']

function WatchlistDetailPanel({ item, livePrice, yfinanceAvailable, onClose, onUpdate }: DetailPanelProps) {
  const router      = useRouter()
  const sectorColor = SECTOR_COLORS[item.sector ?? ''] ?? DEFAULT_SECTOR_COLOR
  const suffix      = item.ticker.match(/\.(NS|BSE|BO)$/i)?.[0] ?? ''
  const shortTicker = item.ticker.replace(/\.(NS|BSE|BO)$/i, '')

  // ── Edit mode state ───────────────────────────────────────────────────────
  const [editing,   setEditing]   = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [editTarget, setEditTarget] = useState<string>(item.target_price?.toString() ?? '')
  const [editNotes,  setEditNotes]  = useState<string>(item.notes ?? '')
  const [editTag,    setEditTag]    = useState<WatchlistTag>(item.tag ?? 'General')

  function startEdit() {
    setEditTarget(item.target_price?.toString() ?? '')
    setEditNotes(item.notes ?? '')
    setEditTag(item.tag ?? 'General')
    setEditing(true)
  }

  function cancelEdit() { setEditing(false) }

  async function saveEdit() {
    setSaving(true)
    const trimmedTarget = editTarget.trim()
    const parsedTarget  = trimmedTarget === '' ? undefined : parseFloat(trimmedTarget)
    const updates: UpdatePayload = { tag: editTag }
    if (parsedTarget !== undefined && !isNaN(parsedTarget)) updates.target_price = parsedTarget
    if (editNotes.trim()) updates.notes = editNotes.trim()
    await onUpdate(item.ticker, updates)
    setSaving(false)
    setEditing(false)
  }

  return (
    <div className="card overflow-hidden border-indigo-100 bg-gradient-to-br from-indigo-50/30 to-white">

      {/* Panel header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-indigo-100 bg-white/70">
        <div className="flex items-center gap-2">
          <Info className="h-4 w-4 text-indigo-400 shrink-0" />
          <span className="text-sm font-semibold text-slate-800">Stock Details</span>
          <span className="text-[11px] text-slate-400">— {item.ticker}</span>
        </div>
        <div className="flex items-center gap-1">
          {!editing && (
            <button
              onClick={startEdit}
              className="rounded-md p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
              title="Edit"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            title="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">

        {/* ── Identity ── */}
        <div className="lg:col-span-2 space-y-1.5">
          <div className="flex items-end gap-2 flex-wrap">
            <span className="text-2xl font-black text-indigo-700 font-mono tracking-tight leading-none">
              {shortTicker}
            </span>
            {suffix && (
              <span className="mb-px text-xs text-slate-400 font-mono leading-none">{suffix}</span>
            )}
            {editing ? (
              <select
                value={editTag}
                onChange={(e) => setEditTag(e.target.value as WatchlistTag)}
                className="rounded-md border border-indigo-200 bg-white px-2 py-0.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-300"
              >
                {TAG_OPTIONS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            ) : (
              <WatchlistTagBadge tag={item.tag} size="sm" />
            )}
          </div>

          <p className="text-sm text-slate-700 font-medium leading-snug">
            {item.name ?? <span className="text-slate-400 italic font-normal">Company name not set</span>}
          </p>

          {item.sector ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
              <span className="h-2 w-2 rounded-full shrink-0" style={{ background: sectorColor }} />
              {item.sector}
            </span>
          ) : (
            <span className="text-xs text-slate-300 italic">Sector not set</span>
          )}
        </div>

        {/* ── Current price ── */}
        <div className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 flex items-center gap-1">
            <TrendingUp className="h-3 w-3" /> Current Price
          </p>
          {!yfinanceAvailable ? (
            <>
              <p className="text-xl font-bold text-slate-300">—</p>
              <p className="text-[10px] text-slate-400">yfinance unavailable</p>
            </>
          ) : livePrice !== undefined ? (
            <>
              <p className="text-xl font-bold text-emerald-700 tabular-nums">
                ₹{livePrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="text-[10px] text-slate-400">Last close · live data</p>
            </>
          ) : (
            <>
              <p className="text-sm text-slate-400 italic">Loading…</p>
              <p className="text-[10px] text-slate-400">Fetching…</p>
            </>
          )}
        </div>

        {/* ── Target price + upside ── */}
        <div className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 flex items-center gap-1">
            <DollarSign className="h-3 w-3" /> Target Price
          </p>
          {editing ? (
            <input
              type="number"
              min="0"
              step="0.01"
              value={editTarget}
              onChange={(e) => setEditTarget(e.target.value)}
              placeholder="e.g. 2500"
              className="w-full rounded-md border border-indigo-200 bg-white px-2 py-1 text-sm
                         text-slate-700 placeholder-slate-300 focus:outline-none focus:ring-1
                         focus:ring-indigo-300"
            />
          ) : item.target_price !== null ? (
            <>
              <p className="text-xl font-bold text-slate-700 tabular-nums">
                ₹{item.target_price.toLocaleString('en-IN')}
              </p>
              {livePrice !== undefined && livePrice > 0 && item.target_price > 0 && (
                <p className={cn(
                  'text-[11px] font-semibold',
                  livePrice < item.target_price ? 'text-emerald-600' : 'text-red-500',
                )}>
                  {livePrice < item.target_price
                    ? `▲ ${(((item.target_price - livePrice) / livePrice) * 100).toFixed(1)}% upside`
                    : `▼ ${(((livePrice - item.target_price) / item.target_price) * 100).toFixed(1)}% above target`
                  }
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-slate-400 italic">Not set</p>
          )}
        </div>

        {/* ── Notes (full width) ── */}
        <div className="sm:col-span-2 lg:col-span-4 pt-3 border-t border-indigo-100/60">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1.5 flex items-center gap-1">
            <Tag className="h-3 w-3" /> Research Notes
          </p>
          {editing ? (
            <textarea
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
              rows={3}
              placeholder="Add your research notes, thesis, or reminders…"
              className="w-full rounded-md border border-indigo-200 bg-white px-3 py-2 text-sm
                         text-slate-700 placeholder-slate-300 leading-relaxed resize-none
                         focus:outline-none focus:ring-1 focus:ring-indigo-300"
            />
          ) : item.notes ? (
            <p className="text-sm text-slate-600 leading-relaxed">{item.notes}</p>
          ) : (
            <p className="text-sm text-slate-300 italic">No notes — click ✏️ to add</p>
          )}
        </div>
      </div>

      {/* Action row */}
      <div className="flex items-center gap-2 px-5 py-3 border-t border-indigo-100 bg-white/50">
        {editing ? (
          <>
            <button
              onClick={saveEdit}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50
                         px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100
                         disabled:opacity-50 transition-colors"
            >
              <Check className="h-3.5 w-3.5" />
              {saving ? 'Saving…' : 'Save changes'}
            </button>
            <button
              onClick={cancelEdit}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white
                         px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-50
                         disabled:opacity-50 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
              Cancel
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => router.push(`/simulate?add=${encodeURIComponent(item.ticker)}`)}
              className="flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50
                         px-3 py-1.5 text-xs font-medium text-violet-700 hover:bg-violet-100 transition-colors"
            >
              <GitFork className="h-3.5 w-3.5" />
              Simulate this stock
            </button>
            <button
              onClick={() => router.push(`/advisor?q=${encodeURIComponent(`analyse ${item.ticker}`)}`)}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white
                         px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
            >
              <MessageCircle className="h-3.5 w-3.5" />
              Ask Advisor
            </button>
          </>
        )}
        <span className="ml-auto text-[10px] text-slate-400">
          Added {new Date(item.added_at).toLocaleDateString('en-IN', {
            day: 'numeric', month: 'short', year: 'numeric',
          })}
        </span>
      </div>
    </div>
  )
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="card overflow-hidden animate-pulse">
      <div className="px-5 py-4 border-b border-slate-100">
        <div className="h-4 w-32 rounded bg-slate-200" />
      </div>
      <div className="divide-y divide-slate-50">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-4">
            <div className="h-4 w-20 rounded bg-slate-200" />
            <div className="h-4 w-36 rounded bg-slate-100" />
            <div className="h-5 w-24 rounded-full bg-slate-100" />
            <div className="h-3 w-20 rounded bg-slate-100 ml-auto" />
          </div>
        ))}
      </div>
    </div>
  )
}
