'use client'

import Link                      from 'next/link'
import { ArrowRight }            from 'lucide-react'
import { cn }                    from '@/lib/utils'
import { InsightSeverityBadge }  from './InsightSeverityBadge'
import type { PortfolioInsightItem } from '@/lib/insights'

const CATEGORY_LABELS: Record<string, string> = {
  concentration:   'Concentration',
  valuation:       'Valuation',
  quality:         'Quality',
  income:          'Income',
  diversification: 'Diversification',
  performance:     'Performance',
  watchlist:       'Watchlist',
}

const CARD_BORDER: Record<string, string> = {
  critical: 'border-l-red-400',
  warning:  'border-l-amber-400',
  info:     'border-l-blue-300',
  positive: 'border-l-emerald-400',
}

interface Props {
  insight: PortfolioInsightItem
}

export function InsightCard({ insight }: Props) {
  return (
    <div
      className={cn(
        'rounded-xl border border-slate-100 bg-white p-4',
        'border-l-4 transition-shadow hover:shadow-sm',
        CARD_BORDER[insight.severity] ?? 'border-l-slate-200'
      )}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <InsightSeverityBadge severity={insight.severity} />
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            {CATEGORY_LABELS[insight.category] ?? insight.category}
          </span>
        </div>

        {/* Metric callout */}
        {insight.metric && (
          <div className="text-right shrink-0">
            <p className="text-base font-bold text-slate-800 leading-none tabular-nums">
              {insight.metric.value}
            </p>
            <p className="text-[9px] text-slate-400 mt-0.5">{insight.metric.label}</p>
          </div>
        )}
      </div>

      {/* Title */}
      <p className="text-sm font-semibold text-slate-800 leading-snug mb-1">
        {insight.title}
      </p>

      {/* Message */}
      <p className="text-xs text-slate-500 leading-relaxed">
        {insight.message}
      </p>

      {/* Action link */}
      {insight.action && (
        <Link
          href={insight.action.href}
          className="inline-flex items-center gap-1 mt-2.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors"
        >
          {insight.action.label}
          <ArrowRight className="h-3 w-3" />
        </Link>
      )}
    </div>
  )
}
