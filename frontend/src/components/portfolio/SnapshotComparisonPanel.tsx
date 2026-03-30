/**
 * SnapshotComparisonPanel
 * ------------------------
 * Orchestrates the full snapshot comparison UI:
 *   1. SnapshotTimeline  — visual timeline to pick from/to
 *   2. SnapshotSelector  — dropdown fallback / precise selection
 *   3. DeltaSummaryCard  — top-line metrics
 *   4. Sector delta table — sector weight changes
 *   5. SnapshotDeltaTable — per-holding change table
 *
 * Stateless regarding which portfolio is selected — the parent passes
 * snapshots and the comparison is self-contained.
 */

'use client'

import React, { useState } from 'react'
import {
  GitCompare, Loader2, AlertTriangle, RefreshCw,
  Building2, ChevronDown, ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { SnapshotSelector }    from './SnapshotSelector'
import { SnapshotTimeline }    from './SnapshotTimeline'
import { DeltaSummaryCard }    from './DeltaSummaryCard'
import { SnapshotDeltaTable }  from './SnapshotDeltaTable'
import { formatWeightDelta }   from '@/lib/delta'
import { useDelta }            from '@/hooks/useDelta'
import type { SnapshotSummary, SectorDelta } from '@/types'

// ─── Sector delta row ─────────────────────────────────────────────────────────

function SectorDeltaRow({ sd }: { sd: SectorDelta }) {
  const delta = sd.weight_delta ?? 0
  const barWidth = Math.min(100, Math.abs(delta) * 5)   // 1pp = 5%
  const positive = delta >= 0

  return (
    <tr className="border-b border-slate-100 dark:border-slate-700/50 last:border-0">
      <td className="py-2 px-3 text-sm text-slate-700 dark:text-slate-300">{sd.sector}</td>
      <td className="py-2 px-3 text-right text-xs text-slate-500 tabular-nums">
        {sd.weight_before != null ? `${sd.weight_before.toFixed(1)}%` : '—'}
      </td>
      <td className="py-2 px-3 text-right text-xs text-slate-500 tabular-nums">
        {sd.weight_after != null ? `${sd.weight_after.toFixed(1)}%` : '—'}
      </td>
      <td className="py-2 px-3 w-40">
        <div className="flex items-center gap-2">
          {/* Bar */}
          <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full',
                positive ? 'bg-indigo-400' : 'bg-rose-400',
              )}
              style={{ width: `${barWidth}%` }}
            />
          </div>
          <span className={cn(
            'text-xs font-medium tabular-nums w-16 text-right',
            positive ? 'text-indigo-600 dark:text-indigo-400' : 'text-rose-500 dark:text-rose-400',
          )}>
            {formatWeightDelta(sd.weight_delta)}
          </span>
        </div>
      </td>
    </tr>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface SnapshotComparisonPanelProps {
  snapshots:   SnapshotSummary[]
  className?:  string
}

export function SnapshotComparisonPanel({
  snapshots,
  className,
}: SnapshotComparisonPanelProps): React.ReactElement {
  const [fromId, setFromId] = useState<number | null>(null)
  const [toId,   setToId]   = useState<number | null>(null)
  const [showSectors, setShowSectors] = useState(true)
  const [showTimeline, setShowTimeline] = useState(true)

  const { delta, loading, error, refetch } = useDelta(fromId, toId)

  // Timeline click: first click sets "from", second click sets "to"
  const handleTimelineClick = (id: number) => {
    if (fromId === null) {
      setFromId(id)
    } else if (toId === null || id === fromId) {
      if (id === fromId) {
        // clicking same node again clears from
        setFromId(null)
      } else {
        setToId(id)
      }
    } else {
      // Both set — start over
      setFromId(id)
      setToId(null)
    }
  }

  if (snapshots.length === 0) {
    return (
      <div className={cn(
        'rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700 py-12 text-center',
        className,
      )}>
        <GitCompare className="h-8 w-8 text-slate-300 mx-auto mb-3" />
        <p className="text-sm font-medium text-slate-500">No snapshots yet</p>
        <p className="text-xs text-slate-400 mt-1">
          Create at least 2 snapshots on this portfolio to enable comparison.
        </p>
      </div>
    )
  }

  const sortedSectorDeltas = delta
    ? [...delta.sector_deltas]
        .filter((s) => s.weight_delta != null && Math.abs(s.weight_delta) >= 0.1)
        .sort((a, b) => Math.abs(b.weight_delta ?? 0) - Math.abs(a.weight_delta ?? 0))
    : []

  return (
    <div className={cn('space-y-5', className)}>
      {/* ── Timeline ─────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <button
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
          onClick={() => setShowTimeline((v) => !v)}
        >
          <span className="flex items-center gap-2">
            <GitCompare className="h-4 w-4 text-indigo-500" />
            Select Snapshots to Compare
          </span>
          {showTimeline
            ? <ChevronDown className="h-4 w-4 text-slate-400" />
            : <ChevronRight className="h-4 w-4 text-slate-400" />
          }
        </button>

        {showTimeline && (
          <div className="px-4 pb-4 pt-1 space-y-4">
            {snapshots.length >= 2 ? (
              <>
                <SnapshotTimeline
                  snapshots={snapshots}
                  fromId={fromId}
                  toId={toId}
                  onNodeClick={handleTimelineClick}
                />
                <div className="border-t border-slate-100 dark:border-slate-700 pt-3">
                  <SnapshotSelector
                    snapshots={snapshots}
                    fromId={fromId}
                    toId={toId}
                    onFromChange={setFromId}
                    onToChange={setToId}
                  />
                </div>
              </>
            ) : (
              <SnapshotSelector
                snapshots={snapshots}
                fromId={fromId}
                toId={toId}
                onFromChange={setFromId}
                onToChange={setToId}
              />
            )}
          </div>
        )}
      </div>

      {/* ── Loading / error ───────────────────────────────────────────── */}
      {fromId !== null && toId !== null && fromId !== toId && loading && (
        <div className="flex items-center gap-2 text-sm text-slate-400 justify-center py-6">
          <Loader2 className="h-4 w-4 animate-spin" />
          Computing delta…
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 dark:bg-rose-900/20 dark:border-rose-700 px-4 py-3 text-sm text-rose-700 dark:text-rose-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
          <button onClick={refetch} className="ml-auto text-xs hover:underline flex items-center gap-1">
            <RefreshCw className="h-3 w-3" /> Retry
          </button>
        </div>
      )}

      {/* ── Delta results ─────────────────────────────────────────────── */}
      {delta && (
        <>
          {/* Summary card */}
          <DeltaSummaryCard delta={delta} />

          {/* Sector changes */}
          {sortedSectorDeltas.length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
              <button
                className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                onClick={() => setShowSectors((v) => !v)}
              >
                <span className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-indigo-500" />
                  Sector Allocation Shifts
                  <span className="text-xs font-normal text-slate-400">
                    ({sortedSectorDeltas.length} sector{sortedSectorDeltas.length !== 1 ? 's' : ''} changed)
                  </span>
                </span>
                {showSectors
                  ? <ChevronDown  className="h-4 w-4 text-slate-400" />
                  : <ChevronRight className="h-4 w-4 text-slate-400" />
                }
              </button>
              {showSectors && (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700">
                      <tr>
                        <th className="py-2 px-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">Sector</th>
                        <th className="py-2 px-3 text-right text-[10px] font-bold uppercase tracking-wider text-slate-500">Before</th>
                        <th className="py-2 px-3 text-right text-[10px] font-bold uppercase tracking-wider text-slate-500">After</th>
                        <th className="py-2 px-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">Change</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedSectorDeltas.map((sd) => (
                        <SectorDeltaRow key={sd.sector} sd={sd} />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Holdings delta table */}
          <SnapshotDeltaTable delta={delta} />
        </>
      )}

      {/* Prompt if not yet selected */}
      {(fromId === null || toId === null || fromId === toId) && !loading && (
        <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-700 py-10 text-center">
          <GitCompare className="h-7 w-7 text-slate-300 mx-auto mb-2" />
          <p className="text-sm font-medium text-slate-500">
            {snapshots.length < 2
              ? 'Create a second snapshot to compare'
              : 'Select a From and To snapshot above'}
          </p>
        </div>
      )}
    </div>
  )
}
