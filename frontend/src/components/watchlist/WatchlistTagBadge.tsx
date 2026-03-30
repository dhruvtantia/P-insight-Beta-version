'use client'

/**
 * WatchlistTagBadge — colored conviction/category badge
 * -------------------------------------------------------
 * Renders a pill badge for a watchlist tag value.
 * Colors are defined in WATCHLIST_TAG_STYLES in constants/index.ts.
 *
 * size='sm'  → compact badge for table rows
 * size='md'  → larger badge for detail views or form previews
 */

import { cn } from '@/lib/utils'
import { WATCHLIST_TAG_STYLES, type WatchlistTagConst } from '@/constants'
import type { WatchlistTag } from '@/types'

const DEFAULT_STYLE = { bg: 'bg-slate-100', text: 'text-slate-500', border: 'border-slate-200', dot: 'bg-slate-300' }

function resolveStyle(tag: WatchlistTag | string | null | undefined) {
  if (!tag) return DEFAULT_STYLE
  return WATCHLIST_TAG_STYLES[tag as WatchlistTagConst] ?? DEFAULT_STYLE
}

interface Props {
  tag:       WatchlistTag | string | null | undefined
  size?:     'sm' | 'md'
  showDot?:  boolean
  className?: string
}

export function WatchlistTagBadge({ tag, size = 'sm', showDot = true, className }: Props) {
  const style = resolveStyle(tag)
  const label = tag ?? 'General'

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border font-medium',
        size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs',
        style.bg, style.text, style.border,
        className
      )}
    >
      {showDot && (
        <span className={cn('rounded-full shrink-0', style.dot, size === 'sm' ? 'h-1.5 w-1.5' : 'h-2 w-2')} />
      )}
      {label}
    </span>
  )
}
