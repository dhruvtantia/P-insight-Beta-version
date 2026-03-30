'use client'

/**
 * NewsCard — individual article card in the news feed.
 *
 * Displays:
 *   • EventBadge (event type)
 *   • Sentiment dot (positive / negative / neutral)
 *   • Headline + summary
 *   • Source, date, ticker chips
 *   • External link icon if url is a real link
 */

import { ExternalLink }               from 'lucide-react'
import { cn }                         from '@/lib/utils'
import { NEWS_SENTIMENT_STYLES }      from '@/constants'
import { EventBadge }                 from './EventBadge'
import type { NewsArticle }           from '@/types'

interface Props {
  article:       NewsArticle
  /** If true, render in compact one-line mode for dashboard strip */
  compact?:      boolean
}

function relDate(isoDate: string): string {
  try {
    const d    = new Date(isoDate)
    const now  = new Date()
    const diff = Math.floor((now.getTime() - d.getTime()) / 86_400_000)
    if (diff === 0) return 'Today'
    if (diff === 1) return 'Yesterday'
    if (diff <= 30) return `${diff}d ago`
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })
  } catch {
    return isoDate
  }
}

export function NewsCard({ article, compact }: Props) {
  const sentiment = NEWS_SENTIMENT_STYLES[article.sentiment] ?? NEWS_SENTIMENT_STYLES.neutral
  const isRealUrl = article.url && article.url !== '#'

  if (compact) {
    return (
      <div className="flex items-start gap-3 py-3 border-b border-slate-50 last:border-0 group">
        <span
          className={cn('mt-1.5 h-2 w-2 rounded-full shrink-0', sentiment.dot)}
          title={sentiment.label}
        />
        <div className="flex-1 min-w-0">
          <p className="text-xs text-slate-700 font-medium leading-snug line-clamp-2 group-hover:text-indigo-700 transition-colors">
            {article.title}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            <EventBadge eventType={article.event_type} size="xs" />
            <span className="text-[10px] text-slate-400">{relDate(article.published_at)}</span>
          </div>
        </div>
        {isRealUrl && (
          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-slate-300 hover:text-indigo-500 shrink-0 mt-0.5"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
    )
  }

  return (
    <div className="card px-5 py-4 hover:shadow-md transition-shadow group">
      <div className="flex items-start gap-4">
        {/* Sentiment dot */}
        <span
          className={cn('mt-1.5 h-2.5 w-2.5 rounded-full shrink-0', sentiment.dot)}
          title={`Sentiment: ${sentiment.label}`}
        />

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Badges */}
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <EventBadge eventType={article.event_type} />
            {article.tickers.map((t) => {
              const base = t.replace(/\.(NS|BSE|BO)$/i, '')
              return (
                <span
                  key={t}
                  className="inline-flex items-center rounded-full bg-indigo-50 border border-indigo-100 px-2 py-0.5 text-[10px] font-mono font-semibold text-indigo-700"
                >
                  {base}
                </span>
              )
            })}
          </div>

          {/* Title */}
          <h3 className="text-sm font-semibold text-slate-800 leading-snug mb-1.5 group-hover:text-indigo-800 transition-colors">
            {article.title}
          </h3>

          {/* Summary */}
          <p className="text-xs text-slate-500 leading-relaxed line-clamp-3">
            {article.summary}
          </p>

          {/* Footer */}
          <div className="flex items-center gap-3 mt-2.5 flex-wrap">
            <span className="text-[10px] text-slate-400">{article.source}</span>
            <span className="text-[10px] text-slate-300">·</span>
            <span className="text-[10px] text-slate-400">{relDate(article.published_at)}</span>
          </div>
        </div>

        {/* External link */}
        {isRealUrl && (
          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-slate-300 hover:text-indigo-500 shrink-0 mt-0.5 transition-colors"
            title="Open article"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        )}
      </div>
    </div>
  )
}
