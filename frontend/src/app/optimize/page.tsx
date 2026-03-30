/**
 * /optimize — Portfolio Optimization Engine
 * ------------------------------------------
 *
 * Layout:
 *   1. Page header: title + period selector + method selectors + refresh
 *   2. Three comparison cards: Current | Min Variance | Max Sharpe
 *   3. Efficient Frontier chart
 *   4. Allocation comparison table (all three portfolios side-by-side)
 *   5. Rebalance recommendations table
 *   6. Assumptions footnote
 */

'use client'

import { Info, RefreshCw, TrendingUp } from 'lucide-react'
import { useOptimization }               from '@/hooks/useOptimization'
import { useDataMode }                   from '@/hooks/useDataMode'
import { FrontierChart }                 from '@/components/optimization/FrontierChart'
import { OptimizationCards }             from '@/components/optimization/OptimizationCards'
import { AllocationTable }               from '@/components/optimization/AllocationTable'
import { RebalanceTable }                from '@/components/optimization/RebalanceTable'
import { cn }                            from '@/lib/utils'
import type { OptPeriod, ErMethod, CovMethod } from '@/hooks/useOptimization'

// ─── Selectors ────────────────────────────────────────────────────────────────

function PeriodSelector({
  value, onChange, disabled,
}: { value: OptPeriod; onChange: (p: OptPeriod) => void; disabled: boolean }) {
  const options: { value: OptPeriod; label: string }[] = [
    { value: '3mo', label: '3M' },
    { value: '6mo', label: '6M' },
    { value: '1y',  label: '1Y' },
  ]
  return (
    <div className="flex items-center rounded-lg border border-slate-200 bg-white overflow-hidden">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          disabled={disabled}
          className={cn(
            'px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-40',
            value === o.value
              ? 'bg-indigo-600 text-white'
              : 'text-slate-600 hover:bg-slate-50'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function MethodSelect<T extends string>({
  label, value, options, onChange, disabled,
}: {
  label:    string
  value:    T
  options:  { value: T; label: string }[]
  onChange: (v: T) => void
  disabled: boolean
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        disabled={disabled}
        className="rounded border border-slate-200 bg-white text-xs text-slate-700
                   px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400
                   disabled:opacity-40"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  )
}

// ─── Optimize page ────────────────────────────────────────────────────────────

export default function OptimizePage() {
  const {
    data, loading, error,
    period, setPeriod,
    erMethod,  setErMethod,
    covMethod, setCovMethod,
    refetch,
  } = useOptimization()

  const { currentConfig } = useDataMode()

  const current     = data?.current     ?? null
  const minVariance = data?.min_variance ?? null
  const maxSharpe   = data?.max_sharpe  ?? null
  const frontier    = data?.frontier    ?? []
  const rebalance   = data?.rebalance   ?? []
  const meta        = data?.meta

  const erOptions: { value: ErMethod; label: string }[] = [
    { value: 'historical_mean', label: 'Historical Mean' },
    { value: 'ema_mean',        label: 'EMA (3mo)' },
  ]

  const covOptions: { value: CovMethod; label: string }[] = [
    { value: 'auto',        label: 'Auto' },
    { value: 'sample',      label: 'Sample' },
    { value: 'ledoit_wolf', label: 'Ledoit-Wolf' },
  ]

  return (
    <div className="space-y-6 max-w-[1600px]">

      {/* ── Page header ────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="h-5 w-5 text-indigo-500" />
            <h1 className="text-lg font-bold text-slate-900">Portfolio Optimization</h1>
          </div>
          <p className="text-sm text-slate-500">
            Efficient Frontier · Modern Portfolio Theory · Long-only constraints.
            {currentConfig && (
              <span className="ml-1 font-medium text-slate-700">
                Source: {currentConfig.label}
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap shrink-0">
          <PeriodSelector value={period} onChange={setPeriod} disabled={loading} />

          <MethodSelect
            label="μ"
            value={erMethod}
            options={erOptions}
            onChange={setErMethod}
            disabled={loading}
          />
          <MethodSelect
            label="Σ"
            value={covMethod}
            options={covOptions}
            onChange={setCovMethod}
            disabled={loading}
          />

          <button
            onClick={refetch}
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

      {/* ── Error ──────────────────────────────────────────────────────── */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4">
          <p className="text-sm font-semibold text-red-700">Optimization failed</p>
          <p className="text-xs text-red-600 mt-1">{error}</p>
          <p className="text-xs text-red-500 mt-2">
            Make sure the backend is running:{' '}
            <code className="bg-red-100 px-1 rounded">poetry run uvicorn main:app --reload --port 8000</code>
          </p>
        </div>
      )}

      {/* ── Backend error from meta ─────────────────────────────────────── */}
      {!loading && meta?.error && !error && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
          <p className="text-sm font-semibold text-amber-700">Optimization incomplete</p>
          <p className="text-xs text-amber-600 mt-1">{meta.error}</p>
        </div>
      )}

      {!error && (
        <>
          {/* ── 1. Three comparison cards ──────────────────────────────── */}
          <OptimizationCards
            current={current}
            minVariance={minVariance}
            maxSharpe={maxSharpe}
            loading={loading}
          />

          {/* ── 2. Efficient Frontier chart ─────────────────────────────── */}
          <FrontierChart
            frontier={frontier}
            current={current}
            minVariance={minVariance}
            maxSharpe={maxSharpe}
            loading={loading}
            error={error}
          />

          {/* ── 3. Allocation comparison table ──────────────────────────── */}
          <AllocationTable
            current={current}
            minVariance={minVariance}
            maxSharpe={maxSharpe}
            loading={loading}
          />

          {/* ── 4. Rebalance recommendations ────────────────────────────── */}
          <RebalanceTable
            rebalance={rebalance}
            loading={loading}
          />

          {/* ── Meta footer ─────────────────────────────────────────────── */}
          {meta && !loading && (
            <div className="flex items-start gap-2 text-[11px] text-slate-400 px-1">
              <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span className="flex flex-wrap gap-x-2 gap-y-0.5">
                <span>{meta.n_observations} obs · {meta.period}</span>
                <span>μ: {meta.expected_returns_method?.replace(/_/g, ' ')}</span>
                <span>Σ: {meta.covariance_method?.replace(/_/g, ' ')}</span>
                <span>solver: <span className={meta.optimizer_method === 'slsqp' ? 'text-emerald-600' : 'text-amber-500'}>{meta.optimizer_method ?? '—'}</span></span>
                <span>{meta.n_frontier_points} frontier pts</span>
                {meta.scipy_available === false && (
                  <span className="text-amber-500">scipy missing — using Monte Carlo fallback</span>
                )}
                {meta.sklearn_available === false && (
                  <span className="text-slate-500">sklearn missing — Ledoit-Wolf unavailable</span>
                )}
                {meta.invalid_tickers.length > 0 && (
                  <span className="text-amber-500">excluded: {meta.invalid_tickers.join(', ')}</span>
                )}
                {meta.cached && (
                  <span className="text-emerald-500">cached</span>
                )}
              </span>
            </div>
          )}

          {/* ── Assumptions disclaimer ───────────────────────────────────── */}
          <div className="card px-5 py-4 bg-slate-50/60">
            <p className="text-[11px] font-semibold text-slate-600 mb-1.5">Assumptions & Limitations</p>
            <ul className="text-[10px] text-slate-400 space-y-0.5 list-disc list-inside">
              <li>Expected returns estimated from historical data only — past performance is not indicative of future results</li>
              <li>Long-only portfolio (no short selling), max 40% per holding, min 0%, fully invested</li>
              <li>Covariance matrix assumes stationary returns over the selected period</li>
              <li>No transaction costs, taxes, or liquidity constraints modelled</li>
              <li>Risk-free rate: 6.5% p.a. (approximate Indian T-bill rate)</li>
              <li>These are quantitative suggestions only — not financial advice. Consult a SEBI-registered advisor before rebalancing.</li>
            </ul>
          </div>
        </>
      )}
    </div>
  )
}
