/**
 * PortfolioHistoryChart
 * ----------------------
 * Line chart showing portfolio total value across all snapshots.
 * X-axis = snapshot date  |  Y-axis = total value (₹)
 *
 * Requires: SnapshotSummary[] sorted oldest → newest.
 */

'use client'

import React, { useMemo } from 'react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SnapshotSummary } from '@/types'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

function fmtValue(v: number): string {
  if (v >= 1_00_00_000) return `₹${(v / 1_00_00_000).toFixed(1)}Cr`
  if (v >= 1_00_000)    return `₹${(v / 1_00_000).toFixed(1)}L`
  if (v >= 1_000)       return `₹${(v / 1_000).toFixed(1)}K`
  return `₹${v.toFixed(0)}`
}

// ─── Custom tooltip ───────────────────────────────────────────────────────────

function HistoryTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ payload: { label: string | null; date: string; value: number; pnl: number | null; pnl_pct: number | null } }>
}) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  const pct = d.pnl_pct
  return (
    <div className="rounded-xl border border-slate-200 bg-white/95 backdrop-blur-sm shadow-lg px-4 py-3 text-xs min-w-[140px]">
      <p className="font-semibold text-slate-700 mb-1">{d.date}</p>
      {d.label && <p className="text-[10px] text-slate-400 mb-2 italic">{d.label}</p>}
      <p className="text-slate-500">Value <span className="font-bold text-slate-800">{fmtValue(d.value)}</span></p>
      {d.pnl != null && (
        <p className={cn(
          'mt-1',
          d.pnl >= 0 ? 'text-emerald-600' : 'text-red-500'
        )}>
          P&L <span className="font-bold">{fmtValue(Math.abs(d.pnl))}</span>
          {pct != null && <span className="ml-1 text-[10px]">({pct >= 0 ? '+' : ''}{pct.toFixed(1)}%)</span>}
        </p>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface PortfolioHistoryChartProps {
  snapshots:  SnapshotSummary[]    // oldest → newest
  loading?:   boolean
  className?: string
}

export function PortfolioHistoryChart({
  snapshots,
  loading = false,
  className,
}: PortfolioHistoryChartProps): React.ReactElement {

  const chartData = useMemo(() =>
    snapshots
      .filter((s) => s.total_value != null)
      .map((s) => ({
        id:      s.id,
        date:    fmtDate(s.captured_at),
        rawDate: s.captured_at,
        label:   s.label,
        value:   s.total_value!,
        cost:    s.total_cost,
        pnl:     s.total_pnl,
        pnl_pct: s.total_pnl_pct,
      }))
  , [snapshots])

  // Overall trend
  const first  = chartData[0]?.value
  const last   = chartData[chartData.length - 1]?.value
  // Use != null (not truthy) so a valid zero-value portfolio is handled correctly
  const change = first != null && last != null && first !== 0
    ? ((last - first) / first) * 100
    : null
  const TrendIcon = change == null ? Minus : change > 0 ? TrendingUp : TrendingDown

  if (loading) {
    return (
      <div className={cn('rounded-xl border border-slate-200 bg-white p-5 animate-pulse', className)}>
        <div className="h-4 w-40 bg-slate-200 rounded mb-4" />
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
        <TrendingUp className="h-6 w-6 text-slate-300 mx-auto mb-2" />
        <p className="text-sm text-slate-400">Need at least 2 snapshots for a history chart</p>
      </div>
    )
  }

  const minVal  = Math.min(...chartData.map((d) => d.value))
  const maxVal  = Math.max(...chartData.map((d) => d.value))
  const padding = (maxVal - minVal) * 0.1 || maxVal * 0.05

  return (
    <div className={cn('rounded-xl border border-slate-200 bg-white p-5', className)}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Portfolio Value Over Time</h3>
          <p className="text-[11px] text-slate-400 mt-0.5">{chartData.length} snapshots</p>
        </div>
        {change != null && (
          <div className={cn(
            'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold',
            change >= 0
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
              : 'bg-red-50 text-red-600 border border-red-100',
          )}>
            <TrendIcon className="h-3.5 w-3.5" />
            {change >= 0 ? '+' : ''}{change.toFixed(1)}% overall
          </div>
        )}
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: '#94a3b8' }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tickFormatter={fmtValue}
            tick={{ fontSize: 10, fill: '#94a3b8' }}
            axisLine={false}
            tickLine={false}
            width={58}
            domain={[minVal - padding, maxVal + padding]}
          />
          <Tooltip content={<HistoryTooltip />} />
          {/* Cost basis reference if available */}
          {chartData[chartData.length - 1]?.cost != null && (
            <ReferenceLine
              y={chartData[chartData.length - 1].cost!}
              stroke="#94a3b8"
              strokeDasharray="4 4"
              strokeWidth={1}
              label={{ value: 'Cost', position: 'insideTopRight', fontSize: 9, fill: '#94a3b8' }}
            />
          )}
          <Line
            type="monotone"
            dataKey="value"
            stroke="#6366f1"
            strokeWidth={2.5}
            dot={{ r: 4, fill: '#6366f1', strokeWidth: 2, stroke: '#fff' }}
            activeDot={{ r: 6, fill: '#6366f1', stroke: '#fff', strokeWidth: 2 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
