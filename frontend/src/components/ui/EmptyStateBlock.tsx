/**
 * EmptyStateBlock — standard empty / zero-data state.
 *
 * Usage:
 *   <EmptyStateBlock icon={Star} title="No watchlist items" body="Add tickers to start tracking." />
 *   <EmptyStateBlock icon={GitFork} title="Nothing simulated" body="..." cta={{ label: 'Add from watchlist', onClick: fn }} />
 */

import { cn } from '@/lib/utils'
import Link from 'next/link'

interface EmptyStateCta {
  label: string
  href?: string
  onClick?: () => void
}

interface EmptyStateBlockProps {
  icon?: React.ElementType
  title: string
  body?: string
  cta?: EmptyStateCta
  /** compact = smaller padding */
  compact?: boolean
  className?: string
}

export function EmptyStateBlock({
  icon: Icon,
  title,
  body,
  cta,
  compact = false,
  className,
}: EmptyStateBlockProps) {
  return (
    <div className={cn(
      'flex flex-col items-center justify-center text-center rounded-xl',
      'border-2 border-dashed border-slate-200 bg-slate-50/50',
      compact ? 'py-8 px-6' : 'py-14 px-8',
      className,
    )}>
      {Icon && (
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 mb-3">
          <Icon className="h-5 w-5 text-slate-400" />
        </div>
      )}
      <p className="text-sm font-semibold text-slate-600">{title}</p>
      {body && (
        <p className="text-xs text-slate-400 mt-1 max-w-xs leading-relaxed">{body}</p>
      )}
      {cta && (
        cta.href
          ? (
            <Link
              href={cta.href}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2
                         text-xs font-semibold text-white hover:bg-indigo-700 transition-colors"
            >
              {cta.label}
            </Link>
          )
          : (
            <button
              onClick={cta.onClick}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2
                         text-xs font-semibold text-white hover:bg-indigo-700 transition-colors"
            >
              {cta.label}
            </button>
          )
      )}
    </div>
  )
}
