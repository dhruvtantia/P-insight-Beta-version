/**
 * DeltaBadge
 * -----------
 * Small coloured badge showing a signed numerical change.
 * Used for weight deltas ("+2.3 pp"), value deltas ("−₹12k"), etc.
 *
 * Variants:
 *   'weight'   — formats as " ±X.X pp "
 *   'value'    — formats as " ±₹XX,XXX "
 *   'pct'      — formats as " ±X.X% "
 *   'raw'      — uses the label prop as-is
 */

import React from 'react'
import { cn } from '@/lib/utils'
import type { DeltaStatus } from '@/lib/delta'
import { statusBg, formatWeightDelta, formatValueDelta, formatPct } from '@/lib/delta'

interface DeltaBadgeProps {
  value?:    number | null
  status?:   DeltaStatus
  variant?:  'weight' | 'value' | 'pct' | 'raw'
  label?:    string           // used when variant='raw'
  currency?: string
  className?: string
  size?:     'xs' | 'sm'
}

export function DeltaBadge({
  value,
  status,
  variant  = 'weight',
  label,
  currency = '₹',
  className,
  size     = 'sm',
}: DeltaBadgeProps): React.ReactElement | null {
  // Determine display status for colouring
  const resolvedStatus: DeltaStatus =
    status ??
    (value == null ? 'unchanged'
      : value > 0  ? 'increased'
      : value < 0  ? 'decreased'
      : 'unchanged')

  let text: string
  if (variant === 'raw' && label != null) {
    text = label
  } else if (variant === 'value') {
    text = formatValueDelta(value, currency)
  } else if (variant === 'pct') {
    text = formatPct(value)
  } else {
    text = formatWeightDelta(value)
  }

  const sizeClass = size === 'xs'
    ? 'text-[10px] px-1.5 py-0.5'
    : 'text-xs px-2 py-0.5'

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full font-medium leading-none tabular-nums',
        sizeClass,
        statusBg(resolvedStatus),
        className
      )}
    >
      {text}
    </span>
  )
}
