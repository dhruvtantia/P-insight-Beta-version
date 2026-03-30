'use client'

/**
 * PortfolioActivityPanel — dashboard activity feed.
 *
 * Three columns / sections:
 *   1. Upcoming Earnings   — next 3 Q-results dates from events calendar
 *   2. Recent Highlights   — latest 3 high-impact news (earnings + regulatory)
 *   3. Watchlist Signals   — watchlist items tagged High Conviction or Research
 *
 * All data comes from existing hooks (useNews, useWatchlist) — no new API calls.
 * Clicking any item navigates to the relevant section of the app.
 */

import Link                          from 'next/link'
import { Calendar, TrendingUp,
         Star, ArrowRight }          from 'lucide-react'
import { useNews }                   from '@/hooks/useNews'
import { useWatchlist }              from '@/hooks/useWatchlist'
import { EventBadge }                from '@/components/news/EventBadge'
import { CORPORATE_EVENT_LABELS,
         CORPORATE_EVENT_STYLES,
         WATCHLIST_TAG_STYLES }      from '@/constants'
import { cn }                        from '@/lib/utils'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relDate(iso: string): string {
  try {
    const d    = new Date(iso)
    const diff = Math.ceil((d.getTime() - Date.now()) / 86_400_000)
    if (diff < 0)  return 'Past'
    if (diff === 0) return 'Today'
    if (diff <= 7)  return `${diff}d`
    if (diff <= 30) return `${diff}d`
    const m = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
    return m
  } catch { return iso }
}

// ─── Section: Upcoming Earnings ───────────────────────────────────────────────

function UpcomingEarnings() {
  const { events, loading } = useNews()
  const upcoming = events
    .filter((e) => e.event_type === 'earnings' && new Date(e.date) >= new Date())
    .slice(0, 4)

  return (
    <div className="flex flex-col h-full">
      <SectionHeader icon={<Calendar className="h-4 w-4 text-violet-500" />} title="Upcoming Earnings" href="/news" />
      {loading ? (
        <SkeletonRows rows={3} />
      ) : upcoming.length === 0 ? (
        <EmptyMessage text="No upcoming earnings." />
      ) : (
        <ul className="divide-y divide-slate-50 flex-1">
          {upcoming.map((ev, i) => {
            const style  = CORPORATE_EVENT_STYLES[ev.event_type] ?? { bg: 'bg-slate-100', text: 'text-slate-600' }
            const label  = CORPORATE_EVENT_LABELS[ev.event_type] ?? ev.event_type
            const base   = ev.ticker.replace(/\.(NS|BSE|BO)$/i, '')
            const dLabel = relDate(ev.date)
            const soon   = (() => {
              try {
                const d = Math.ceil((new Date(ev.date).getTime() - Date.now()) / 86_400_000)
                return d >= 0 && d <= 14
              } catch { return false }
            })()

            return (
              <li key={i} className="flex items-center gap-3 py-2.5">
                <span className={cn('rounded px-1.5 py-0.5 text-[9px] font-bold shrink-0', style.bg, style.text)}>
                  {label}
                </span>
                <span className="font-mono text-[11px] font-bold text-indigo-700 shrink-0">{base}</span>
                <span className="text-[10px] text-slate-500 truncate flex-1">{ev.name ?? ev.ticker}</span>
                <span className={cn(
                  'text-[10px] font-semibold tabular-nums shrink-0',
                  soon ? 'text-amber-600' : 'text-slate-400'
                )}>
                  {dLabel}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// ─── Section: Recent Highlights ───────────────────────────────────────────────

function RecentHighlights() {
  const { articles, loading } = useNews()
  const highlights = articles
    .filter((a) => ['earnings', 'regulatory', 'deal', 'management'].includes(a.event_type))
    .slice(0, 4)

  return (
    <div className="flex flex-col h-full">
      <SectionHeader icon={<TrendingUp className="h-4 w-4 text-sky-500" />} title="Recent Highlights" href="/news" />
      {loading ? (
        <SkeletonRows rows={3} />
      ) : highlights.length === 0 ? (
        <EmptyMessage text="No highlights." />
      ) : (
        <ul className="divide-y divide-slate-50 flex-1">
          {highlights.map((a, i) => (
            <li key={i} className="flex items-start gap-2 py-2.5">
              <span className={cn(
                'mt-0.5 h-1.5 w-1.5 rounded-full shrink-0',
                a.sentiment === 'positive' ? 'bg-emerald-400' :
                a.sentiment === 'negative' ? 'bg-red-400' : 'bg-slate-300'
              )} />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-slate-700 font-medium leading-snug line-clamp-2">
                  {a.title}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <EventBadge eventType={a.event_type} size="xs" />
                  <span className="text-[9px] text-slate-400">
                    {(() => {
                      try {
                        const d = new Date(a.published_at)
                        const diff = Math.floor((Date.now() - d.getTime()) / 86_400_000)
                        return diff === 0 ? 'Today' : diff === 1 ? 'Yesterday' : `${diff}d ago`
                      } catch { return a.published_at }
                    })()}
                  </span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ─── Section: Watchlist Signals ───────────────────────────────────────────────

function WatchlistSignals() {
  const { items, loading } = useWatchlist()
  const signals = items.filter((w) => w.tag === 'High Conviction' || w.tag === 'Research').slice(0, 4)

  return (
    <div className="flex flex-col h-full">
      <SectionHeader icon={<Star className="h-4 w-4 text-amber-500" />} title="Watchlist Signals" href="/watchlist" />
      {loading ? (
        <SkeletonRows rows={3} />
      ) : signals.length === 0 ? (
        <EmptyMessage text="No watchlist signals. Add High Conviction items to see them here." />
      ) : (
        <ul className="divide-y divide-slate-50 flex-1">
          {signals.map((w, i) => {
            const base    = w.ticker.replace(/\.(NS|BSE|BO)$/i, '')
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const tagStyle = (WATCHLIST_TAG_STYLES as any)[w.tag ?? ''] ?? { bg: 'bg-slate-100', text: 'text-slate-600', dot: 'bg-slate-400' }
            return (
              <li key={i} className="flex items-center gap-2 py-2.5">
                <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', tagStyle.dot)} />
                <span className="font-mono text-[11px] font-bold text-indigo-700 shrink-0">{base}</span>
                <span className="text-[10px] text-slate-500 truncate flex-1">{w.name ?? w.ticker}</span>
                {w.tag && (
                  <span className={cn('rounded-full px-1.5 py-0.5 text-[8px] font-semibold shrink-0', tagStyle.bg, tagStyle.text)}>
                    {w.tag}
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function SectionHeader({
  icon, title, href,
}: { icon: React.ReactNode; title: string; href: string }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-1.5">
        {icon}
        <p className="text-xs font-semibold text-slate-700">{title}</p>
      </div>
      <Link href={href} className="flex items-center gap-0.5 text-[10px] text-indigo-500 hover:text-indigo-700 transition-colors">
        All <ArrowRight className="h-2.5 w-2.5" />
      </Link>
    </div>
  )
}

function EmptyMessage({ text }: { text: string }) {
  return <p className="text-[10px] text-slate-300 py-2">{text}</p>
}

function SkeletonRows({ rows }: { rows: number }) {
  return (
    <div className="space-y-2.5 animate-pulse">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-2 items-center">
          <div className="h-3 w-10 rounded bg-slate-200 shrink-0" />
          <div className="h-3 flex-1 rounded bg-slate-100" />
          <div className="h-3 w-6 rounded bg-slate-100 shrink-0" />
        </div>
      ))}
    </div>
  )
}

// ─── Panel ────────────────────────────────────────────────────────────────────

export function PortfolioActivityPanel() {
  return (
    <div className="card">
      <div className="px-5 pt-4 pb-3 border-b border-slate-100">
        <h3 className="text-sm font-semibold text-slate-800">Portfolio Activity</h3>
        <p className="text-[11px] text-slate-400 mt-0.5">Earnings calendar · news highlights · watchlist signals</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-100 px-5 py-4">
        <div className="pb-4 md:pb-0 md:pr-5">
          <UpcomingEarnings />
        </div>
        <div className="py-4 md:py-0 md:px-5">
          <RecentHighlights />
        </div>
        <div className="pt-4 md:pt-0 md:pl-5">
          <WatchlistSignals />
        </div>
      </div>
    </div>
  )
}
