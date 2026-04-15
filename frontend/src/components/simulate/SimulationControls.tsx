/**
 * SimulationControls — top control bar for the simulation page
 * ------------------------------------------------------------
 * • Add from watchlist dropdown (unchanged)
 * • Search & add new stock (NEW) — StockSearchInput; no watchlist required
 * • Weight total indicator (progress bar)
 * • Auto-normalize button
 * • Reset button
 *
 * The "Search & add" panel is an inline toggle below the controls bar.
 * It uses StockSearchInput — same autocomplete as WatchlistForm.
 * Adding a stock does NOT reset the rest of the simulation state.
 */

'use client'

import { useState }              from 'react'
import { RefreshCw, Scale, ChevronDown, Plus, CheckCircle2, AlertCircle, Search } from 'lucide-react'
import { StockSearchInput }      from '@/components/common/StockSearchInput'
import { cn }                    from '@/lib/utils'
import type { WatchlistItem }    from '@/types'

// ─── Weight indicator ─────────────────────────────────────────────────────────

function WeightIndicator({ total }: { total: number }) {
  const rounded  = Math.round(total * 10) / 10
  const isOver   = total > 100.5
  const isUnder  = total < 99.5
  const isOk     = !isOver && !isUnder
  const barWidth = Math.min(100, (total / 100) * 100)

  return (
    <div className="flex items-center gap-2.5 min-w-0">
      {isOk
        ? <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
        : <AlertCircle  className="h-4 w-4 text-amber-500   shrink-0" />
      }

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Total Weight
          </span>
          <span className={cn(
            'text-xs font-bold',
            isOk   ? 'text-emerald-600' :
            isOver ? 'text-red-600'     :
                     'text-amber-600',
          )}>
            {rounded.toFixed(1)}%
          </span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-200',
              isOk   ? 'bg-emerald-500' :
              isOver ? 'bg-red-400'     :
                       'bg-amber-400',
            )}
            style={{ width: `${barWidth}%` }}
          />
        </div>
        {(isOver || isUnder) && (
          <p className="text-[10px] text-amber-600 mt-0.5">
            {isOver
              ? `Over by ${(total - 100).toFixed(1)}% — use Auto-normalize`
              : `Under by ${(100 - total).toFixed(1)}% — ${(100 - total).toFixed(1)}% unallocated`
            }
          </p>
        )}
      </div>
    </div>
  )
}

// ─── Add-from-watchlist dropdown ──────────────────────────────────────────────

interface AddDropdownProps {
  watchlistItems:   WatchlistItem[]
  simTickers:       Set<string>
  onAdd:            (item: WatchlistItem) => void
}

function AddFromWatchlistDropdown({ watchlistItems, simTickers, onAdd }: AddDropdownProps) {
  const [open, setOpen] = useState(false)

  const available = watchlistItems.filter(
    (w) => !simTickers.has(w.ticker.toUpperCase()),
  )

  if (available.length === 0) return null

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50
                   px-3 py-2 text-xs font-medium text-indigo-700 hover:bg-indigo-100
                   transition-colors"
      >
        <Plus className="h-3.5 w-3.5" />
        Add from watchlist
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-20 mt-1 w-64 rounded-xl border border-slate-200
                          bg-white shadow-lg overflow-hidden">
            <div className="px-3 py-2 border-b border-slate-100 bg-slate-50">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Watchlist ({available.length} available)
              </p>
            </div>
            <ul className="max-h-52 overflow-y-auto">
              {available.map((item) => (
                <li key={item.ticker}>
                  <button
                    onClick={() => { onAdd(item); setOpen(false) }}
                    className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left
                               hover:bg-indigo-50 transition-colors border-b border-slate-50 last:border-0"
                  >
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold font-mono text-slate-700 shrink-0">
                      {item.ticker.replace(/\.(NS|BSE|BO)$/i, '')}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-slate-800 truncate">
                        {item.name ?? item.ticker}
                      </p>
                      {item.sector && (
                        <p className="text-[10px] text-slate-400 truncate">{item.sector}</p>
                      )}
                    </div>
                    {item.tag && (
                      <span className="ml-auto text-[9px] text-slate-400 shrink-0">{item.tag}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Search & add new stock panel ────────────────────────────────────────────

interface SearchAddPanelProps {
  simTickers: Set<string>
  onAddNew:   (ticker: string, name?: string, sector?: string) => void
}

function SearchAndAddPanel({ simTickers, onAddNew }: SearchAddPanelProps) {
  const [open,  setOpen]  = useState(false)
  const [query, setQuery] = useState('')
  const [added, setAdded] = useState<string | null>(null)

  function handleSelect(ticker: string, name?: string, sector?: string) {
    const upper = ticker.trim().toUpperCase()
    if (!upper) return
    if (simTickers.has(upper)) return   // already in sim
    onAddNew(upper, name, sector)
    setAdded(upper)
    setQuery('')
    // Brief success flash then close panel
    setTimeout(() => { setAdded(null); setOpen(false) }, 1400)
  }

  return (
    <div className="relative">
      <button
        onClick={() => { setOpen((o) => !o); setQuery('') }}
        className={cn(
          'flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors',
          open
            ? 'border-violet-300 bg-violet-100 text-violet-800'
            : 'border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100',
        )}
      >
        <Search className="h-3.5 w-3.5" />
        Search & add stock
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            className="absolute left-0 top-full z-20 mt-1 w-80 rounded-xl border border-slate-200
                        bg-white shadow-lg overflow-visible p-3 space-y-2"
            // Prevent backdrop click when clicking inside panel
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 px-0.5">
              Search any stock
            </p>

            {added ? (
              <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                <span className="text-xs font-medium text-emerald-700">
                  {added} added at 5% weight
                </span>
              </div>
            ) : (
              <StockSearchInput
                value={query}
                onChange={setQuery}
                onSelect={handleSelect}
                placeholder="e.g. RELIANCE or Apple…"
                autoFocus
              />
            )}

            <p className="text-[10px] text-slate-400 px-0.5 leading-relaxed">
              Added at 5% weight — adjust sliders as needed.
              <br />
              Not added to your watchlist.
            </p>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface SimulationControlsProps {
  totalSimWeight:    number
  isModified:        boolean
  modifiedCount:     number
  watchlistItems:    WatchlistItem[]
  portfolioTickers:  Set<string>
  simTickers:        Set<string>
  onAddFromWatchlist: (item: WatchlistItem) => void
  /** NEW — add a stock by raw ticker + optional meta, without touching watchlist */
  onAddNewStock:     (ticker: string, name?: string, sector?: string) => void
  onNormalize:       () => void
  onReset:           () => void
}

export function SimulationControls({
  totalSimWeight,
  isModified,
  modifiedCount,
  watchlistItems,
  portfolioTickers,
  simTickers,
  onAddFromWatchlist,
  onAddNewStock,
  onNormalize,
  onReset,
}: SimulationControlsProps) {
  return (
    <div className="card px-5 py-4">
      <div className="flex flex-wrap items-center gap-3">

        {/* ── Add from watchlist ── */}
        <AddFromWatchlistDropdown
          watchlistItems={watchlistItems}
          simTickers={simTickers}
          onAdd={onAddFromWatchlist}
        />

        {/* ── Search & add new stock ── */}
        <SearchAndAddPanel
          simTickers={simTickers}
          onAddNew={onAddNewStock}
        />

        {/* ── Separator ── */}
        <div className="h-6 w-px bg-slate-200 hidden sm:block" />

        {/* ── Auto-normalize ── */}
        <button
          onClick={onNormalize}
          title="Scale all weights to sum to 100%"
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white
                     px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50
                     transition-colors"
        >
          <Scale className="h-3.5 w-3.5" />
          Normalize to 100%
        </button>

        {/* ── Reset (only when modified) ── */}
        {isModified && (
          <>
            <button
              onClick={onReset}
              title="Revert all changes to base portfolio"
              className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50
                         px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-100
                         transition-colors"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Reset to base
            </button>

            <span className="rounded-full bg-amber-100 text-amber-700 border border-amber-200
                             text-[10px] font-bold px-2.5 py-1">
              {modifiedCount} change{modifiedCount > 1 ? 's' : ''} from base
            </span>
          </>
        )}

        {/* ── Weight indicator (pushed right) ── */}
        <div className="ml-auto w-52 shrink-0">
          <WeightIndicator total={totalSimWeight} />
        </div>
      </div>
    </div>
  )
}
