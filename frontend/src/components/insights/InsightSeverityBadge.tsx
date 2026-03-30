'use client'

import { cn }                   from '@/lib/utils'
import type { InsightSeverity } from '@/lib/insights'

const STYLES: Record<InsightSeverity, string> = {
  critical: 'bg-red-100    text-red-700    border-red-200',
  warning:  'bg-amber-100  text-amber-700  border-amber-200',
  info:     'bg-blue-100   text-blue-700   border-blue-200',
  positive: 'bg-emerald-100 text-emerald-700 border-emerald-200',
}

const ICONS: Record<InsightSeverity, string> = {
  critical: '⚠',
  warning:  '⚡',
  info:     'ℹ',
  positive: '✓',
}

const LABELS: Record<InsightSeverity, string> = {
  critical: 'Critical',
  warning:  'Warning',
  info:     'Info',
  positive: 'Positive',
}

interface Props {
  severity: InsightSeverity
  showLabel?: boolean
}

export function InsightSeverityBadge({ severity, showLabel = true }: Props) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5',
        'text-[10px] font-bold uppercase tracking-wider shrink-0',
        STYLES[severity]
      )}
    >
      <span>{ICONS[severity]}</span>
      {showLabel && <span>{LABELS[severity]}</span>}
    </span>
  )
}
