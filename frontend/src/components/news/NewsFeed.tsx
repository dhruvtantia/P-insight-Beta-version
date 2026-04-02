'use client'

/**
 * NewsFeed — renders a filtered list of NewsCards.
 *
 * Client-side ticker filter applied here (the API already filtered by
 * event_type; ticker is re-filtered client-side for instant response
 * without a round-trip when the user switches stock chips).
 *
 * Also renders the upcoming corporate events timeline below the articles.
 */

import { useMemo }                from 'react'
import { Calendar, Inbox, WifiOff } from 'lucide-react'
import { cn }                     from '@/lib/utils'
import { CORPORATE_EVENT_LABELS,
         CORPORATE_EVENT_STYLES } from '@/constants'
import { NewsCard }               from './NewsCard'
import type { NewsArticle, CorporateEvent, NewsEventType } from '@/types'

interface Props {
  articles:         NewsArticle[]
  events:           CorporateEvent[]
  tickerFilter:     string | null    // active ticker chip (null = show all)
  eventTypeFilter:  NewsEventType | null
  /** True when backend is in live mode but no news API is configured */
  liveUnavailable?: boolean
}

export function NewsFeed({ articles, events, tickerFilter, eventTypeFilter, liveUnavailable = false }: Props) {
  // ── Client-side ticker filter ───────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = articles

    if (tickerFilter) {
      const upper = tickerFilter.toUpperCase()
      list = list.filter((a) => a.tickers.some((t) => t.toUpperCase() === upper))
    }

    if (eventTypeFilter) {
      list = list.filter((a) => a.event_type === eventTypeFilter)
    }

    return list
  }, [articles, tickerFilter, eventTypeFilter])

  // ── Client-side events filter ───────────────────────────────────────────────
  const filteredEvents = useMemo(() => {
    if (!tickerFilter) return events
    return events.filter((e) => e.ticker.toUpperCase() === tickerFilter.toUpperCase())
  }, [events, tickerFilter])

  return (
    <div className="space-y-6">
      {/* ── Articles ─────────────────────────────────────────────────────── */}
      {liveUnavailable ? (
        <LiveUnavailableState />
      ) : filtered.length === 0 ? (
        <EmptyState hasFilter={!!(tickerFilter || eventTypeFilter)} />
      ) : (
        <div className="space-y-3">
          {filtered.map((a, i) => (
            <NewsCard key={`${a.title}-${i}`} article={a} />
          ))}
        </div>
      )}

      {/* ── Upcoming Events Timeline ─────────────────────────────────────── */}
      {filteredEvents.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="h-4 w-4 text-slate-400" />
            <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
              Upcoming Corporate Events
            </h3>
          </div>
          <div className="card divide-y divide-slate-50">
            {filteredEvents.map((ev, i) => (
              <EventRow key={i} event={ev} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── EventRow ─────────────────────────────────────────────────────────────────

function EventRow({ event }: { event: CorporateEvent }) {
  const style  = CORPORATE_EVENT_STYLES[event.event_type] ?? { bg: 'bg-slate-100', text: 'text-slate-600' }
  const label  = CORPORATE_EVENT_LABELS[event.event_type] ?? event.event_type
  const base   = event.ticker.replace(/\.(NS|BSE|BO)$/i, '')

  // Format date nicely
  let dateDisplay = event.date
  try {
    const d = new Date(event.date)
    dateDisplay = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch { /* ignore */ }

  // Days until event
  let daysUntil: number | null = null
  try {
    const ms = new Date(event.date).getTime() - Date.now()
    daysUntil = Math.ceil(ms / 86_400_000)
  } catch { /* ignore */ }

  return (
    <div className="flex items-start gap-4 px-5 py-3">
      {/* Event type badge */}
      <span className={cn('rounded-md px-2 py-0.5 text-[10px] font-semibold shrink-0 mt-0.5', style.bg, style.text)}>
        {label}
      </span>

      {/* Details */}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-slate-700">{event.title}</p>
        {event.details && (
          <p className="text-[10px] text-slate-400 mt-0.5 leading-relaxed">{event.details}</p>
        )}
      </div>

      {/* Ticker + date */}
      <div className="text-right shrink-0">
        <span className="block text-[10px] font-mono font-bold text-indigo-600">{base}</span>
        <span className="block text-[10px] text-slate-400">{dateDisplay}</span>
        {daysUntil !== null && (
          <span className={cn(
            'text-[9px] font-medium',
            daysUntil <= 7  ? 'text-amber-600' :
            daysUntil <= 30 ? 'text-slate-500' :
            'text-slate-300'
          )}>
            {daysUntil < 0
              ? 'Past'
              : daysUntil === 0
              ? 'Today'
              : `in ${daysUntil}d`}
          </span>
        )}
      </div>
    </div>
  )
}

// ─── Empty states ─────────────────────────────────────────────────────────────

function EmptyState({ hasFilter }: { hasFilter?: boolean }) {
  return (
    <div className="card px-6 py-10 text-center">
      <Inbox className="mx-auto h-8 w-8 text-slate-200 mb-2" />
      {hasFilter ? (
        <>
          <p className="text-sm font-medium text-slate-400">No articles match this filter</p>
          <p className="text-xs text-slate-300 mt-1">Try removing a stock or event type filter.</p>
        </>
      ) : (
        <>
          <p className="text-sm font-medium text-slate-400">No articles available</p>
          <p className="text-xs text-slate-300 mt-1">
            No news was returned for your portfolio holdings.
          </p>
        </>
      )}
    </div>
  )
}

function LiveUnavailableState() {
  return (
    <div className="card px-6 py-10 text-center">
      <WifiOff className="mx-auto h-8 w-8 text-amber-300 mb-2" />
      <p className="text-sm font-medium text-slate-500">News data unavailable</p>
      <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
        No news could be retrieved. Add a{' '}
        <code className="font-mono bg-slate-100 px-1 rounded">NEWS_API_KEY</code> to your{' '}
        <code className="font-mono bg-slate-100 px-1 rounded">.env</code> file and restart the
        backend to enable real portfolio news.
      </p>
    </div>
  )
}
