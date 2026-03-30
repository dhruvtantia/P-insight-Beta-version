'use client'

/**
 * EventBadge — colour-coded pill for a news event type.
 *
 * Uses NEWS_EVENT_STYLES from constants. Falls back to a neutral style
 * for unknown event types so future backend additions don't break the UI.
 */

import { cn }                        from '@/lib/utils'
import { NEWS_EVENT_STYLES,
         NEWS_EVENT_LABELS }         from '@/constants'
import type { NewsEventType }        from '@/types'

interface Props {
  eventType: NewsEventType | string
  size?:     'xs' | 'sm'
}

const DEFAULT_STYLE = { bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-200' }

export function EventBadge({ eventType, size = 'sm' }: Props) {
  const style  = NEWS_EVENT_STYLES[eventType as NewsEventType] ?? DEFAULT_STYLE
  const label  = NEWS_EVENT_LABELS[eventType as NewsEventType] ?? eventType

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border font-medium',
        style.bg, style.text, style.border,
        size === 'xs' ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-0.5 text-[10px]'
      )}
    >
      {label}
    </span>
  )
}
