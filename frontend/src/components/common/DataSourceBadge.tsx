/**
 * DataSourceBadge
 * ----------------
 * Small inline badge that shows the provenance of a data point.
 * Used on holding rows, fundamentals cards, and the data mode toggle.
 *
 * Variants:
 *   live          — green  — "LIVE"          (real yfinance quote)
 *   db_only       — blue   — "STORED"        (yfinance unavailable, using DB-stored price)
 *   mock_fallback — amber  — "MOCK"          (yfinance miss, fell back to static)
 *   uploaded      — blue   — "UPLOADED"      (user-supplied file)
 *   mock          — slate  — "MOCK"          (default static data)
 *   unavailable   — red    — "UNAVAILABLE"   (yfinance failed, no stored price)
 */

import { cn } from '@/lib/utils'

export type DataSourceVariant =
  | 'live'
  | 'db_only'
  | 'mock_fallback'
  | 'uploaded'
  | 'mock'
  | 'unavailable'

const STYLES: Record<DataSourceVariant, { bg: string; text: string; border: string; label: string }> = {
  live:          { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', label: 'LIVE'        },
  db_only:       { bg: 'bg-sky-50',     text: 'text-sky-700',     border: 'border-sky-200',     label: 'STORED'      },
  mock_fallback: { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200',   label: 'MOCK'        },
  uploaded:      { bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-200',    label: 'UPLOADED'    },
  mock:          { bg: 'bg-slate-100',  text: 'text-slate-500',   border: 'border-slate-200',   label: 'MOCK'        },
  unavailable:   { bg: 'bg-red-50',     text: 'text-red-600',     border: 'border-red-200',     label: 'UNAVAILABLE' },
}

interface DataSourceBadgeProps {
  /** The data source to display */
  source: DataSourceVariant | string | null | undefined
  /** Override the label text */
  label?: string
  /** Extra Tailwind classes */
  className?: string
  /** Show as a dot-only indicator with no text */
  dotOnly?: boolean
}

export function DataSourceBadge({
  source,
  label,
  className,
  dotOnly = false,
}: DataSourceBadgeProps) {
  const variant: DataSourceVariant =
    source === 'live'          ? 'live'
    : source === 'db_only'      ? 'db_only'
    : source === 'mock_fallback' ? 'mock_fallback'
    : source === 'uploaded'    ? 'uploaded'
    : source === 'unavailable' ? 'unavailable'
    : 'mock'

  const { bg, text, border, label: defaultLabel } = STYLES[variant]
  const displayLabel = label ?? defaultLabel

  if (dotOnly) {
    const dotColor: Record<DataSourceVariant, string> = {
      live:          'bg-emerald-500',
      db_only:       'bg-sky-400',
      mock_fallback: 'bg-amber-400',
      uploaded:      'bg-blue-500',
      mock:          'bg-slate-400',
      unavailable:   'bg-red-500',
    }
    return (
      <span
        className={cn('inline-block h-1.5 w-1.5 rounded-full', dotColor[variant], className)}
        title={displayLabel}
      />
    )
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded border px-1.5 py-0.5',
        'text-[10px] font-bold tracking-wide uppercase',
        bg, text, border,
        className,
      )}
    >
      {variant === 'live' && (
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 mr-0.5" />
      )}
      {displayLabel}
    </span>
  )
}
