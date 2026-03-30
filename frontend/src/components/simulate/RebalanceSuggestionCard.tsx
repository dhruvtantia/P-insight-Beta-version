/**
 * RebalanceSuggestionCard — renders a single rebalancing suggestion
 * -----------------------------------------------------------------
 * Shows: type badge | priority badge | title | rationale | impact pills | Apply button
 *
 * type === 'trim'              → amber card
 * type === 'add_from_watchlist' → emerald card
 * type === 'remove'            → red card
 * type === 'rebalance'         → indigo card
 */

'use client'

import { Scissors, PlusCircle, MinusCircle, RefreshCw } from 'lucide-react'
import { cn }           from '@/lib/utils'
import type { RebalanceSuggestion } from '@/lib/simulation'

// ─── Config ───────────────────────────────────────────────────────────────────

const TYPE_CONFIG = {
  trim: {
    label:  'Trim',
    Icon:   Scissors,
    border: 'border-amber-200',
    bg:     'bg-amber-50/60',
    icon:   'text-amber-600',
    badge:  'bg-amber-100 text-amber-700 border-amber-200',
  },
  add_from_watchlist: {
    label:  'Add',
    Icon:   PlusCircle,
    border: 'border-emerald-200',
    bg:     'bg-emerald-50/60',
    icon:   'text-emerald-600',
    badge:  'bg-emerald-100 text-emerald-700 border-emerald-200',
  },
  remove: {
    label:  'Remove',
    Icon:   MinusCircle,
    border: 'border-red-200',
    bg:     'bg-red-50/60',
    icon:   'text-red-600',
    badge:  'bg-red-100 text-red-700 border-red-200',
  },
  rebalance: {
    label:  'Rebalance',
    Icon:   RefreshCw,
    border: 'border-indigo-200',
    bg:     'bg-indigo-50/60',
    icon:   'text-indigo-600',
    badge:  'bg-indigo-100 text-indigo-700 border-indigo-200',
  },
} as const

const PRIORITY_BADGE: Record<string, string> = {
  high:   'bg-red-100    text-red-700    border-red-200',
  medium: 'bg-amber-100  text-amber-700  border-amber-200',
  low:    'bg-slate-100  text-slate-600  border-slate-200',
}

// ─── Impact pill ──────────────────────────────────────────────────────────────

function ImpactPill({
  label,
  value,
  positive,
}: {
  label:    string
  value:    string
  positive: boolean
}) {
  return (
    <span className={cn(
      'flex items-center gap-1 rounded-full border text-[10px] font-bold px-2 py-0.5',
      positive
        ? 'bg-emerald-50  text-emerald-700 border-emerald-200'
        : 'bg-red-50      text-red-700     border-red-200'
    )}>
      {positive ? '↑' : '↓'} {label} {value}
    </span>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

interface RebalanceSuggestionCardProps {
  suggestion: RebalanceSuggestion
  onApply?:   (s: RebalanceSuggestion) => void
}

export function RebalanceSuggestionCard({
  suggestion,
  onApply,
}: RebalanceSuggestionCardProps) {
  const cfg = TYPE_CONFIG[suggestion.type]
  const { Icon } = cfg

  const hhiImproved  = suggestion.impact.hhi_delta < 0
  const divImproved  = suggestion.impact.div_score_delta > 0

  return (
    <div className={cn(
      'rounded-xl border px-4 py-3.5',
      cfg.border,
      cfg.bg,
    )}>
      {/* Header */}
      <div className="flex items-start gap-2.5 mb-2">
        <Icon className={cn('h-4 w-4 mt-0.5 shrink-0', cfg.icon)} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            {/* Type badge */}
            <span className={cn(
              'rounded-full border text-[10px] font-bold px-2 py-0.5 shrink-0',
              cfg.badge,
            )}>
              {cfg.label}
            </span>
            {/* Priority badge */}
            <span className={cn(
              'rounded-full border text-[10px] font-bold px-2 py-0.5 shrink-0',
              PRIORITY_BADGE[suggestion.priority],
            )}>
              {suggestion.priority}
            </span>
          </div>
          <p className="text-xs font-semibold text-slate-800 leading-snug">{suggestion.title}</p>
        </div>
      </div>

      {/* Rationale */}
      <p className="text-[12px] text-slate-600 leading-relaxed mb-3 pl-6.5">
        {suggestion.rationale}
      </p>

      {/* Impact + Apply */}
      <div className="flex items-center justify-between flex-wrap gap-2 pl-0">
        {/* Impact pills */}
        <div className="flex gap-1.5 flex-wrap">
          {Math.abs(suggestion.impact.hhi_delta) > 0.0001 && (
            <ImpactPill
              label="HHI"
              value={(Math.abs(suggestion.impact.hhi_delta) * 1000).toFixed(1) + 'm'}
              positive={hhiImproved}
            />
          )}
          {Math.abs(suggestion.impact.div_score_delta) > 0.1 && (
            <ImpactPill
              label="Div"
              value={`${Math.abs(suggestion.impact.div_score_delta).toFixed(0)}pts`}
              positive={divImproved}
            />
          )}
        </div>

        {/* Apply button */}
        {onApply && (
          <button
            onClick={() => onApply(suggestion)}
            className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white
                       px-2.5 py-1.5 text-[11px] font-semibold text-slate-700
                       hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-700
                       transition-colors shrink-0"
          >
            Apply →
          </button>
        )}
      </div>
    </div>
  )
}
