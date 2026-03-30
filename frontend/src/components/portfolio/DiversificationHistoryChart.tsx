/**
 * DiversificationHistoryChart
 * ----------------------------
 * Combo chart showing:
 *   - Bar:  number of holdings per snapshot
 *   - Line: top holding weight % (from SnapshotDetail.top_holdings[0].weight)
 *
 * High number of holdings + low top-holding concentration = well-diversified.
 *
 * Requires:
 *   summaries — SnapshotSummary[] (oldest → newest)
 *   details   — Map<id, SnapshotDetail> (optional, adds concentration line)
 */

'use client'

import React, { useMemo } from 'react'
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'
import { Layers } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SnapshotSummary, SnapshotDetail } from '@/types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

// ─── Custom tooltip ───────────────────────────────────────────────────────────

function DivTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ name: string; value: number; color: string }>
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-slate-200 bg-white/95 backdrop-blur-sm shadow-lg px-3 py-2 text-xs min-w-[130px]">
      <p className="font-semibold text-slate-700 mb-2">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center justify-between gap-4 py-0.5">
          <span className="text-slate-500">{p.name}</span>
          <span className="font-bold tabular-nums" style={{ color: p.color }}>
            {p.name === 'Holdings' ? p.value : `${p.value.toFixed(1)}%`}
          </span>
        </div>
      ))}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface DiversificationHistoryChartProps {
  summaries:  SnapshotSummary[]
  details?:   Map<number, SnapshotDetail>
  loading?:   boolean
  className?: string
}

export function DiversificationHistoryChart({
  summaries,
  details = new Map(),
  loading = false,
  className,
}: DiversificationHistoryChartProps): React.ReactElement {

  const chartData = useMemo(() =>
    summaries
      .filter((s) => s.num_holdings != null)
      .map((s) => {
        const detail    = details.get(s.id)
        // Use != null so a weight of exactly 0 (valid data) isn't treated as missing
        const topWeight = detail?.top_holdings?.[0]?.weight != null
          ? parseFloat((detail.top_holdings[0].weight * 100).toFixed(1))
          : null

        return {
          date:       fmtDate(s.captured_at),
          label:      s.label,
          holdings:   s.num_holdings!,
          topWeight,  // % of portfolio in the largest holding — null if detail not loaded
        }
      })
  , [summaries, details])

  if (loading) {
    return (
      <div className={cn('rounded-xl border border-slate-200 bg-white p-5 animate-pulse', className)}>
        <div className="h-4 w-44 bg-slate-200 rounded mb-4" />
        <div className="h-40 bg-slate-100 rounded-lg" />
      </div>
    )
  }

  if (chartData.length < 2) {
    return (
      <div className={cn(
        'rounded-xl border-2 border-dashed border-slate-200 bg-white py-10 text-center',
        className,
      )}>
        <Layers className="h-6 w-6 text-slate-300 mx-auto mb-2" />
        <p className="text-sm text-slate-400">Need at least 2 snapshots</p>
      </div>
    )
  }

  const hasConcentration = chartData.some((d) => d.topWeight != null)

  return (
    <div className={cn('rounded-xl border border-slate-200 bg-white p-5', className)}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Diversification Over Time</h3>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Holdings count · top holding concentration
          </p>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={200}>
        <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: '#94a3b8' }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          {/* Left Y — holdings count */}
          <YAxis
            yAxisId="left"
            tick={{ fontSize: 10, fill: '#94a3b8' }}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
            width={28}
          />
          {/* Right Y — concentration % */}
          {hasConcentration && (
            <YAxis
              yAxisId="right"
              orientation="right"
              tickFormatter={(v) => `${v}%`}
              tick={{ fontSize: 10, fill: '#94a3b8' }}
              axisLine={false}
              tickLine={false}
              domain={[0, 100]}
              width={36}
            />
          )}
          <Tooltip content={<DivTooltip />} />
          <Legend
            wrapperStyle={{ fontSize: 10, paddingTop: 8 }}
            iconType="circle"
            iconSize={8}
          />

          {/* Holdings bar */}
          <Bar
            yAxisId="left"
            dataKey="holdings"
            name="Holdings"
            fill="#6366f1"
            fillOpacity={0.7}
            radius={[3, 3, 0, 0]}
            maxBarSize={40}
          />

          {/* Concentration line */}
          {hasConcentration && (
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="topWeight"
              name="Top holding %"
              stroke="#f59e0b"
              strokeWidth={2}
              dot={{ r: 3, fill: '#f59e0b', stroke: '#fff', strokeWidth: 1.5 }}
              connectNulls
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
