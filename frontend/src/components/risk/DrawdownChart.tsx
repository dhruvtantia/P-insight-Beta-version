/**
 * DrawdownChart
 * -------------
 * Displays the portfolio drawdown series as a filled area chart.
 * Values are in % (e.g. -12.5 = -12.5% drawdown from peak).
 *
 * Data shape (from QuantFullResponse):
 *   drawdown: TimeSeriesPoint[]   { date: string, value: number }
 *
 * value is already negative (or zero) — drawdown from rolling peak.
 */

'use client'

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts'
import { TrendingDown } from 'lucide-react'
import type { TimeSeriesPoint } from '@/types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })
}

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

function thin(data: TimeSeriesPoint[], maxPoints = 120): TimeSeriesPoint[] {
  if (data.length <= maxPoints) return data
  const step = Math.ceil(data.length / maxPoints)
  return data.filter((_, i) => i % step === 0 || i === data.length - 1)
}

// ─── Custom tooltip ────────────────────────────────────────────────────────────

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ value: number }>
  label?: string
}) {
  if (!active || !payload?.length || !label) return null
  const val = payload[0].value

  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-lg px-3 py-2.5 text-xs">
      <p className="text-slate-500 mb-1 font-medium">{formatDate(label)}</p>
      <p className="font-bold tabular-nums text-red-600">
        {val.toFixed(2)}%
      </p>
      <p className="text-slate-400 mt-0.5">drawdown from peak</p>
    </div>
  )
}

// ─── Loading skeleton ──────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="h-48 flex items-center justify-center animate-pulse">
      <div className="w-full h-full rounded-lg bg-slate-100" />
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────

interface DrawdownChartProps {
  drawdown: TimeSeriesPoint[]
  loading:  boolean
  error?:   string | null
}

export function DrawdownChart({ drawdown, loading, error }: DrawdownChartProps) {
  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4">
        <p className="text-sm font-semibold text-red-700">Could not load drawdown data</p>
        <p className="text-xs text-red-600 mt-1">{error}</p>
      </div>
    )
  }

  const thinned = thin(drawdown)

  // Max drawdown for annotation
  const minVal = thinned.length > 0 ? Math.min(...thinned.map((d) => d.value)) : 0
  const yMin = Math.floor(minVal * 1.1)   // a bit below the worst drawdown
  const yMax = 2                           // small buffer above 0

  // Ticks: show at most 8 evenly-spaced dates
  const tickIndices = thinned.length <= 8
    ? thinned.map((_, i) => i)
    : Array.from({ length: 8 }, (_, i) => Math.round((i / 7) * (thinned.length - 1)))
  const tickDates = new Set(tickIndices.map((i) => thinned[i]?.date).filter(Boolean))

  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
        <TrendingDown className="h-4 w-4 text-red-400" />
        <h3 className="text-sm font-semibold text-slate-800">Portfolio Drawdown</h3>
        {!loading && minVal < 0 && (
          <span className="ml-auto text-[11px] text-slate-400">
            Max:&nbsp;
            <span className="font-semibold text-red-600">{minVal.toFixed(1)}%</span>
          </span>
        )}
      </div>

      <div className="p-5">
        {loading ? (
          <Skeleton />
        ) : thinned.length === 0 ? (
          <div className="h-48 flex items-center justify-center text-sm text-slate-400">
            No drawdown data available
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={thinned} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="ddGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#ef4444" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: '#94a3b8' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => (tickDates.has(v) ? formatDateShort(v) : '')}
                interval={0}
              />
              <YAxis
                tickFormatter={(v) => `${v}%`}
                tick={{ fontSize: 10, fill: '#94a3b8' }}
                tickLine={false}
                axisLine={false}
                domain={[yMin, yMax]}
                width={52}
              />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine y={0} stroke="#e2e8f0" strokeWidth={1} />
              <Area
                type="monotone"
                dataKey="value"
                name="Drawdown"
                stroke="#ef4444"
                strokeWidth={1.5}
                fill="url(#ddGradient)"
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0, fill: '#ef4444' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}

        {!loading && thinned.length > 0 && (
          <p className="text-[10px] text-slate-400 mt-2">
            Percentage decline from rolling peak. Recovery to 0% means new portfolio high.
          </p>
        )}
      </div>
    </div>
  )
}
