/**
 * SectorHistoryChart
 * -------------------
 * Stacked area chart showing how sector allocations have shifted across snapshots.
 *
 * Requires:
 *   summaries  — SnapshotSummary[] (oldest→newest) for dates / labels
 *   details    — Map<id, SnapshotDetail> for sector_weights per snapshot
 *
 * Renders a placeholder/skeleton when fewer than 2 details are available.
 */

'use client'

import React, { useMemo } from 'react'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'
import { Loader2, PieChart } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SnapshotSummary, SnapshotDetail } from '@/types'

// ─── Sector colour palette ────────────────────────────────────────────────────

const SECTOR_COLORS: Record<string, string> = {
  'Information Technology': '#6366f1',
  'Technology':             '#6366f1',
  'Financials':             '#0ea5e9',
  'Finance':                '#0ea5e9',
  'Healthcare':             '#10b981',
  'Health Care':            '#10b981',
  'Consumer Discretionary': '#f59e0b',
  'Consumer Staples':       '#f97316',
  'Energy':                 '#ef4444',
  'Materials':              '#8b5cf6',
  'Industrials':            '#14b8a6',
  'Real Estate':            '#ec4899',
  'Utilities':              '#64748b',
  'Communication Services': '#a855f7',
  'Other':                  '#94a3b8',
}

const FALLBACK_COLORS = [
  '#6366f1','#0ea5e9','#10b981','#f59e0b','#ef4444',
  '#8b5cf6','#14b8a6','#ec4899','#f97316','#a855f7',
]

function sectorColor(sector: string, idx: number): string {
  return SECTOR_COLORS[sector] ?? FALLBACK_COLORS[idx % FALLBACK_COLORS.length]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

// ─── Custom tooltip ───────────────────────────────────────────────────────────

function SectorTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ name: string; value: number; color: string }>
  label?: string
}) {
  if (!active || !payload?.length) return null
  const sorted = [...payload]
    .filter((p) => p.value > 0.5)
    .sort((a, b) => b.value - a.value)

  return (
    <div className="rounded-xl border border-slate-200 bg-white/95 backdrop-blur-sm shadow-lg px-3 py-2 text-xs min-w-[150px]">
      <p className="font-semibold text-slate-700 mb-2">{label}</p>
      {sorted.map((p) => (
        <div key={p.name} className="flex items-center justify-between gap-4 py-0.5">
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full shrink-0" style={{ background: p.color }} />
            <span className="text-slate-600 truncate max-w-[110px]">{p.name}</span>
          </div>
          <span className="font-semibold text-slate-800 tabular-nums">{p.value.toFixed(1)}%</span>
        </div>
      ))}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface SectorHistoryChartProps {
  summaries:      SnapshotSummary[]
  details:        Map<number, SnapshotDetail>
  detailsLoading: boolean
  className?:     string
}

const MAX_SECTORS = 7   // collapse smaller sectors into "Other"

export function SectorHistoryChart({
  summaries,
  details,
  detailsLoading,
  className,
}: SectorHistoryChartProps): React.ReactElement {

  // Build top-N sector list from the most-recent detail
  const topSectors = useMemo((): string[] => {
    const latestId = summaries[summaries.length - 1]?.id
    const latestDetail = latestId != null ? details.get(latestId) : undefined
    if (!latestDetail) return []

    const weights = latestDetail.sector_weights
    const sorted  = Object.entries(weights)
      .sort((a, b) => b[1] - a[1])

    if (sorted.length <= MAX_SECTORS) return sorted.map(([s]) => s)
    const top = sorted.slice(0, MAX_SECTORS - 1).map(([s]) => s)
    return [...top, 'Other']
  }, [summaries, details])

  // Build chart series — one row per snapshot that has a detail
  const chartData = useMemo(() => {
    return summaries
      .filter((s) => details.has(s.id))
      .map((s) => {
        const d      = details.get(s.id)!
        const raw    = d.sector_weights
        const row: Record<string, unknown> = {
          date:    fmtDate(s.captured_at),
          label:   s.label,
        }

        if (topSectors.includes('Other')) {
          const topSet = new Set(topSectors.filter((t) => t !== 'Other'))
          let other = 0
          for (const [sec, w] of Object.entries(raw)) {
            if (topSet.has(sec)) {
              row[sec] = parseFloat(w.toFixed(1))
            } else {
              other += w
            }
          }
          row['Other'] = parseFloat(other.toFixed(1))
        } else {
          for (const sec of topSectors) {
            row[sec] = parseFloat((raw[sec] ?? 0).toFixed(1))
          }
        }
        return row
      })
  }, [summaries, details, topSectors])

  const readyCount = chartData.length

  // Only show the empty state once details have finished loading — prevents
  // a premature "not enough data" flash while the background hydration runs.
  if (readyCount < 2 && !detailsLoading && summaries.length < 2) {
    return (
      <div className={cn(
        'rounded-xl border-2 border-dashed border-slate-200 bg-white py-10 text-center',
        className,
      )}>
        <PieChart className="h-6 w-6 text-slate-300 mx-auto mb-2" />
        <p className="text-sm text-slate-400">Need at least 2 snapshots with sector data</p>
      </div>
    )
  }

  return (
    <div className={cn('rounded-xl border border-slate-200 bg-white p-5', className)}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Sector Allocation History</h3>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {readyCount} snapshot{readyCount !== 1 ? 's' : ''}
            {detailsLoading && (
              <span className="ml-2 inline-flex items-center gap-1 text-indigo-400">
                <Loader2 className="h-3 w-3 animate-spin" /> loading…
              </span>
            )}
          </p>
        </div>
      </div>

      {readyCount < 2 ? (
        <div className="flex items-center justify-center h-40 text-sm text-slate-400 gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-indigo-400" /> Loading sector data…
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: '#94a3b8' }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tickFormatter={(v) => `${v}%`}
              tick={{ fontSize: 10, fill: '#94a3b8' }}
              axisLine={false}
              tickLine={false}
              domain={[0, 100]}
              width={36}
            />
            <Tooltip content={<SectorTooltip />} />
            <Legend
              wrapperStyle={{ fontSize: 10, paddingTop: 8 }}
              iconType="circle"
              iconSize={8}
            />
            {topSectors.map((sector, idx) => (
              <Area
                key={sector}
                type="monotone"
                dataKey={sector}
                stackId="1"
                stroke={sectorColor(sector, idx)}
                fill={sectorColor(sector, idx)}
                fillOpacity={0.75}
                strokeWidth={1.5}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
