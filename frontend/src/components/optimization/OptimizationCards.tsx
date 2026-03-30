/**
 * OptimizationCards
 * -----------------
 * Three comparison cards: Current Portfolio | Min Variance | Max Sharpe
 *
 * Each card shows:
 *  - Expected return, Volatility, Sharpe ratio
 *  - Colour-coded improvement indicators vs Current
 *
 * Data: PortfolioPoint from OptimizationFullResponse
 */

'use client'

import { TrendingUp, TrendingDown, Minus, Award, Shield, Activity } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PortfolioPoint } from '@/types'

// ─── Metric row ────────────────────────────────────────────────────────────────

function MetricRow({
  label,
  value,
  unit   = '%',
  delta,
  deltaGoodIfPositive = true,
}: {
  label:               string
  value:               number | null
  unit?:               string
  delta?:              number | null    // vs current
  deltaGoodIfPositive?: boolean
}) {
  const fmt = (v: number | null) =>
    v === null ? '—' : `${v.toFixed(2)}${unit}`

  const deltaColour =
    delta == null ? ''
    : Math.abs(delta) < 0.05 ? 'text-slate-400'
    : (delta > 0) === deltaGoodIfPositive ? 'text-emerald-600' : 'text-red-600'

  const DeltaIcon =
    delta == null    ? null
    : delta > 0.05   ? TrendingUp
    : delta < -0.05  ? TrendingDown
    :                  Minus

  return (
    <div className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
      <span className="text-xs text-slate-500">{label}</span>
      <div className="flex items-center gap-2">
        {delta != null && DeltaIcon && (
          <span className={cn('flex items-center gap-0.5 text-[10px] font-semibold', deltaColour)}>
            <DeltaIcon className="h-3 w-3" />
            {Math.abs(delta).toFixed(2)}{unit}
          </span>
        )}
        <span className="text-xs font-bold tabular-nums text-slate-800">{fmt(value)}</span>
      </div>
    </div>
  )
}

// ─── Single portfolio card ─────────────────────────────────────────────────────

function PortfolioCard({
  title,
  subtitle,
  icon:  Icon,
  point,
  current,
  highlighted,
  loading,
}: {
  title:       string
  subtitle:    string
  icon:        React.ElementType
  point:       PortfolioPoint | null
  current:     PortfolioPoint | null
  highlighted: boolean
  loading:     boolean
}) {
  const delta = (field: 'expected_return' | 'volatility' | 'sharpe_ratio') => {
    if (!point || !current) return null
    return point[field] - current[field]
  }

  if (loading) {
    return (
      <div className="card p-5 animate-pulse space-y-3">
        <div className="h-4 w-32 rounded bg-slate-200" />
        <div className="h-3 w-24 rounded bg-slate-100" />
        <div className="h-px w-full bg-slate-100 mt-2" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex justify-between">
            <div className="h-3 w-20 rounded bg-slate-100" />
            <div className="h-3 w-14 rounded bg-slate-100" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div
      className={cn(
        'card p-5 transition-shadow',
        highlighted && 'ring-2 ring-amber-400 ring-offset-1'
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={cn(
            'rounded-lg p-1.5',
            highlighted ? 'bg-amber-50' : 'bg-slate-50',
          )}>
            <Icon className={cn('h-3.5 w-3.5', highlighted ? 'text-amber-500' : 'text-indigo-500')} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-800">{title}</p>
            <p className="text-[10px] text-slate-400">{subtitle}</p>
          </div>
        </div>
        {highlighted && (
          <span className="rounded-full bg-amber-100 text-amber-700 text-[9px] font-bold px-1.5 py-0.5">
            RECOMMENDED
          </span>
        )}
      </div>

      {/* Metrics */}
      {point ? (
        <div>
          <MetricRow
            label="Expected Return"
            value={point.expected_return}
            delta={!highlighted && current ? null : delta('expected_return')}
            deltaGoodIfPositive
          />
          <MetricRow
            label="Volatility"
            value={point.volatility}
            delta={!highlighted && current ? null : delta('volatility')}
            deltaGoodIfPositive={false}
          />
          <MetricRow
            label="Sharpe Ratio"
            value={point.sharpe_ratio}
            unit="x"
            delta={!highlighted && current ? null : delta('sharpe_ratio')}
            deltaGoodIfPositive
          />
        </div>
      ) : (
        <p className="text-xs text-slate-400 py-3">Not available</p>
      )}
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────

interface OptimizationCardsProps {
  current:     PortfolioPoint | null
  minVariance: PortfolioPoint | null
  maxSharpe:   PortfolioPoint | null
  loading:     boolean
}

export function OptimizationCards({
  current,
  minVariance,
  maxSharpe,
  loading,
}: OptimizationCardsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <PortfolioCard
        title="Current Portfolio"
        subtitle="Where you are today"
        icon={Activity}
        point={current}
        current={null}      // no deltas for current card
        highlighted={false}
        loading={loading}
      />
      <PortfolioCard
        title="Min Variance"
        subtitle="Lowest achievable risk"
        icon={Shield}
        point={minVariance}
        current={current}
        highlighted={false}
        loading={loading}
      />
      <PortfolioCard
        title="Max Sharpe"
        subtitle="Best risk-adjusted return"
        icon={Award}
        point={maxSharpe}
        current={current}
        highlighted
        loading={loading}
      />
    </div>
  )
}
