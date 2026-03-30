/**
 * AdvisorResponseCard — renders a structured AdvisorResponse
 * -----------------------------------------------------------
 * Displays the structured output from lib/advisor.ts:
 *   • Header: category icon + category label
 *   • Summary pill: one-sentence top-level answer
 *   • Items: insight / suggestion / warning sub-cards
 *   • Follow-up chips: clickable next questions
 */

'use client'

import {
  Lightbulb,
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  PieChart,
  Wallet,
  BarChart2,
  Star,
  Activity,
  Users,
  Cpu,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AdvisorResponse, AdvisorItem, AdvisorCategory } from '@/lib/advisor'

// ─── Category meta ────────────────────────────────────────────────────────────

const CATEGORY_META: Record<AdvisorCategory, { label: string; Icon: React.ElementType; color: string }> = {
  diversification: { label: 'Diversification',  Icon: PieChart,       color: 'text-violet-600'  },
  concentration:   { label: 'Concentration',     Icon: Activity,       color: 'text-orange-600'  },
  dividend:        { label: 'Dividend Income',   Icon: Wallet,         color: 'text-emerald-600' },
  valuation:       { label: 'Valuation',         Icon: BarChart2,      color: 'text-blue-600'    },
  watchlist:       { label: 'Watchlist',         Icon: Star,           color: 'text-amber-600'   },
  performance:     { label: 'Performance',       Icon: TrendingUp,     color: 'text-indigo-600'  },
  peer:            { label: 'Peer Comparison',   Icon: Users,          color: 'text-pink-600'    },
  general:         { label: 'Portfolio Overview',Icon: Cpu,            color: 'text-slate-600'   },
}

// ─── Item card ────────────────────────────────────────────────────────────────

function ItemCard({ item }: { item: AdvisorItem }) {
  if (item.type === 'insight') {
    return (
      <div className="rounded-lg border border-blue-100 bg-blue-50/60 px-4 py-3">
        <div className="flex items-start gap-2.5">
          <Lightbulb className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <p className="text-xs font-semibold text-slate-800">{item.title}</p>
              {item.metric && (
                <span className="rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold px-2 py-0.5 border border-blue-200">
                  {item.metric}
                </span>
              )}
              {item.confidence !== 'high' && (
                <span className="text-[10px] text-slate-400 italic">{item.confidence} confidence</span>
              )}
            </div>
            <p className="text-[12px] text-slate-600 leading-relaxed">{item.explanation}</p>
          </div>
        </div>
      </div>
    )
  }

  if (item.type === 'suggestion') {
    const priorityColor =
      item.priority === 'high'   ? 'border-amber-200 bg-amber-50/60'   :
      item.priority === 'medium' ? 'border-indigo-100 bg-indigo-50/60' :
                                   'border-slate-100 bg-slate-50/60'
    const iconColor =
      item.priority === 'high'   ? 'text-amber-500'  :
      item.priority === 'medium' ? 'text-indigo-400' :
                                   'text-slate-400'
    return (
      <div className={cn('rounded-lg border px-4 py-3', priorityColor)}>
        <div className="flex items-start gap-2.5">
          <ArrowRight className={cn('h-4 w-4 mt-0.5 shrink-0', iconColor)} />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <p className="text-xs font-semibold text-slate-800">{item.action}</p>
              <span className={cn(
                'rounded-full text-[10px] font-bold px-2 py-0.5 border shrink-0',
                item.priority === 'high'   ? 'bg-amber-100  text-amber-700  border-amber-200'  :
                item.priority === 'medium' ? 'bg-indigo-100 text-indigo-700 border-indigo-200' :
                                             'bg-slate-100  text-slate-600  border-slate-200'
              )}>
                {item.priority} priority
              </span>
            </div>
            <p className="text-[12px] text-slate-600 leading-relaxed">{item.rationale}</p>
          </div>
        </div>
      </div>
    )
  }

  // warning
  const criticalStyle = item.severity === 'critical'
    ? 'border-red-200 bg-red-50/60'
    : 'border-amber-200 bg-amber-50/60'
  const iconStyle = item.severity === 'critical' ? 'text-red-500' : 'text-amber-500'

  return (
    <div className={cn('rounded-lg border px-4 py-3', criticalStyle)}>
      <div className="flex items-start gap-2.5">
        <AlertTriangle className={cn('h-4 w-4 mt-0.5 shrink-0', iconStyle)} />
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <p className="text-xs font-semibold text-slate-800">{item.issue}</p>
            <span className={cn(
              'rounded-full text-[10px] font-bold px-2 py-0.5 border shrink-0',
              item.severity === 'critical'
                ? 'bg-red-100    text-red-700    border-red-200'
                : 'bg-amber-100  text-amber-700  border-amber-200'
            )}>
              {item.severity}
            </span>
          </div>
          <p className="text-[12px] text-slate-600 leading-relaxed">{item.detail}</p>
        </div>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface AdvisorResponseCardProps {
  response:    AdvisorResponse
  onFollowUp?: (question: string) => void
  compact?:    boolean   // for dashboard panel — fewer items, no follow-ups
}

export function AdvisorResponseCard({
  response,
  onFollowUp,
  compact = false,
}: AdvisorResponseCardProps) {
  const meta = CATEGORY_META[response.category]
  const { Icon, color } = meta

  const visibleItems = compact ? response.items.slice(0, 2) : response.items

  return (
    <div className="rounded-xl border border-slate-100 bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-100 bg-slate-50/60">
        <Icon className={cn('h-4 w-4 shrink-0', color)} />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          {meta.label}
        </span>
      </div>

      {/* Summary */}
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-start gap-2">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 mt-0.5 shrink-0" />
          <p className="text-sm text-slate-700 leading-relaxed font-medium">{response.summary}</p>
        </div>
      </div>

      {/* Items */}
      {visibleItems.length > 0 && (
        <div className="px-4 pb-3 space-y-2">
          {visibleItems.map((item, i) => (
            <ItemCard key={i} item={item} />
          ))}
        </div>
      )}

      {/* Follow-up chips */}
      {!compact && onFollowUp && response.followUps.length > 0 && (
        <div className="border-t border-slate-100 px-4 py-3 bg-slate-50/40">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
            Ask next
          </p>
          <div className="flex flex-wrap gap-1.5">
            {response.followUps.map((q) => (
              <button
                key={q}
                onClick={() => onFollowUp(q)}
                className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px]
                           text-slate-600 hover:bg-indigo-50 hover:border-indigo-200
                           hover:text-indigo-700 transition-colors"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
