/**
 * SnapshotTimeline
 * -----------------
 * Horizontal scrollable timeline of snapshots for a portfolio.
 * Click a node to set it as "from" or "to" in the comparison.
 *
 * Visual states:
 *   - default      → grey dot
 *   - fromId       → indigo outlined dot  (left anchor)
 *   - toId         → indigo filled dot    (right anchor)
 *   - between from/to → slightly brighter connector
 */

'use client'

import React from 'react'
import { Camera } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SnapshotSummary } from '@/types'

function formatShortDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
}

interface SnapshotTimelineProps {
  snapshots:    SnapshotSummary[]
  fromId:       number | null
  toId:         number | null
  onNodeClick:  (id: number) => void
  className?:   string
}

export function SnapshotTimeline({
  snapshots,
  fromId,
  toId,
  onNodeClick,
  className,
}: SnapshotTimelineProps): React.ReactElement | null {
  if (snapshots.length === 0) return null

  // Render oldest → newest (reverse of the API order which is newest-first)
  const ordered = [...snapshots].reverse()

  // Determine which indices are between from and to (inclusive)
  const fromIdx = ordered.findIndex((s) => s.id === fromId)
  const toIdx   = ordered.findIndex((s) => s.id === toId)
  const rangeMin = Math.min(fromIdx, toIdx)
  const rangeMax = Math.max(fromIdx, toIdx)

  return (
    <div className={cn('overflow-x-auto pb-2', className)}>
      <div className="flex items-center gap-0 min-w-max px-2">
        {ordered.map((snap, i) => {
          const isFrom      = snap.id === fromId
          const isTo        = snap.id === toId
          const inRange     = fromIdx !== -1 && toIdx !== -1 && i > rangeMin && i < rangeMax
          const isSelected  = isFrom || isTo
          const isLast      = i === ordered.length - 1

          return (
            <React.Fragment key={snap.id}>
              {/* Node */}
              <div className="flex flex-col items-center gap-1.5">
                {/* Date label above */}
                <p className={cn(
                  'text-[10px] font-medium',
                  isSelected ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400',
                )}>
                  {formatShortDate(snap.captured_at)}
                </p>

                {/* Circle button */}
                <button
                  onClick={() => onNodeClick(snap.id)}
                  title={snap.label ?? `Snapshot #${snap.id}`}
                  className={cn(
                    'relative flex items-center justify-center rounded-full transition-all',
                    'focus:outline-none focus:ring-2 focus:ring-indigo-400',
                    isFrom
                      ? 'h-5 w-5 bg-white dark:bg-slate-800 border-2 border-indigo-600 ring-4 ring-indigo-100 dark:ring-indigo-900/40'
                      : isTo
                      ? 'h-5 w-5 bg-indigo-600 border-2 border-indigo-700 ring-4 ring-indigo-100 dark:ring-indigo-900/40'
                      : inRange
                      ? 'h-3.5 w-3.5 bg-indigo-200 dark:bg-indigo-700 border border-indigo-300 hover:bg-indigo-300'
                      : 'h-3.5 w-3.5 bg-slate-200 dark:bg-slate-600 border border-slate-300 hover:bg-slate-300 dark:hover:bg-slate-500',
                  )}
                >
                  {isTo && <Camera className="h-2.5 w-2.5 text-white" />}
                  {isFrom && <div className="h-1.5 w-1.5 rounded-full bg-indigo-600" />}
                </button>

                {/* Label below */}
                <p className={cn(
                  'text-[9px] max-w-[56px] truncate text-center',
                  isSelected ? 'text-indigo-600 dark:text-indigo-400 font-semibold' : 'text-slate-400',
                )}>
                  {isFrom ? 'FROM' : isTo ? 'TO' : snap.label ?? `#${snap.id}`}
                </p>
              </div>

              {/* Connector line (not after last node) */}
              {!isLast && (
                <div className={cn(
                  'h-0.5 w-8 shrink-0 self-center mb-4',
                  (i >= rangeMin && i < rangeMax)
                    ? 'bg-indigo-300 dark:bg-indigo-600'
                    : 'bg-slate-200 dark:bg-slate-700',
                )} />
              )}
            </React.Fragment>
          )
        })}
      </div>
    </div>
  )
}
