'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { HelpCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { METRIC_TOOLTIPS } from '@/constants'

interface TooltipHelpProps {
  /** Either a metric key from METRIC_TOOLTIPS or a custom string */
  metric?: string
  text?: string
  position?: 'top' | 'bottom' | 'left' | 'right'
  size?: 'sm' | 'md'
  className?: string
}

/**
 * TooltipHelp — the (?) help icon shown next to financial metric names.
 * Hover/click to reveal a plain-English explanation.
 *
 * Renders the tooltip via React portal into document.body so it escapes
 * any overflow:hidden ancestor (cards, table cells, etc.).
 *
 * Usage:
 *   <TooltipHelp metric="sharpe_ratio" />
 *   <TooltipHelp text="Custom explanation text" position="bottom" />
 */
export function TooltipHelp({
  metric,
  text,
  position = 'top',
  size = 'sm',
  className,
}: TooltipHelpProps) {
  const [visible, setVisible]   = useState(false)
  const [coords, setCoords]     = useState<{ top: number; left: number } | null>(null)
  const [mounted, setMounted]   = useState(false)
  const triggerRef              = useRef<HTMLButtonElement>(null)

  // Only access document on client
  useEffect(() => { setMounted(true) }, [])

  const content = text ?? (metric ? METRIC_TOOLTIPS[metric] : null)
  if (!content) return null

  const TOOLTIP_W = 256  // w-64 = 16rem = 256px
  const OFFSET    = 10

  const computeCoords = useCallback(() => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const scrollY = window.scrollY
    const scrollX = window.scrollX

    let top: number
    let left: number

    switch (position) {
      case 'bottom':
        top  = rect.bottom + scrollY + OFFSET
        left = rect.left + scrollX + rect.width / 2 - TOOLTIP_W / 2
        break
      case 'left':
        top  = rect.top + scrollY + rect.height / 2 - 20  // approx half tooltip height
        left = rect.left + scrollX - TOOLTIP_W - OFFSET
        break
      case 'right':
        top  = rect.top + scrollY + rect.height / 2 - 20
        left = rect.right + scrollX + OFFSET
        break
      case 'top':
      default:
        top  = rect.top + scrollY - OFFSET    // will subtract tooltip height via transform
        left = rect.left + scrollX + rect.width / 2 - TOOLTIP_W / 2
    }

    // Clamp horizontally so tooltip stays in viewport
    const maxLeft = window.innerWidth - TOOLTIP_W - 8
    left = Math.max(8, Math.min(left, maxLeft))

    setCoords({ top, left })
  }, [position])

  const show = useCallback(() => {
    computeCoords()
    setVisible(true)
  }, [computeCoords])

  const hide = useCallback(() => setVisible(false), [])

  // Arrow direction (visual caret)
  const arrowStyle =
    position === 'top'    ? 'bottom-[-5px] left-1/2 -translate-x-1/2 border-t-0 border-l-0'
    : position === 'bottom' ? 'top-[-5px] left-1/2 -translate-x-1/2 border-b-0 border-r-0'
    : position === 'left'   ? 'right-[-5px] top-1/2 -translate-y-1/2 border-t-0 border-r-0'
    :                         'left-[-5px] top-1/2 -translate-y-1/2 border-b-0 border-l-0'

  const tooltip = visible && mounted && coords ? createPortal(
    <div
      role="tooltip"
      style={{
        position: 'absolute',
        top:      coords.top,
        left:     coords.left,
        zIndex:   9999,
        width:    TOOLTIP_W,
        // For top position push tooltip up so bottom aligns with trigger
        transform: position === 'top' ? 'translateY(-100%)' : undefined,
        // Adjust for centering on left/right positions handled inline
      }}
      className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-xl pointer-events-none"
    >
      <p className="text-[12px] leading-relaxed text-slate-700">{content}</p>
      {/* Arrow caret */}
      <div
        className={cn(
          'absolute h-2 w-2 rotate-45 border bg-white border-slate-200',
          arrowStyle,
        )}
      />
    </div>,
    document.body,
  ) : null

  return (
    <span className={cn('relative inline-flex items-center', className)}>
      <button
        ref={triggerRef}
        type="button"
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        aria-label="Help"
        className="text-slate-400 hover:text-slate-600 transition-colors focus:outline-none"
      >
        <HelpCircle className={size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
      </button>
      {tooltip}
    </span>
  )
}
