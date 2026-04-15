/**
 * PortfolioHistoryChart
 * ----------------------
 * Line chart showing portfolio total value over time.
 *
 * Supports two data modes — automatically selects the richer source:
 *
 *   dailyPoints  — pre-computed daily time series from portfolio_history table
 *                  (fetched once at upload, 250+ data points, smooth curve)
 *                  These are a SYNTHETIC estimate: current holdings × historical prices.
 *
 *   snapshots    — point-in-time portfolio state captured manually or at upload
 *                  (N data points for N snapshots, step-function look if sparse)
 *
 * When dailyPoints are available, they take priority.
 * Snapshots are overlaid as labelled dots on the daily chart if both are provided.
 *
 * Benchmark overlay (optional):
 *   benchmarkPoints — daily close prices, normalised to the portfolio's first value
 *   so both series start at the same y-value and show relative performance.
 */

'use client'

import React, { useMemo } from 'react'
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Legend,
} from 'recharts'
import { TrendingUp, TrendingDown, Minus, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SnapshotSummary, PortfolioHistoryPoint, BenchmarkPoint } from '@/types'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

function fmtDateShort(dateStr: string): string {
  // dateStr may be YYYY-MM-DD or ISO
  const d = new Date(dateStr)
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
  payload?: Array<{
    payload: {
      label:       string | null
      displayDate: string
      value:       number
      pnl?:        number | null
      pnl_pct?:    number | null
      benchmark?:  number | null
      isSnapshot?: boolean
    }
    dataKey: string
    value:   number
  }>
}) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload

  // Find benchmark value from payload
  const benchPayload = payload.find((p) => p.dataKey === 'benchmark')

  return (
    <div className="rounded-xl border border-slate-200 bg-white/95 backdrop-blur-sm shadow-lg px-4 py-3 text-xs min-w-[150px]">
      <p className="font-semibold text-slate-700 mb-1">{d.displayDate}</p>
      {d.label && d.isSnapshot && (
        <p className="text-[10px] text-indigo-500 mb-2 italic">📸 {d.label}</p>
      )}
      <p className="text-slate-500">
        Portfolio <span className="font-bold text-slate-800">{fmtValue(d.value)}</span>
      </p>
      {d.pnl != null && (
        <p className={cn('mt-0.5', d.pnl >= 0 ? 'text-emerald-600' : 'text-red-500')}>
          P&L <span className="font-bold">{fmtValue(Math.abs(d.pnl))}</span>
          {d.pnl_pct != null && (
            <span className="ml-1 text-[10px]">
              ({d.pnl_pct >= 0 ? '+' : ''}{d.pnl_pct.toFixed(1)}%)
            </span>
          )}
        </p>
      )}
      {benchPayload?.value != null && (
        <p className="mt-0.5 text-teal-600">
          Nifty 50 <span className="font-bold">{fmtValue(benchPayload.value)}</span>
          <span className="ml-1 text-[10px] text-slate-400">(normalised)</span>
        </p>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface PortfolioHistoryChartProps {
  // Legacy / snapshot-based data (still supported)
  snapshots?:       SnapshotSummary[]    // oldest → newest
  // Daily pre-computed data (preferred when available)
  dailyPoints?:     PortfolioHistoryPoint[]
  benchmarkPoints?: BenchmarkPoint[]
  // Note to show as a data-trust label when using synthetic daily data
  dailyNote?:       string | null
  loading?:         boolean
  className?:       string
}

export function PortfolioHistoryChart({
  snapshots       = [],
  dailyPoints     = [],
  benchmarkPoints = [],
  dailyNote,
  loading = false,
  className,
}: PortfolioHistoryChartProps): React.ReactElement {

  // Choose which data source to use
  const useDaily = dailyPoints.length >= 20   // at least 1 month of data

  // Build chart data
  const chartData = useMemo(() => {
    if (useDaily) {
      // Build a set of snapshot dates for overlay dots
      const snapshotMap = new Map<string, SnapshotSummary>(
        snapshots.map((s) => [s.captured_at.slice(0, 10), s])
      )

      // Build benchmark normalisation factor (scale so first value = portfolio first value)
      const firstPortfolioValue = dailyPoints[0]?.total_value ?? 1
      const firstBenchValue     = benchmarkPoints[0]?.close_price ?? 1
      const benchScale          = firstPortfolioValue / firstBenchValue
      const benchMap            = new Map<string, number>(
        benchmarkPoints.map((b) => [b.date, b.close_price * benchScale])
      )

      return dailyPoints.map((p) => {
        const snap = snapshotMap.get(p.date)
        return {
          date:         p.date,
          displayDate:  fmtDateShort(p.date),
          value:        p.total_value,
          benchmark:    benchMap.get(p.date) ?? null,
          label:        snap?.label ?? null,
          isSnapshot:   snap != null,
          pnl:          snap?.total_pnl ?? null,
          pnl_pct:      snap?.total_pnl_pct ?? null,
        }
      })
    }

    // Fallback: snapshot-based data
    return snapshots
      .filter((s) => s.total_value != null)
      .map((s) => ({
        date:        s.captured_at.slice(0, 10),
        displayDate: fmtDate(s.captured_at),
        value:       s.total_value!,
        benchmark:   null,
        label:       s.label,
        isSnapshot:  true,
        pnl:         s.total_pnl,
        pnl_pct:     s.total_pnl_pct,
      }))
  }, [useDaily, dailyPoints, snapshots, benchmarkPoints])

  // Overall trend
  const firstVal = chartData[0]?.value
  const lastVal  = chartData[chartData.length - 1]?.value
  const change   = firstVal != null && lastVal != null && firstVal !== 0
    ? ((lastVal - firstVal) / firstVal) * 100
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

  const hasBenchmark = useDaily && benchmarkPoints.length > 0

  // For daily data, only show tick labels at ~monthly intervals
  const tickInterval = useDaily ? Math.floor(chartData.length / 12) : 'preserveStartEnd'

  // Snapshot dots — only for daily mode (scatter on top of the line)
  const snapshotDates = new Set(snapshots.map((s) => s.captured_at.slice(0, 10)))

  return (
    <div className={cn('rounded-xl border border-slate-200 bg-white p-5', className)}>
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Portfolio Value Over Time</h3>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {useDaily
              ? `${chartData.length} trading days`
              : `${chartData.length} snapshots`
            }
          </p>
        </div>
        {change != null && (
          <div className={cn(
            'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold',
            change >= 0
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
              : 'bg-red-50 text-red-600 border border-red-100',
          )}>
            <TrendIcon className="h-3.5 w-3.5" />
            {change >= 0 ? '+' : ''}{change.toFixed(1)}% over period
          </div>
        )}
      </div>

      {/* Data-trust label — shown only for synthetic daily data */}
      {useDaily && (
        <div className="flex items-start gap-1.5 mb-3 rounded-md border border-slate-100 bg-slate-50 px-3 py-1.5 text-[10px] text-slate-500">
          <Info className="h-3 w-3 shrink-0 mt-0.5 text-slate-400" />
          <span>
            Estimated: current holdings × historical prices.
            Assumes current quantities were held throughout.
          </span>
        </div>
      )}

      {/* Chart */}
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis
            dataKey="displayDate"
            tick={{ fontSize: 10, fill: '#94a3b8' }}
            axisLine={false}
            tickLine={false}
            interval={tickInterval}
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

          {/* Cost basis reference (latest snapshot cost, if available) */}
          {snapshots.length > 0 && snapshots[snapshots.length - 1].total_cost != null && (
            <ReferenceLine
              y={snapshots[snapshots.length - 1].total_cost!}
              stroke="#94a3b8"
              strokeDasharray="4 4"
              strokeWidth={1}
              label={{ value: 'Cost basis', position: 'insideTopRight', fontSize: 9, fill: '#94a3b8' }}
            />
          )}

          {/* Benchmark overlay */}
          {hasBenchmark && (
            <Line
              type="monotone"
              dataKey="benchmark"
              stroke="#0d9488"
              strokeWidth={1.5}
              strokeDasharray="4 2"
              dot={false}
              activeDot={false}
              name="Nifty 50 (normalised)"
              connectNulls
            />
          )}

          {/* Portfolio value line */}
          <Line
            type="monotone"
            dataKey="value"
            stroke="#6366f1"
            strokeWidth={useDaily ? 2 : 2.5}
            dot={useDaily
              ? (props: Record<string, unknown>) => {
                  // Only render dots for snapshot dates
                  const date = (props.payload as Record<string, unknown>)?.date as string
                  if (!snapshotDates.has(date)) return <g key={`dot-${props.index}`} />
                  const cx = props.cx as number
                  const cy = props.cy as number
                  return (
                    <circle
                      key={`dot-${props.index}`}
                      cx={cx} cy={cy}
                      r={4}
                      fill="#6366f1"
                      stroke="#fff"
                      strokeWidth={2}
                    />
                  )
                }
              : { r: 4, fill: '#6366f1', strokeWidth: 2, stroke: '#fff' }
            }
            activeDot={{ r: 6, fill: '#6366f1', stroke: '#fff', strokeWidth: 2 }}
            name="Portfolio value"
            connectNulls
          />

          {hasBenchmark && (
            <Legend
              verticalAlign="bottom"
              height={24}
              iconType="line"
              wrapperStyle={{ fontSize: 10, color: '#94a3b8' }}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
