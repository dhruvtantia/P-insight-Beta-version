/**
 * SectionHeader — shared section divider used across all pages.
 *
 * Usage:
 *   <SectionHeader icon={Activity} title="Risk Analysis" />
 *   <SectionHeader title="Holdings" subtitle="Click a row to compare peers" action={{ label: 'View all', href: '/holdings' }} />
 */

import Link from 'next/link'
import { cn } from '@/lib/utils'

interface SectionHeaderProps {
  /** Lucide icon component */
  icon?: React.ElementType
  title: string
  subtitle?: string
  /** Optional right-side action link */
  action?: { label: string; href: string }
  /** Extra className on the wrapper */
  className?: string
  /** Tight spacing variant — removes top padding */
  flush?: boolean
}

export function SectionHeader({
  icon: Icon,
  title,
  subtitle,
  action,
  className,
  flush = false,
}: SectionHeaderProps) {
  return (
    <div className={cn(
      'flex items-end justify-between',
      !flush && 'pt-1',
      className,
    )}>
      <div className="flex items-center gap-2.5">
        {Icon && (
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 shrink-0">
            <Icon className="h-3.5 w-3.5 text-slate-500" />
          </div>
        )}
        <div>
          <h2 className="text-sm font-semibold text-slate-800 leading-tight">{title}</h2>
          {subtitle && (
            <p className="text-[11px] text-slate-400 mt-0.5 leading-tight">{subtitle}</p>
          )}
        </div>
      </div>

      {action && (
        <Link
          href={action.href}
          className="text-[11px] font-medium text-indigo-600 hover:text-indigo-800 transition-colors shrink-0"
        >
          {action.label} →
        </Link>
      )}
    </div>
  )
}
