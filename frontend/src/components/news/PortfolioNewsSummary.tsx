'use client'

/**
 * PortfolioNewsSummary — compact news strip for the dashboard.
 *
 * Shows the 4 most recent portfolio news articles and the next 2 upcoming
 * events in a card, without cluttering the dashboard layout.
 *
 * Links to /news for the full feed.
 */

import Link                   from 'next/link'
import { Newspaper,
         ArrowRight,
         Calendar }           from 'lucide-react'
import { useNews }            from '@/hooks/useNews'
import { NewsCard }           from './NewsCard'
import { CORPORATE_EVENT_LABELS,
         CORPORATE_EVENT_STYLES } from '@/constants'
import { cn }                 from '@/lib/utils'

const MAX_ARTICLES = 4
const MAX_EVENTS   = 2

export function PortfolioNewsSummary() {
  const { articles, events, loading, error } = useNews()

  const topArticles  = articles.slice(0, MAX_ARTICLES)
  const nextEvents   = events.slice(0, MAX_EVENTS)

  return (
    <div className="card">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <Newspaper className="h-4 w-4 text-slate-400" />
          <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
            Latest News
          </span>
        </div>
        <Link
          href="/news"
          className="flex items-center gap-1 text-[11px] font-medium text-indigo-600 hover:text-indigo-800 transition-colors"
        >
          All news <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {/* ── Loading skeleton ─────────────────────────────────────────────── */}
      {loading && (
        <div className="px-5 py-4 space-y-3 animate-pulse">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex gap-3">
              <div className="h-2 w-2 rounded-full bg-slate-200 mt-1.5 shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 rounded bg-slate-200 w-full" />
                <div className="h-3 rounded bg-slate-200 w-3/4" />
                <div className="h-2.5 rounded bg-slate-100 w-24" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Error ────────────────────────────────────────────────────────── */}
      {!loading && error && (
        <p className="px-5 py-4 text-xs text-red-500">{error}</p>
      )}

      {/* ── Articles ─────────────────────────────────────────────────────── */}
      {!loading && !error && topArticles.length > 0 && (
        <div className="px-5 divide-y divide-slate-50">
          {topArticles.map((a, i) => (
            <NewsCard key={i} article={a} compact />
          ))}
        </div>
      )}

      {/* ── Upcoming Events mini-strip ────────────────────────────────────── */}
      {!loading && nextEvents.length > 0 && (
        <div className="border-t border-slate-100 px-5 py-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Calendar className="h-3.5 w-3.5 text-slate-400" />
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
              Upcoming
            </p>
          </div>
          <div className="space-y-1.5">
            {nextEvents.map((ev, i) => {
              const style = CORPORATE_EVENT_STYLES[ev.event_type] ?? { bg: 'bg-slate-100', text: 'text-slate-600' }
              const label = CORPORATE_EVENT_LABELS[ev.event_type] ?? ev.event_type
              const base  = ev.ticker.replace(/\.(NS|BSE|BO)$/i, '')
              let dateStr = ev.date
              try {
                dateStr = new Date(ev.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
              } catch { /* ignore */ }
              return (
                <div key={i} className="flex items-center gap-2">
                  <span className={cn('rounded px-1.5 py-0.5 text-[9px] font-semibold', style.bg, style.text)}>
                    {label}
                  </span>
                  <span className="text-[10px] font-mono font-bold text-indigo-600">{base}</span>
                  <span className="text-[10px] text-slate-400 truncate flex-1">{ev.title}</span>
                  <span className="text-[10px] text-slate-400 shrink-0">{dateStr}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Empty ────────────────────────────────────────────────────────── */}
      {!loading && !error && topArticles.length === 0 && (
        <div className="px-5 py-6 text-center text-xs text-slate-400">
          No news articles available.
        </div>
      )}
    </div>
  )
}
