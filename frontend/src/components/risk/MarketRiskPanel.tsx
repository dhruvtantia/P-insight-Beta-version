/**
 * MarketRiskPanel
 * ----------------
 * Displays the full set of Phase 2 market-based risk metrics
 * in a two-section layout:
 *   Left:  Portfolio metrics (8 cards in a 4-col grid)
 *   Right: Benchmark comparison column (NIFTY 50 vs portfolio)
 *
 * All numbers are pre-formatted by the backend (e.g. 18.3 = 18.3%).
 */

'use client'

import { TrendingUp, TrendingDown, Minus, Info } from 'lucide-react'
import { TooltipHelp } from '@/components/common/TooltipHelp'
import { cn } from '@/lib/utils'
import type { PortfolioRiskMetrics, BenchmarkMetrics } from '@/types'

// ─── Metric card config ───────────────────────────────────────────────────────

interface MetricConfig {
  key:         keyof PortfolioRiskMetrics
  label:       string
  tooltip:     string
  unit:        string         // '%' | 'x' | ''
  invertBad:   boolean        // true if lower = better (e.g. volatility, drawdown)
  badThreshold?: number       // show red if |value| > this
  goodThreshold?: number      // show green if value > this
  description?: string
}

const METRICS: MetricConfig[] = [
  {
    key: 'annualized_return',   label: 'Annualised Return',  tooltip: 'efficient_frontier',
    unit: '%', invertBad: false, goodThreshold: 10, badThreshold: 0,
    description: 'CAGR over the selected period',
  },
  {
    key: 'annualized_volatility', label: 'Volatility',       tooltip: 'volatility',
    unit: '%', invertBad: true, goodThreshold: 0, badThreshold: 25,
    description: 'Annualised standard deviation',
  },
  {
    key: 'sharpe_ratio',        label: 'Sharpe Ratio',       tooltip: 'sharpe_ratio',
    unit: 'x', invertBad: false, goodThreshold: 1.0, badThreshold: 0,
    description: 'Excess return per unit of volatility',
  },
  {
    key: 'sortino_ratio',       label: 'Sortino Ratio',      tooltip: 'sharpe_ratio',
    unit: 'x', invertBad: false, goodThreshold: 1.0, badThreshold: 0,
    description: 'Excess return per unit of downside risk',
  },
  {
    key: 'beta',                label: 'Beta',               tooltip: 'beta',
    unit: 'x', invertBad: false, goodThreshold: 0, badThreshold: 1.3,
    description: 'Sensitivity to NIFTY 50 movements',
  },
  {
    key: 'max_drawdown',        label: 'Max Drawdown',       tooltip: 'max_drawdown',
    unit: '%', invertBad: true, goodThreshold: 0, badThreshold: -15,
    description: 'Largest peak-to-trough decline',
  },
  {
    key: 'information_ratio',   label: 'Info Ratio',         tooltip: 'sharpe_ratio',
    unit: 'x', invertBad: false, goodThreshold: 0.5, badThreshold: 0,
    description: 'Active return per unit of tracking error',
  },
  {
    key: 'alpha',               label: "Jensen's α",         tooltip: 'sharpe_ratio',
    unit: '%', invertBad: false, goodThreshold: 1, badThreshold: -1,
    description: 'Return above CAPM expectation',
  },
]

// ─── Single metric card ───────────────────────────────────────────────────────

function MetricCard({
  config,
  value,
  loading,
}: {
  config:  MetricConfig
  value:   number | null | undefined
  loading: boolean
}) {
  if (loading) {
    return (
      <div className="rounded-lg border border-slate-100 bg-slate-50 p-3.5 animate-pulse">
        <div className="h-3 w-24 rounded bg-slate-200 mb-3" />
        <div className="h-6 w-16 rounded bg-slate-200" />
      </div>
    )
  }

  if (value === null || value === undefined) {
    return (
      <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3.5">
        <div className="flex items-center gap-1 mb-2">
          <p className="text-xs font-semibold text-slate-500">{config.label}</p>
          <TooltipHelp metric={config.tooltip} />
        </div>
        <p className="text-2xl font-bold text-slate-200 mb-0.5">—</p>
        <p className="text-[10px] text-slate-400">{config.description}</p>
      </div>
    )
  }

  // Colour coding
  let colour = 'text-slate-800'
  const v = config.key === 'max_drawdown' ? Math.abs(value) : value

  if (config.invertBad) {
    // Lower = better (volatility, drawdown, tracking error)
    if (config.badThreshold && Math.abs(value) > Math.abs(config.badThreshold))
      colour = 'text-red-600'
    else
      colour = 'text-emerald-600'
  } else {
    // Higher = better (Sharpe, alpha, return)
    if (config.goodThreshold !== undefined && value >= config.goodThreshold)
      colour = 'text-emerald-600'
    else if (config.badThreshold !== undefined && value < config.badThreshold)
      colour = 'text-red-600'
  }

  const displayValue = config.key === 'max_drawdown' ? `-${Math.abs(value).toFixed(1)}` : value.toFixed(2)

  return (
    <div className="rounded-lg border border-slate-100 bg-white p-3.5">
      <div className="flex items-center gap-1 mb-2">
        <p className="text-xs font-semibold text-slate-500">{config.label}</p>
        <TooltipHelp metric={config.tooltip} />
      </div>
      <p className={cn('text-xl font-bold tabular-nums', colour)}>
        {displayValue}
        <span className="text-sm font-medium text-slate-400 ml-0.5">{config.unit}</span>
      </p>
      <p className="text-[10px] text-slate-400 mt-0.5">{config.description}</p>
    </div>
  )
}

// ─── Benchmark comparison row ─────────────────────────────────────────────────

function BenchmarkRow({
  label,
  portValue,
  benchValue,
  unit,
  invertBad = false,
}: {
  label:      string
  portValue:  number | null | undefined
  benchValue: number | null | undefined
  unit:       string
  invertBad?: boolean
}) {
  const fmt = (v: number | null | undefined, isDrawdown = false) => {
    if (v === null || v === undefined) return '—'
    if (isDrawdown) return `-${Math.abs(v).toFixed(1)}${unit}`
    return `${v.toFixed(2)}${unit}`
  }

  const isDrawdown = label === 'Max Drawdown'

  const portBetter =
    portValue !== null && portValue !== undefined &&
    benchValue !== null && benchValue !== undefined &&
    (invertBad ? Math.abs(portValue) < Math.abs(benchValue) : portValue > benchValue)

  return (
    <div className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
      <span className="text-xs text-slate-500">{label}</span>
      <div className="flex items-center gap-3 text-xs font-semibold tabular-nums">
        <span className={cn(portBetter ? 'text-emerald-600' : 'text-slate-700')}>
          {fmt(portValue, isDrawdown)}
        </span>
        <span className="text-slate-300 text-[10px]">vs</span>
        <span className="text-slate-500">{fmt(benchValue, isDrawdown)}</span>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface MarketRiskPanelProps {
  metrics:  PortfolioRiskMetrics | null
  benchmark: BenchmarkMetrics | null
  loading:  boolean
  error?:   string | null
}

export function MarketRiskPanel({
  metrics,
  benchmark,
  loading,
  error,
}: MarketRiskPanelProps) {
  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4">
        <p className="text-sm font-semibold text-red-700">Could not compute risk metrics</p>
        <p className="text-xs text-red-600 mt-1">{error}</p>
      </div>
    )
  }

  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
        <TrendingUp className="h-4 w-4 text-indigo-500" />
        <h3 className="text-sm font-semibold text-slate-800">Market-Based Risk Metrics</h3>
        {benchmark && (
          <span className="ml-auto text-[11px] text-slate-400">
            Benchmark: <span className="font-medium text-slate-600">{benchmark.name}</span>
          </span>
        )}
      </div>

      <div className="p-5 space-y-6">
        {/* Metric tiles — 4-column grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {METRICS.map((cfg) => (
            <MetricCard
              key={cfg.key}
              config={cfg}
              value={metrics?.[cfg.key] as number | null}
              loading={loading}
            />
          ))}
        </div>

        {/* Benchmark comparison panel */}
        {(benchmark || loading) && (
          <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
                Portfolio vs {benchmark?.name ?? 'Benchmark'}
              </p>
              <div className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                <span className="text-indigo-600">Portfolio</span>
                <span>vs</span>
                <span>{benchmark?.ticker ?? '—'}</span>
              </div>
            </div>

            {loading ? (
              <div className="space-y-2 animate-pulse">
                {[1,2,3,4].map(i => (
                  <div key={i} className="flex justify-between py-2">
                    <div className="h-3 w-24 rounded bg-slate-200" />
                    <div className="h-3 w-28 rounded bg-slate-200" />
                  </div>
                ))}
              </div>
            ) : (
              <div>
                <BenchmarkRow label="Annualised Return"  portValue={metrics?.annualized_return}     benchValue={benchmark?.annualized_return}     unit="%" />
                <BenchmarkRow label="Volatility"         portValue={metrics?.annualized_volatility} benchValue={benchmark?.annualized_volatility} unit="%" invertBad />
                <BenchmarkRow label="Sharpe Ratio"       portValue={metrics?.sharpe_ratio}          benchValue={benchmark?.sharpe_ratio}          unit="x" />
                <BenchmarkRow label="Max Drawdown"       portValue={metrics?.max_drawdown}          benchValue={benchmark?.max_drawdown}          unit="%" invertBad />
                {metrics?.tracking_error !== null && metrics?.tracking_error !== undefined && (
                  <div className="pt-2 mt-1 border-t border-slate-100">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-500">Tracking Error</span>
                      <span className="font-semibold text-slate-700">{metrics.tracking_error.toFixed(2)}%</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Risk-free rate note */}
        <p className="text-[10px] text-slate-400 flex items-center gap-1">
          <Info className="h-3 w-3 shrink-0" />
          Risk-free rate: 6.5% p.a. (Indian T-bill). Metrics computed from daily returns.
        </p>
      </div>
    </div>
  )
}
