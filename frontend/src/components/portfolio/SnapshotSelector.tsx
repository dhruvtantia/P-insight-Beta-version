/**
 * SnapshotSelector
 * -----------------
 * Dual dropdown that lets the user choose a "from" and "to" snapshot for
 * comparison. Defaults to the two latest snapshots when first rendered.
 *
 * Validates: from ≠ to.  "from" is always the older snapshot, "to" the newer.
 */

'use client'

import React, { useEffect } from 'react'
import { Camera, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SnapshotSummary } from '@/types'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

interface SnapshotSelectorProps {
  snapshots:  SnapshotSummary[]
  fromId:     number | null
  toId:       number | null
  onFromChange: (id: number | null) => void
  onToChange:   (id: number | null) => void
  className?: string
}

export function SnapshotSelector({
  snapshots,
  fromId,
  toId,
  onFromChange,
  onToChange,
  className,
}: SnapshotSelectorProps): React.ReactElement | null {
  // Default to latest two on mount
  useEffect(() => {
    if (snapshots.length >= 2 && fromId === null && toId === null) {
      // snapshots are newest-first; from = older (index 1), to = newer (index 0)
      onFromChange(snapshots[1].id)
      onToChange(snapshots[0].id)
    } else if (snapshots.length === 1 && toId === null) {
      onToChange(snapshots[0].id)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshots.length])

  if (snapshots.length < 2) {
    return (
      <div className={cn('flex items-center gap-2 text-sm text-slate-400', className)}>
        <Camera className="h-4 w-4 shrink-0" />
        Need at least 2 snapshots to compare. Create a second snapshot to enable comparison.
      </div>
    )
  }

  const makeOption = (s: SnapshotSummary) => (
    <option key={s.id} value={s.id}>
      {s.label ? `${s.label} — ` : ''}{formatDate(s.captured_at)}
    </option>
  )

  return (
    <div className={cn('flex items-center gap-3 flex-wrap', className)}>
      {/* From */}
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-xs font-semibold text-slate-500 shrink-0 uppercase tracking-wide">From</span>
        <select
          value={fromId ?? ''}
          onChange={(e) => onFromChange(e.target.value ? Number(e.target.value) : null)}
          className={cn(
            'text-sm rounded-lg border border-slate-200 dark:border-slate-700',
            'bg-white dark:bg-slate-800 px-2.5 py-1.5',
            'text-slate-700 dark:text-slate-200',
            'focus:outline-none focus:ring-2 focus:ring-indigo-400/50',
            'min-w-[200px]',
          )}
        >
          <option value="">Select snapshot…</option>
          {snapshots.map(makeOption)}
        </select>
      </div>

      <ArrowRight className="h-4 w-4 text-slate-300 shrink-0" />

      {/* To */}
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-xs font-semibold text-slate-500 shrink-0 uppercase tracking-wide">To</span>
        <select
          value={toId ?? ''}
          onChange={(e) => onToChange(e.target.value ? Number(e.target.value) : null)}
          className={cn(
            'text-sm rounded-lg border border-slate-200 dark:border-slate-700',
            'bg-white dark:bg-slate-800 px-2.5 py-1.5',
            'text-slate-700 dark:text-slate-200',
            'focus:outline-none focus:ring-2 focus:ring-indigo-400/50',
            'min-w-[200px]',
          )}
        >
          <option value="">Select snapshot…</option>
          {snapshots.map(makeOption)}
        </select>
      </div>

      {/* Validation hint */}
      {fromId !== null && toId !== null && fromId === toId && (
        <p className="text-xs text-amber-500">Select two different snapshots.</p>
      )}
    </div>
  )
}
