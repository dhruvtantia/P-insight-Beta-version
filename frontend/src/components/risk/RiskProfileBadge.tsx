/**
 * RiskProfileBadge
 * -----------------
 * Coloured pill displaying the portfolio's rule-based risk profile.
 *
 * Colour mapping (finance-conventional):
 *   highly_concentrated  → red
 *   sector_concentrated  → orange
 *   aggressive           → amber
 *   moderate             → blue
 *   conservative         → emerald
 */

'use client'

import { cn } from '@/lib/utils'
import type { RiskProfile } from '@/types'

// ─── Config ───────────────────────────────────────────────────────────────────

const PROFILE_CONFIG: Record<
  RiskProfile,
  { label: string; classes: string; dotClass: string }
> = {
  highly_concentrated: {
    label: 'Highly Concentrated',
    classes: 'bg-red-50 text-red-700 border-red-200',
    dotClass: 'bg-red-500',
  },
  sector_concentrated: {
    label: 'Sector Concentrated',
    classes: 'bg-orange-50 text-orange-700 border-orange-200',
    dotClass: 'bg-orange-500',
  },
  aggressive: {
    label: 'Aggressive',
    classes: 'bg-amber-50 text-amber-800 border-amber-200',
    dotClass: 'bg-amber-500',
  },
  moderate: {
    label: 'Moderate',
    classes: 'bg-blue-50 text-blue-700 border-blue-200',
    dotClass: 'bg-blue-500',
  },
  conservative: {
    label: 'Conservative',
    classes: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    dotClass: 'bg-emerald-500',
  },
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface RiskProfileBadgeProps {
  profile: RiskProfile
  size?: 'sm' | 'md' | 'lg'
  showDot?: boolean
  className?: string
}

// ─── Component ────────────────────────────────────────────────────────────────

export function RiskProfileBadge({
  profile,
  size = 'md',
  showDot = true,
  className,
}: RiskProfileBadgeProps) {
  const config = PROFILE_CONFIG[profile]

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-[10px]',
    md: 'px-2.5 py-1 text-xs',
    lg: 'px-3 py-1.5 text-sm',
  }

  const dotSizes = {
    sm: 'h-1.5 w-1.5',
    md: 'h-2 w-2',
    lg: 'h-2.5 w-2.5',
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border font-semibold tracking-wide',
        config.classes,
        sizeClasses[size],
        className
      )}
    >
      {showDot && (
        <span className={cn('rounded-full shrink-0', config.dotClass, dotSizes[size])} />
      )}
      {config.label}
    </span>
  )
}

/**
 * Helper: get the raw label string for a profile (for use outside JSX).
 */
export function riskProfileLabel(profile: RiskProfile): string {
  return PROFILE_CONFIG[profile]?.label ?? profile
}
