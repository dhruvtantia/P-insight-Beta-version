/**
 * FrontierChart
 * -------------
 * Scatter chart plotting:
 *   • Efficient frontier curve (line + dots, blue)
 *   • Current portfolio point  (orange circle)
 *   • Min variance portfolio   (green diamond)
 *   • Max Sharpe portfolio     (gold star)
 *
 * X-axis: Annualised Volatility (%)
 * Y-axis: Expected Annual Return (%)
 *
 * Data: from OptimizationFullResponse
 */

'use client'

import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'
import { TrendingUp } from 'lucide-react'
import type { PortfolioPoint } from '@/types'

// ─── Custom tooltip ────────────────────────────────────────────────────────────

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ payload: { vol: number; ret: number; sharpe: number; label: string } }>
}) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload

  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-lg px-3 py-2.5 text-xs">
      {d.label && (
        <p className="font-bold text-slate-700 mb-1.5 capitalize">
          {d.label.replace(/_/g, ' ')}
        </p>
      )}
      <div className="space-y-0.5">
        <div className="flex items-center justify-between gap-4">
          <span className="text-slate-500">Volatility</span>
          <span className="font-semibold tabular-nums">{d.vol.toFixed(2)}%</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-slate-500">Return</span>
          <span className={`font-semibold tabular-nums ${d.ret >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            {d.ret >= 0 ? '+' : ''}{d.ret.toFixed(2)}%
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-slate-500">Sharpe</span>
          <span className="font-semibold tabular-nums">{d.sharpe.toFixed(3)}x</span>
        </div>
      </div>
    </div>
  )
}

// ─── Loading skeleton ──────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="h-72 animate-pulse flex items-center justify-center">
      <div className="w-full h-full rounded-lg bg-slate-100" />
    </div>
  )
}

// ─── Data prep ─────────────────────────────────────────────────────────────────

type ChartPoint = { vol: number; ret: number; sharpe: number; label: string }

function toChartPoint(p: PortfolioPoint): ChartPoint {
  return {
    vol:    p.volatility,
    ret:    p.expected_return,
    sharpe: p.sharpe_ratio,
    label:  p.label,
  }
}

// ─── Main component ────────────────────────────────────────────────────────────

interface FrontierChartProps {
  frontier:    PortfolioPoint[]
  current:     PortfolioPoint | null
  minVariance: PortfolioPoint | null
  maxSharpe:   PortfolioPoint | null
  loading:     boolean
  error?:      string | null
}

export function FrontierChart({
  frontier,
  current,
  minVariance,
  maxSharpe,
  loading,
  error,
}: FrontierChartProps) {
  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4">
        <p className="text-sm font-semibold text-red-700">Could not compute efficient frontier</p>
        <p className="text-xs text-red-600 mt-1">{error}</p>
      </div>
    )
  }

  const frontierData  = frontier.map(toChartPoint)
  const currentData   = current     ? [toChartPoint(current)]     : []
  const minVarData    = minVariance  ? [toChartPoint(minVariance)] : []
  const maxSharpeData = maxSharpe    ? [toChartPoint(maxSharpe)]   : []

  // Axis bounds
  const allVols = [...frontierData, ...currentData].map((d) => d.vol)
  const allRets = [...frontierData, ...currentData].map((d) => d.ret)
  const volMin  = allVols.length ? Math.floor(Math.min(...allVols) - 2) : 0
  const volMax  = allVols.length ? Math.ceil(Math.max(...allVols)  + 2) : 30
  const retMin  = allRets.length ? Math.floor(Math.min(...allRets) - 2) : -5
  const retMax  = allRets.length ? Math.ceil(Math.max(...allRets)  + 3) : 25

  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
        <TrendingUp className="h-4 w-4 text-indigo-500" />
        <h3 className="text-sm font-semibold text-slate-800">Efficient Frontier</h3>
        <span className="ml-auto text-[11px] text-slate-400">
          Risk (vol %) × Return (%) plane
        </span>
      </div>

      <div className="p-5">
        {loading ? (
          <Skeleton />
        ) : frontier.length === 0 ? (
          <div className="h-72 flex items-center justify-center text-sm text-slate-400">
            No frontier data available
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <ScatterChart margin={{ top: 8, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis
                type="number"
                dataKey="vol"
                name="Volatility"
                domain={[volMin, volMax]}
                tickFormatter={(v) => `${v}%`}
                tick={{ fontSize: 10, fill: '#94a3b8' }}
                tickLine={false}
                axisLine={false}
                label={{
                  value: 'Volatility (%)',
                  position: 'insideBottom',
                  offset: -2,
                  style: { fontSize: 10, fill: '#94a3b8' },
                }}
              />
              <YAxis
                type="number"
                dataKey="ret"
                name="Return"
                domain={[retMin, retMax]}
                tickFormatter={(v) => `${v}%`}
                tick={{ fontSize: 10, fill: '#94a3b8' }}
                tickLine={false}
                axisLine={false}
                width={48}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }}
              />
              <ReferenceLine y={0} stroke="#e2e8f0" strokeWidth={1} />

              {/* Frontier curve */}
              <Scatter
                name="Efficient Frontier"
                data={frontierData}
                fill="#6366f1"
                fillOpacity={0.6}
                line={{ stroke: '#6366f1', strokeWidth: 1.5 }}
                lineType="joint"
                shape="circle"
              />

              {/* Current portfolio */}
              {currentData.length > 0 && (
                <Scatter
                  name="Current"
                  data={currentData}
                  fill="#f97316"
                  shape="circle"
                />
              )}

              {/* Min variance */}
              {minVarData.length > 0 && (
                <Scatter
                  name="Min Variance"
                  data={minVarData}
                  fill="#10b981"
                  shape="diamond"
                />
              )}

              {/* Max Sharpe */}
              {maxSharpeData.length > 0 && (
                <Scatter
                  name="Max Sharpe"
                  data={maxSharpeData}
                  fill="#f59e0b"
                  shape="star"
                />
              )}
            </ScatterChart>
          </ResponsiveContainer>
        )}

        {!loading && (
          <p className="text-[10px] text-slate-400 mt-2">
            Based on historical expected returns and sample covariance.
            Long-only constraint, max 40% per holding. Risk-free rate: 6.5%.
          </p>
        )}
      </div>
    </div>
  )
}
