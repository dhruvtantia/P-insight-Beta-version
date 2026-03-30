/**
 * RiskMetricItem
 * ---------------
 * A single metric row used throughout the risk UI.
 *
 * Layout: [status dot] [label] [tooltip?]   [value]
 *                              [description]
 *
 * Status colours:
 *   good    → emerald
 *   warning → amber
 *   danger  → red
 *   neutral → slate
 */

'use client'

import { cn } from '@/lib/utils'
import { TooltipHelp } from '@/components/common/TooltipHelp'
import type { RiskStatus } from '@/lib/risk'

// ─── Config ───────────────────────────────────────────────────────────────────

const STATUS_DOT: Record<RiskStatus, string> = {
  good:    'bg-emerald-500',
  warning: 'bg-amber-400',
  danger:  'bg-red-500',
  neutral: 'bg-slate-300',
}

const STATUS_VALUE: Record<RiskStatus, string> = {
  good:    'text-emerald-700',
  warning: 'text-amber-700',
  danger:  'text-red-600',
  neutral: 'text-slate-700',
}

const STATUS_BG: Record<RiskStatus, string> = {
  good:    'bg-emerald-50',
  warning: 'bg-amber-50',
  danger:  'bg-red-50',
  neutral: 'bg-slate-50',
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface RiskMetricItemProps {
  label: string
  value: string
  status: RiskStatus
  /** Key in METRIC_TOOLTIPS */
  tooltipMetric?: string
  /** Inline tooltip text (overrides tooltipMetric) */
  tooltipText?: string
  /** One-line plain English description shown below value */
  description?: string
  /** Compact single-line mode for dashboard strip */
  compact?: boolean
  className?: string
}

// ─── Component ────────────────────────────────────────────────────────────────

export function RiskMetricItem({
  label,
  value,
  status,
  tooltipMetric,
  tooltipText,
  description,
  compact = false,
  className,
}: RiskMetricItemProps) {
  if (compact) {
    // Single-line mode: dot | label | value — used in dashboard strip
    return (
      <div className={cn('flex items-center justify-between gap-3 py-1.5', className)}>
        <div className="flex items-center gap-1.5 min-w-0">
          <div className={cn('h-1.5 w-1.5 rounded-full shrink-0', STATUS_DOT[status])} />
          <span className="text-xs text-slate-500 truncate">{label}</span>
          {(tooltipMetric || tooltipText) && (
            <TooltipHelp metric={tooltipMetric} text={tooltipText} />
          )}
        </div>
        <span className={cn('text-xs font-bold tabular-nums shrink-0', STATUS_VALUE[status])}>
          {value}
        </span>
      </div>
    )
  }

  // Full mode: used on the /risk page
  // Detect "long" values (sector names + %) to use smaller font
  const isLongValue = value.length > 12

  return (
    <div
      className={cn(
        'rounded-lg border border-slate-100 p-4 transition-colors',
        STATUS_BG[status],
        className
      )}
    >
      {/* Header row: label + tooltip on left, value on right */}
      <div className="flex items-start gap-2 mb-1">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <div className={cn('h-2 w-2 rounded-full shrink-0 mt-0.5', STATUS_DOT[status])} />
          <span className="text-xs font-semibold text-slate-600 leading-snug">{label}</span>
          {(tooltipMetric || tooltipText) && (
            <TooltipHelp metric={tooltipMetric} text={tooltipText} />
          )}
        </div>
        <span className={cn(
          'font-bold tabular-nums shrink-0 text-right leading-snug',
          isLongValue ? 'text-xs' : 'text-sm',
          STATUS_VALUE[status]
        )}>
          {value}
        </span>
      </div>

      {description && (
        <p className="text-[11px] text-slate-500 leading-relaxed pl-3.5">{description}</p>
      )}
    </div>
  )
}
