/**
 * SortableHeader — reusable <th> with sort indicator
 * ---------------------------------------------------
 * Renders a clickable column header with an up/down arrow indicator.
 * Pass sortKey/sortDir/onSort from useSortable().
 *
 * Usage:
 *   <SortableHeader label="Ticker"  col="ticker"  {...sortProps} align="left" />
 *   <SortableHeader label="Weight"  col="weight"  {...sortProps} align="right" />
 */

'use client'

import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SortDir } from '@/hooks/useSortable'

interface SortableHeaderProps<K extends string> {
  label:    string
  col:      K
  sortKey:  K
  sortDir:  SortDir
  onSort:   (col: K) => void
  align?:   'left' | 'right' | 'center'
  className?: string
}

export function SortableHeader<K extends string>({
  label,
  col,
  sortKey,
  sortDir,
  onSort,
  align = 'left',
  className,
}: SortableHeaderProps<K>) {
  const active = col === sortKey
  const Icon =
    !active     ? ArrowUpDown
    : sortDir === 'asc' ? ArrowUp
    :             ArrowDown

  return (
    <th
      className={cn(
        'px-4 py-2.5 font-semibold text-slate-500 cursor-pointer select-none',
        'hover:text-slate-800 hover:bg-slate-100/60 transition-colors group',
        align === 'right'  && 'text-right',
        align === 'center' && 'text-center',
        align === 'left'   && 'text-left',
        className,
      )}
      onClick={() => onSort(col)}
    >
      <span className={cn('inline-flex items-center gap-1', align === 'right' && 'flex-row-reverse')}>
        {label}
        <Icon
          className={cn(
            'h-3 w-3 transition-opacity',
            active ? 'opacity-80' : 'opacity-30 group-hover:opacity-60',
            active && sortDir === 'asc'  && 'text-indigo-600',
            active && sortDir === 'desc' && 'text-indigo-600',
          )}
        />
      </span>
    </th>
  )
}
