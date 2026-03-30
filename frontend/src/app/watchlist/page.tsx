/**
 * Watchlist Page — Phase 1
 * --------------------------
 * Layout:
 *   1. Page header (title + item count + refresh)
 *   2. WatchlistForm      — add new item (ticker, name, tag, sector, target price, notes)
 *   3. WatchlistTable     — all items, sortable, with confirm-delete
 *      or EmptyWatchlistState if no items exist
 *
 * Data flow: useWatchlist() → items[] → WatchlistTable
 *                           → addItem() ← WatchlistForm
 *                           → removeItem() ← WatchlistTable
 *
 * Architecture notes for Phase 2:
 *   - A "WatchlistSummaryCard" strip (tag distribution + sector map) can be
 *     inserted between header and form.
 *   - Live price enrichment: background poll to /api/v1/watchlist/enrich merges
 *     live_price into item state.
 *   - What-if analysis: "Add to Portfolio" button in WatchlistTable opens a modal
 *     showing portfolio impact metrics.
 */

'use client'

import { useRef, useState }                from 'react'
import { Star, RefreshCw, AlertCircle, GitFork, MessageCircle } from 'lucide-react'
import { useWatchlist }                    from '@/hooks/useWatchlist'
import { WatchlistForm }                   from '@/components/watchlist/WatchlistForm'
import { WatchlistTable }                  from '@/components/watchlist/WatchlistTable'
import { EmptyWatchlistState }             from '@/components/watchlist/EmptyWatchlistState'
import { QuickActionBar }                  from '@/components/ui/QuickActionBar'
import type { WatchlistItemInput }         from '@/types'
import { cn }                              from '@/lib/utils'

export default function WatchlistPage() {
  const {
    items,
    loading,
    error,
    addItem,
    removeItem,
    refetch,
    clearError,
  } = useWatchlist()

  const [submitting,     setSubmitting]  = useState(false)
  const [formError,      setFormError]   = useState<string | null>(null)
  const [removingTicker, setRemoving]    = useState<string | null>(null)

  const formRef = useRef<HTMLDivElement>(null)

  // ── Handlers ────────────────────────────────────────────────────────────────

  async function handleAdd(payload: WatchlistItemInput) {
    setSubmitting(true)
    setFormError(null)
    try {
      await addItem(payload)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not add stock to watchlist.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleRemove(ticker: string) {
    setRemoving(ticker)
    try {
      await removeItem(ticker)
    } finally {
      setRemoving(null)
    }
  }

  function scrollToForm() {
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // ── Render ──────────────────────────────────────────────────────────────────

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
            Tag by conviction level, set price targets, and annotate your thesis.
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

      {/* ── Global error (fetch failure) ────────────────────────────────────── */}
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

      {/* ── Workflow quick actions ───────────────────────────────────────────── */}
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
        />
      )}
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
