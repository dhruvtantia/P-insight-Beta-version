'use client'

/**
 * NewsFilterBar — filter controls for the news feed.
 *
 * Three independent filters, all optional:
 *   1. Ticker  — "All stocks" or a specific holding ticker
 *   2. Sector  — "All sectors" or a specific sector
 *   3. Event type — "All types" or a specific event_type
 *
 * Each is a horizontal chip-row, responsive via flex-wrap.
 * Active chip is highlighted in indigo.
 *
 * Props:
 *   holdings    — portfolio holdings for ticker + sector options
 *   selectedTicker    — currently active ticker filter (null = all)
 *   selectedEventType — currently active event type (null = all)
 *   onTickerChange    — callback
 *   onEventTypeChange — callback
 *   totalArticles — shown in the results count
 */

import { cn }                                            from '@/lib/utils'
import { NEWS_EVENT_LABELS, NEWS_EVENT_STYLES }          from '@/constants'
import type { NewsEventType }                            from '@/types'

interface TickerOption {
  ticker: string
  name:   string
}

interface Props {
  holdings:            TickerOption[]
  selectedTicker:      string | null
  selectedEventType:   NewsEventType | null
  onTickerChange:      (t: string | null)          => void
  onEventTypeChange:   (e: NewsEventType | null)   => void
  totalArticles:       number
}

const EVENT_TYPE_ORDER: NewsEventType[] = [
  'earnings', 'dividend', 'deal', 'rating',
  'company_update', 'market_event', 'regulatory', 'management',
]

export function NewsFilterBar({
  holdings,
  selectedTicker,
  selectedEventType,
  onTickerChange,
  onEventTypeChange,
  totalArticles,
}: Props) {
  return (
    <div className="card px-5 py-4 space-y-3">
      {/* ── Ticker filter ──────────────────────────────────────────────────── */}
      <div>
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">
          By stock
        </p>
        <div className="flex flex-wrap gap-1.5">
          <FilterChip
            label="All stocks"
            active={selectedTicker === null}
            onClick={() => onTickerChange(null)}
          />
          {holdings.map(({ ticker, name }) => {
            const base = ticker.replace(/\.(NS|BSE|BO)$/i, '')
            return (
              <FilterChip
                key={ticker}
                label={base}
                title={name}
                active={selectedTicker === ticker}
                onClick={() => onTickerChange(ticker === selectedTicker ? null : ticker)}
              />
            )
          })}
        </div>
      </div>

      {/* ── Event type filter ──────────────────────────────────────────────── */}
      <div>
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">
          By event type
        </p>
        <div className="flex flex-wrap gap-1.5">
          <FilterChip
            label="All types"
            active={selectedEventType === null}
            onClick={() => onEventTypeChange(null)}
          />
          {EVENT_TYPE_ORDER.map((et) => {
            const style = NEWS_EVENT_STYLES[et]
            const label = NEWS_EVENT_LABELS[et]
            const isActive = selectedEventType === et
            return (
              <button
                key={et}
                onClick={() => onEventTypeChange(et === selectedEventType ? null : et)}
                className={cn(
                  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-medium transition-all',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400',
                  isActive
                    ? cn(style.bg, style.text, style.border, 'shadow-sm')
                    : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700'
                )}
              >
                {label}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Result count ────────────────────────────────────────────────────── */}
      <p className="text-[10px] text-slate-400">
        Showing <span className="font-semibold text-slate-600">{totalArticles}</span> article{totalArticles !== 1 ? 's' : ''}
        {selectedTicker && (
          <> for <span className="font-medium text-indigo-600">{selectedTicker.replace(/\.(NS|BSE|BO)$/i, '')}</span></>
        )}
        {selectedEventType && (
          <> · type: <span className="font-medium text-indigo-600">{NEWS_EVENT_LABELS[selectedEventType]}</span></>
        )}
      </p>
    </div>
  )
}

// ─── FilterChip helper ────────────────────────────────────────────────────────

function FilterChip({
  label, active, onClick, title,
}: {
  label:   string
  active:  boolean
  onClick: () => void
  title?:  string
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        'rounded-full border px-2.5 py-0.5 text-[10px] font-medium transition-all',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400',
        active
          ? 'border-indigo-400 bg-indigo-50 text-indigo-700'
          : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700'
      )}
    >
      {label}
    </button>
  )
}
