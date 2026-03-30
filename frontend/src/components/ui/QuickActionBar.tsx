/**
 * QuickActionBar — horizontal row of quick-navigation action buttons.
 *
 * Usage:
 *   <QuickActionBar actions={[
 *     { icon: MessageCircle, label: 'Ask Advisor', href: '/advisor', color: 'indigo' },
 *     { icon: GitFork,       label: 'Simulate',    href: '/simulate', color: 'violet' },
 *     { icon: Newspaper,     label: 'News',         href: '/news',     color: 'slate'  },
 *   ]} />
 */

import Link from 'next/link'
import { cn } from '@/lib/utils'

type ActionColor = 'indigo' | 'violet' | 'emerald' | 'amber' | 'slate' | 'rose'

const COLOR_MAP: Record<ActionColor, { pill: string; icon: string }> = {
  indigo:  { pill: 'bg-indigo-50  hover:bg-indigo-100  text-indigo-700  border-indigo-200',  icon: 'text-indigo-500'  },
  violet:  { pill: 'bg-violet-50  hover:bg-violet-100  text-violet-700  border-violet-200',  icon: 'text-violet-500'  },
  emerald: { pill: 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200', icon: 'text-emerald-500' },
  amber:   { pill: 'bg-amber-50   hover:bg-amber-100   text-amber-700   border-amber-200',   icon: 'text-amber-500'   },
  slate:   { pill: 'bg-slate-50   hover:bg-slate-100   text-slate-700   border-slate-200',   icon: 'text-slate-500'   },
  rose:    { pill: 'bg-rose-50    hover:bg-rose-100    text-rose-700    border-rose-200',     icon: 'text-rose-500'    },
}

export interface QuickAction {
  icon: React.ElementType
  label: string
  description?: string
  href?: string
  onClick?: () => void
  color?: ActionColor
  badge?: string
}

interface QuickActionBarProps {
  actions: QuickAction[]
  className?: string
}

export function QuickActionBar({ actions, className }: QuickActionBarProps) {
  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {actions.map((action) => {
        const color  = action.color ?? 'slate'
        const colors = COLOR_MAP[color]
        const Icon   = action.icon

        const inner = (
          <div className={cn(
            'flex items-center gap-2 rounded-xl border px-4 py-2.5 transition-colors cursor-pointer',
            colors.pill,
          )}>
            <Icon className={cn('h-4 w-4 shrink-0', colors.icon)} />
            <div className="leading-tight">
              <p className="text-xs font-semibold">{action.label}</p>
              {action.description && (
                <p className="text-[10px] opacity-70 mt-0.5">{action.description}</p>
              )}
            </div>
            {action.badge && (
              <span className="ml-1 rounded-full bg-white/70 border border-current/20 px-1.5 py-px text-[10px] font-bold">
                {action.badge}
              </span>
            )}
          </div>
        )

        if (action.href) {
          return (
            <Link key={action.label} href={action.href}>
              {inner}
            </Link>
          )
        }

        return (
          <button key={action.label} onClick={action.onClick}>
            {inner}
          </button>
        )
      })}
    </div>
  )
}
