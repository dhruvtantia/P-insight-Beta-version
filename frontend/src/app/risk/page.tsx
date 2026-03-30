/**
 * Risk Page — Concentration + Market-Based Analytics
 * ---------------------------------------------------------------
 *
 * Layout:
 *   1. Page header (title + data source + period selector + refresh)
 *   2. RiskSnapshotCard     — profile + diversification bar + 6 metric tiles
 *   3. Two-column grid:
 *        Left  — ConcentrationBreakdown  (position bars)
 *        Right — RiskInsightsPanel       (rule-based flags)
 *   4. MarketRiskPanel      — 8-metric grid + benchmark comparison
 *   5. Two-column charts:
 *        Left  — PerformanceChart  (cumulative return vs benchmark)
 *        Right — DrawdownChart     (peak-to-trough series)
 *   6. CorrelationMatrix    — pairwise heatmap
 *   7. Per-holding contributions table
 */

'use client'

import { useMemo }                    from 'react'
import { Activity, RefreshCw, Info }  from 'lucide-react'
import { usePortfolio }               from '@/hooks/usePortfolio'
import { useDataMode }                from '@/hooks/useDataMode'
import { useQuantAnalytics }          from '@/hooks/useQuantAnalytics'
import { RiskSnapshotCard }           from '@/components/risk/RiskSnapshotCard'
import { ConcentrationBreakdown }     from '@/components/risk/ConcentrationBreakdown'
import { RiskInsightsPanel }          from '@/components/risk/RiskInsightsPanel'
import { MarketRiskPanel }            from '@/components/risk/MarketRiskPanel'
import { PerformanceChart }           from '@/components/risk/PerformanceChart'
import { DrawdownChart }              from '@/components/risk/DrawdownChart'
import { CorrelationMatrix }          from '@/components/risk/CorrelationMatrix'
import { computeRiskSnapshot }        from '@/lib/risk'
import { cn }                         from '@/lib/utils'
import type { QuantPeriod }           from '@/hooks/useQuantAnalytics'

// ─── Period selector ──────────────────────────────────────────────────────────

const PERIODS: { value: QuantPeriod; label: string }[] = [
  { value: '3mo', label: '3M' },
  { value: '6mo', label: '6M' },
  { value: '1y',  label: '1Y' },
]

function PeriodSelector({
  value,
  onChange,
  disabled,
}: {
  value: QuantPeriod
  onChange: (p: QuantPeriod) => void
  disabled: boolean
}) {
  return (
    <div className="flex items-center rounded-lg border border-slate-200 bg-white overflow-hidden">
      {PERIODS.map((p) => (
        <button
          key={p.value}
          onClick={() => onChange(p.value)}
          disabled={disabled}
          className={cn(
            'px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-40',
            value === p.value
              ? 'bg-indigo-600 text-white'
              : 'text-slate-600 hover:bg-slate-50'
          )}
        >
          {p.label}
        </button>
      ))}
    </div>
  )
}

// ─── Contributions table ──────────────────────────────────────────────────────

function ContributionsTable({
  contributions,
  loading,
}: {
  contributions: Array<{
    ticker: string
    weight: number
    annualized_return: number | null
    volatility: number | null
    beta: number | null
  }>
  loading: boolean
}) {
  const fmt = (v: number | null, digits = 2, suffix = '') =>
    v === null || v === undefined ? '—' : `${v.toFixed(digits)}${suffix}`

  const fmtReturn = (v: number | null) => {
    if (v === null || v === undefined) return '—'
    return (
      <span className={v >= 0 ? 'text-emerald-600' : 'text-red-600'}>
        {v >= 0 ? '+' : ''}{v.toFixed(2)}%
      </span>
    )
  }

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
        <Activity className="h-4 w-4 text-indigo-500" />
        <h3 className="text-sm font-semibold text-slate-800">Per-Holding Attribution</h3>
        <span className="text-[11px] text-slate-400 ml-1">
          — annualised metrics over selected period
        </span>
      </div>

      <div className="overflow-x-auto">
        {loading ? (
          <div className="p-5 space-y-2 animate-pulse">
            {[1,2,3,4].map(i => (
              <div key={i} className="flex gap-4">
                <div className="h-4 w-20 rounded bg-slate-100" />
                <div className="h-4 w-12 rounded bg-slate-100" />
                <div className="h-4 w-16 rounded bg-slate-100" />
                <div className="h-4 w-16 rounded bg-slate-100" />
                <div className="h-4 w-12 rounded bg-slate-100" />
              </div>
            ))}
          </div>
        ) : contributions.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-slate-400">
            No holding attribution data available
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60">
                <th className="px-5 py-2.5 text-left font-semibold text-slate-500">Ticker</th>
                <th className="px-4 py-2.5 text-right font-semibold text-slate-500">Weight</th>
                <th className="px-4 py-2.5 text-right font-semibold text-slate-500">Ann. Return</th>
                <th className="px-4 py-2.5 text-right font-semibold text-slate-500">Volatility</th>
                <th className="px-4 py-2.5 text-right font-semibold text-slate-500">Beta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {contributions.map((row) => (
                <tr key={row.ticker} className="hover:bg-slate-50/50">
                  <td className="px-5 py-2.5 font-semibold text-slate-800 tabular-nums">
                    {row.ticker.replace(/\.(NS|BO|BSE)$/i, '')}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">
                    {fmt(row.weight, 1, '%')}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-semibold">
                    {fmtReturn(row.annualized_return)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">
                    {fmt(row.volatility, 2, '%')}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">
                    {fmt(row.beta)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ─── Risk page ────────────────────────────────────────────────────────────────

export default function RiskPage() {
  const { holdings, summary, sectors, loading: portLoading, error: portError, refetch: portRefetch } = usePortfolio()
  const { currentConfig } = useDataMode()
  const {
    data:      quantData,
    loading:   quantLoading,
    error:     quantError,
    period,
    setPeriod,
    refetch:   quantRefetch,
  } = useQuantAnalytics()

  const riskSnapshot = useMemo(
    () => computeRiskSnapshot(holdings, sectors, summary),
    [holdings, sectors, summary]
  )

  const loading = portLoading || quantLoading

  function handleRefresh() {
    portRefetch()
    quantRefetch()
  }

  // Extract quant sub-objects safely
  const metrics     = quantData?.metrics?.portfolio ?? null
  const benchmark   = quantData?.metrics?.benchmark ?? null
  const perfPort    = quantData?.performance?.portfolio ?? []
  const perfBench   = quantData?.performance?.benchmark ?? []
  const drawdown    = quantData?.drawdown ?? []
  const correlation = quantData?.correlation ?? null
  const contribs    = quantData?.contributions ?? []
  const benchName   = benchmark?.name ?? 'NIFTY 50'

  return (
    <div className="space-y-6 max-w-[1600px]">

      {/* ── Page header ────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Activity className="h-5 w-5 text-indigo-500" />
            <h1 className="text-lg font-bold text-slate-900">Risk Analytics</h1>
          </div>
          <p className="text-sm text-slate-500">
            Concentration, diversification &amp; market-based risk metrics.
            {currentConfig && (
              <span className="ml-1 font-medium text-slate-700">
                Source: {currentConfig.label}
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <PeriodSelector value={period} onChange={setPeriod} disabled={quantLoading} />
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white
                       px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50
                       disabled:opacity-40 transition-colors"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            Refresh
          </button>
        </div>
      </div>

      {/* ── Portfolio error ─────────────────────────────────────────────── */}
      {portError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4">
          <p className="text-sm font-semibold text-red-700">Unable to load portfolio data</p>
          <p className="text-xs text-red-600 mt-1">{portError}</p>
        </div>
      )}

      {!portError && (
        <>
          {/* ── 1. Concentration snapshot ─────────────────────────────────── */}
          <RiskSnapshotCard snapshot={riskSnapshot} loading={portLoading} compact={false} />

          {/* ── 2. Concentration + insights ───────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {riskSnapshot ? (
              <ConcentrationBreakdown snapshot={riskSnapshot} loading={portLoading} />
            ) : (
              <div className="card p-5 animate-pulse">
                <div className="h-4 w-48 rounded bg-slate-200 mb-4" />
                <div className="space-y-4">
                  {[90, 72, 60, 50, 40, 32].map((w, i) => (
                    <div key={i}>
                      <div className="h-3 rounded bg-slate-100 mb-1.5" style={{ width: `${w}%` }} />
                      <div className="h-2.5 w-full rounded-full bg-slate-100" />
                    </div>
                  ))}
                </div>
              </div>
            )}
            <RiskInsightsPanel snapshot={riskSnapshot} loading={portLoading} />
          </div>

          {/* ── 3. Market-based risk metrics ──────────────────────────────── */}
          <MarketRiskPanel
            metrics={metrics}
            benchmark={benchmark}
            loading={quantLoading}
            error={quantError}
          />

          {/* ── 4. Performance + Drawdown charts ──────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <PerformanceChart
              portfolio={perfPort}
              benchmark={perfBench}
              benchmarkName={benchName}
              loading={quantLoading}
              error={quantError}
            />
            <DrawdownChart
              drawdown={drawdown}
              loading={quantLoading}
              error={quantError}
            />
          </div>

          {/* ── 5. Correlation matrix ─────────────────────────────────────── */}
          <CorrelationMatrix
            correlation={correlation}
            loading={quantLoading}
            error={quantError}
          />

          {/* ── 6. Per-holding attribution ────────────────────────────────── */}
          <ContributionsTable
            contributions={contribs}
            loading={quantLoading}
          />

          {/* ── Data quality / meta note ──────────────────────────────────── */}
          {quantData?.meta && !quantLoading && (
            <div className="flex items-start gap-2 text-[11px] text-slate-400 px-1">
              <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>
                {quantData.meta.data_points} trading days · period {quantData.meta.period}
                {quantData.meta.date_range && (
                  <> · {quantData.meta.date_range.start} → {quantData.meta.date_range.end}</>
                )}
                {quantData.meta.invalid_tickers.length > 0 && (
                  <> · <span className="text-amber-500">excluded: {quantData.meta.invalid_tickers.join(', ')}</span></>
                )}
                {quantData.meta.cached && (
                  <> · <span className="text-emerald-500">cached</span></>
                )}
              </span>
            </div>
          )}
        </>
      )}
    </div>
  )
}
