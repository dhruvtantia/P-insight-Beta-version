/**
 * PerformanceChart
 * ----------------
 * Displays cumulative return (%) of the portfolio vs the benchmark
 * over the selected time period.
 *
 * Data shape (from QuantFullResponse):
 *   performance.portfolio: TimeSeriesPoint[]   { date: string, value: number }
 *   performance.benchmark: TimeSeriesPoint[]   { date: string, value: number }
 *
 * value is already in % (e.g. 12.3 = +12.3%).
 */

'use client'

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'
import { TrendingUp } from 'lucide-react'
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

function formatPct(v: number): string {
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`
}

// Merge two series on shared dates
function mergeSeries(
  portfolio: TimeSeriesPoint[],
  benchmark: TimeSeriesPoint[],
): Array<{ date: string; portfolio: number; benchmark: number }> {
  const bMap = new Map(benchmark.map((p) => [p.date, p.value]))
  return portfolio
    .filter((p) => bMap.has(p.date))
    .map((p) => ({
      date:      p.date,
      portfolio: p.value,
      benchmark: bMap.get(p.date)!,
    }))
}

// Thin out data points so the chart renders cleanly (max ~120 points visible)
function thin(data: ReturnType<typeof mergeSeries>, maxPoints = 120) {
  if (data.length <= maxPoints) return data
  const step = Math.ceil(data.length / maxPoints)
  return data.filter((_, i) => i % step === 0 || i === data.length - 1)
}

// ─── Custom tooltip ────────────────────────────────────────────────────────────

interface TooltipPayload {
  name:  string
  value: number
  color: string
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: TooltipPayload[]
  label?: string
}) {
  if (!active || !payload?.length || !label) return null

  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-lg px-3 py-2.5 text-xs">
      <p className="text-slate-500 mb-1.5 font-medium">{formatDate(label)}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2 mb-0.5">
          <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: p.color }} />
          <span className="text-slate-600 w-20">{p.name}</span>
          <span
            className={`font-bold tabular-nums ${
              p.value >= 0 ? 'text-emerald-600' : 'text-red-600'
            }`}
          >
            {formatPct(p.value)}
          </span>
        </div>
      ))}
    </div>
  )
}

// ─── Loading skeleton ──────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="h-64 flex items-center justify-center animate-pulse">
      <div className="w-full h-full rounded-lg bg-slate-100" />
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────

interface PerformanceChartProps {
  portfolio:     TimeSeriesPoint[]
  benchmark:     TimeSeriesPoint[]
  benchmarkName: string
  loading:       boolean
  error?:        string | null
}

export function PerformanceChart({
  portfolio,
  benchmark,
  benchmarkName,
  loading,
  error,
}: PerformanceChartProps) {
  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4">
        <p className="text-sm font-semibold text-red-700">Could not load performance data</p>
        <p className="text-xs text-red-600 mt-1">{error}</p>
      </div>
    )
  }

  const merged = thin(mergeSeries(portfolio, benchmark))

  // Ticks: show at most 8 evenly-spaced dates
  const tickIndices = merged.length <= 8
    ? merged.map((_, i) => i)
    : Array.from({ length: 8 }, (_, i) => Math.round((i / 7) * (merged.length - 1)))
  const tickDates = new Set(tickIndices.map((i) => merged[i]?.date).filter(Boolean))

  const allValues = merged.flatMap((d) => [d.portfolio, d.benchmark])
  const minVal = Math.min(...allValues, 0)
  const maxVal = Math.max(...allValues, 0)
  const pad = Math.max(2, (maxVal - minVal) * 0.1)
  const yMin = Math.floor(minVal - pad)
  const yMax = Math.ceil(maxVal + pad)

  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
        <TrendingUp className="h-4 w-4 text-indigo-500" />
        <h3 className="text-sm font-semibold text-slate-800">Cumulative Performance</h3>
        <span className="ml-auto text-[11px] text-slate-400">
          vs <span className="font-medium text-slate-600">{benchmarkName}</span>
        </span>
      </div>

      <div className="p-5">
        {loading ? (
          <Skeleton />
        ) : merged.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-sm text-slate-400">
            No performance data available
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={merged} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
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
              <Legend
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ fontSize: '11px', paddingTop: '12px' }}
              />
              <ReferenceLine y={0} stroke="#e2e8f0" strokeWidth={1} />
              <Line
                type="monotone"
                dataKey="portfolio"
                name="Portfolio"
                stroke="#6366f1"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
              />
              <Line
                type="monotone"
                dataKey="benchmark"
                name={benchmarkName}
                stroke="#94a3b8"
                strokeWidth={1.5}
                strokeDasharray="4 2"
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}

        {/* Footer note */}
        {!loading && merged.length > 0 && (
          <p className="text-[10px] text-slate-400 mt-2">
            Cumulative return (%). Base = 0% at start of period. Portfolio weighted by holding values.
          </p>
        )}
      </div>
    </div>
  )
}
