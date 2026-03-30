/**
 * ContextSummaryStrip — slim horizontal data strip showing key stats.
 * Used to provide context when landing on a page from another.
 *
 * Usage:
 *   <ContextSummaryStrip
 *     items={[
 *       { label: 'Holdings', value: '12' },
 *       { label: 'Risk',     value: 'Moderate', badge: true, badgeColor: 'amber' },
 *       { label: 'P/E',      value: '22.4×' },
 *     ]}
 *   />
 */

import { cn } from '@/lib/utils'

type BadgeColor = 'emerald' | 'amber' | 'red' | 'indigo' | 'slate'

const BADGE_COLORS: Record<BadgeColor, string> = {
  emerald: 'bg-emerald-100 text-emerald-700',
  amber:   'bg-amber-100   text-amber-700',
  red:     'bg-red-100     text-red-700',
  indigo:  'bg-indigo-100  text-indigo-700',
  slate:   'bg-slate-100   text-slate-600',
}

export interface StripItem {
  label: string
  value: string
  /** Renders the value as a badge pill */
  badge?: boolean
  badgeColor?: BadgeColor
  /** Lucide icon component */
  icon?: React.ElementType
}

interface ContextSummaryStripProps {
  items: StripItem[]
  className?: string
  loading?: boolean
}

export function ContextSummaryStrip({
  items,
  className,
  loading = false,
}: ContextSummaryStripProps) {
  if (loading) {
    return (
      <div className={cn(
        'flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-slate-100',
        'bg-slate-50 px-4 py-3 animate-pulse',
        className,
      )}>
        {[1,2,3,4].map((i) => (
          <div key={i} className="flex flex-col gap-1">
            <div className="h-2.5 w-12 rounded bg-slate-200" />
            <div className="h-4 w-16 rounded bg-slate-200" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className={cn(
      'flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-slate-100',
      'bg-slate-50 px-4 py-3',
      className,
    )}>
      {items.map((item, idx) => {
        const Icon = item.icon
        return (
          <div key={idx} className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1">
              {Icon && <Icon className="h-3 w-3 text-slate-400" />}
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                {item.label}
              </p>
            </div>
            {item.badge ? (
              <span className={cn(
                'inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold w-fit',
                BADGE_COLORS[item.badgeColor ?? 'slate'],
              )}>
                {item.value}
              </span>
            ) : (
              <p className="text-sm font-semibold text-slate-800">{item.value}</p>
            )}
          </div>
        )
      })}

      {/* Separator between each item except last */}
      <style jsx>{`
        div > div:not(:last-child)::after {
          display: none;
        }
      `}</style>
    </div>
  )
}
