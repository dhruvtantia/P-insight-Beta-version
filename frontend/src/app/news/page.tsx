/**
 * News & Events Page — Phase 1
 * --------------------------------
 * Layout:
 *   1. Page header (title + description + source note)
 *   2. Sentiment summary bar — count of positive / neutral / negative articles
 *   3. NewsFilterBar — ticker + event type filter chips
 *   4. NewsFeed — filtered list of NewsCards + Upcoming Events timeline
 *
 * Data flow:
 *   usePortfolio()  → holdings[] → ticker options for FilterBar
 *   useNews()       → articles + events → passed to FilterBar + NewsFeed
 *   Client-side     → ticker + eventType filters update view without re-fetch
 *                     (event_type is sent to backend; ticker is client-filtered
 *                      for instant chip switching)
 *
 * Phase 2 extension points:
 *   - Replace static mock data with live newsApi call per ticker
 *   - Add "Mark as read" / "Save" actions per card
 *   - Persist filters in URL search params for deep-linking
 */

'use client'

import { useState, useMemo }           from 'react'
import { Newspaper, AlertCircle,
         RefreshCw, Info,
         TrendingUp, TrendingDown,
         Minus }                        from 'lucide-react'
import { usePortfolio }                from '@/hooks/usePortfolio'
import { useNews }                     from '@/hooks/useNews'
import { NewsFilterBar }               from '@/components/news/NewsFilterBar'
import { NewsFeed }                    from '@/components/news/NewsFeed'
import { cn }                          from '@/lib/utils'
import type { NewsEventType }          from '@/types'

export default function NewsPage() {
  // ── Portfolio (for ticker options in FilterBar) ───────────────────────────
  const { holdings, loading: holdingsLoading } = usePortfolio()

  // ── Filters — managed in page state ───────────────────────────────────────
  const [tickerFilter,    setTickerFilter]    = useState<string | null>(null)
  const [eventTypeFilter, setEventTypeFilter] = useState<NewsEventType | null>(null)

  // ── News data ─────────────────────────────────────────────────────────────
  // We only pass eventType to the API (server-side filter).
  // Ticker is filtered client-side for instant chip switching.
  const { articles, events, loading, error, refetch } = useNews({
    eventType: eventTypeFilter ?? undefined,
  })

  // ── Client-side apply ticker filter ───────────────────────────────────────
  const visibleArticles = useMemo(() => {
    if (!tickerFilter) return articles
    const upper = tickerFilter.toUpperCase()
    return articles.filter((a) => a.tickers.some((t) => t.toUpperCase() === upper))
  }, [articles, tickerFilter])

  // ── Sentiment summary ─────────────────────────────────────────────────────
  const sentimentCounts = useMemo(() => {
    const pos = visibleArticles.filter((a) => a.sentiment === 'positive').length
    const neg = visibleArticles.filter((a) => a.sentiment === 'negative').length
    const neu = visibleArticles.filter((a) => a.sentiment === 'neutral').length
    return { pos, neg, neu, total: visibleArticles.length }
  }, [visibleArticles])

  // Ticker options for FilterBar
  const tickerOptions = useMemo(
    () => holdings.map((h) => ({ ticker: h.ticker, name: h.name })),
    [holdings]
  )

  return (
    <div className="space-y-5 max-w-[900px]">

      {/* ── 1. Page header ───────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Newspaper className="h-5 w-5 text-slate-400" />
            <h1 className="text-lg font-bold text-slate-900">News & Events</h1>
          </div>
          <p className="text-sm text-slate-500">
            Portfolio-relevant company updates, earnings, dividends, and market events.
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

      {/* ── Data source note ─────────────────────────────────────────────── */}
      <div className="flex items-start gap-2 rounded-lg border border-slate-100 bg-slate-50 px-4 py-3">
        <Info className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
        <p className="text-xs text-slate-500">
          <span className="font-semibold text-slate-600">Mock data mode.</span>{' '}
          Articles and events are curated static content for development. Live news via
          NewsAPI / Bloomberg will be added in Phase 2.
        </p>
      </div>

      {/* ── Error ────────────────────────────────────────────────────────── */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-red-700">Failed to load news</p>
              <p className="text-xs text-red-600 mt-0.5">{error}</p>
              <button
                onClick={refetch}
                className="mt-2 text-xs font-medium text-red-700 hover:text-red-900 underline"
              >
                Retry
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 2. Sentiment summary bar ─────────────────────────────────────── */}
      {!loading && !error && sentimentCounts.total > 0 && (
        <SentimentBar counts={sentimentCounts} />
      )}

      {/* ── 3. Filter bar ────────────────────────────────────────────────── */}
      {!holdingsLoading && (
        <NewsFilterBar
          holdings={tickerOptions}
          selectedTicker={tickerFilter}
          selectedEventType={eventTypeFilter}
          onTickerChange={setTickerFilter}
          onEventTypeChange={setEventTypeFilter}
          totalArticles={visibleArticles.length}
        />
      )}

      {/* ── 4. News feed ─────────────────────────────────────────────────── */}
      {loading ? (
        <NewsFeedSkeleton />
      ) : (
        <NewsFeed
          articles={visibleArticles}
          events={events}
          tickerFilter={tickerFilter}
          eventTypeFilter={eventTypeFilter}
        />
      )}
    </div>
  )
}

// ─── Sentiment summary bar ────────────────────────────────────────────────────

function SentimentBar({
  counts,
}: {
  counts: { pos: number; neg: number; neu: number; total: number }
}) {
  const { pos, neg, neu, total } = counts
  const pctPos = total ? Math.round((pos / total) * 100) : 0
  const pctNeg = total ? Math.round((neg / total) * 100) : 0
  const pctNeu = total ? 100 - pctPos - pctNeg : 0

  return (
    <div className="card px-5 py-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
          Sentiment overview
        </p>
        <p className="text-[10px] text-slate-400">{total} articles</p>
      </div>
      {/* Progress bar */}
      <div className="flex h-2 rounded-full overflow-hidden gap-px">
        {pctPos > 0 && <div className="bg-emerald-400 transition-all" style={{ width: `${pctPos}%` }} />}
        {pctNeu > 0 && <div className="bg-slate-200 transition-all" style={{ width: `${pctNeu}%` }} />}
        {pctNeg > 0 && <div className="bg-red-400 transition-all" style={{ width: `${pctNeg}%` }} />}
      </div>
      {/* Counts */}
      <div className="flex items-center gap-4 mt-2">
        <SentimentStat icon={<TrendingUp className="h-3 w-3 text-emerald-500" />} label="Positive" count={pos} color="text-emerald-600" />
        <SentimentStat icon={<Minus className="h-3 w-3 text-slate-400" />}       label="Neutral"  count={neu} color="text-slate-500"   />
        <SentimentStat icon={<TrendingDown className="h-3 w-3 text-red-500" />}  label="Negative" count={neg} color="text-red-600"     />
      </div>
    </div>
  )
}

function SentimentStat({
  icon, label, count, color,
}: {
  icon: React.ReactNode; label: string; count: number; color: string
}) {
  return (
    <div className="flex items-center gap-1.5">
      {icon}
      <span className={cn('text-xs font-semibold tabular-nums', color)}>{count}</span>
      <span className="text-[10px] text-slate-400">{label}</span>
    </div>
  )
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function NewsFeedSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="card px-5 py-4 animate-pulse">
          <div className="flex gap-4">
            <div className="h-2.5 w-2.5 rounded-full bg-slate-200 mt-1.5 shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="flex gap-2">
                <div className="h-4 w-16 rounded-full bg-slate-200" />
                <div className="h-4 w-10 rounded-full bg-slate-100" />
              </div>
              <div className="h-3.5 rounded bg-slate-200 w-full" />
              <div className="h-3.5 rounded bg-slate-200 w-5/6" />
              <div className="h-3 rounded bg-slate-100 w-2/3" />
              <div className="h-2.5 rounded bg-slate-100 w-32" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
