/**
 * Fundamentals Page — Phase 1: Valuation & Quality Analytics
 * -----------------------------------------------------------
 *
 * Layout:
 *   1. Page header (title + data source indicator)
 *   2. PortfolioWeightedMetricsCard  — sectioned weighted-average tiles
 *   3. FundamentalsTable             — sortable per-stock metrics grid
 *
 * Data flow:
 *   usePortfolio() → holdings (with enriched weights)
 *   useFundamentals(holdings) → enrichedHoldings + weightedMetrics
 *
 * No additional API calls needed beyond what usePortfolio already fetches.
 * useFundamentals calls /analytics/ratios once on mount.
 */

'use client'

import { BarChart2, RefreshCw }              from 'lucide-react'
import { usePortfolio }                       from '@/hooks/usePortfolio'
import { useFundamentals }                    from '@/hooks/useFundamentals'
import { useDataMode }                        from '@/hooks/useDataMode'
import { PortfolioWeightedMetricsCard }       from '@/components/fundamentals/PortfolioWeightedMetricsCard'
import { FundamentalsTable }                  from '@/components/fundamentals/FundamentalsTable'
import { cn }                                 from '@/lib/utils'

export default function FundamentalsPage() {
  const { holdings, loading: portfolioLoading, error: portfolioError, refetch } = usePortfolio()
  const { currentConfig } = useDataMode()

  const {
    enrichedHoldings,
    weightedMetrics,
    meta,
    loading: fundLoading,
    error: fundError,
    refetch: refetchFundamentals,
  } = useFundamentals(holdings)

  const loading = portfolioLoading || fundLoading
  const error   = portfolioError ?? fundError

  function handleRefresh() {
    refetch()
    refetchFundamentals()
  }

  return (
    <div className="space-y-6 max-w-[1600px]">

      {/* ── Page header ──────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <BarChart2 className="h-5 w-5 text-teal-500" />
            <h1 className="text-lg font-bold text-slate-900">Fundamentals & Valuation</h1>
          </div>
          <p className="text-sm text-slate-500">
            Per-stock financial ratios and portfolio-level weighted averages.
            {currentConfig && (
              <span className="ml-1 font-medium text-slate-700">
                Source: {currentConfig.label}
              </span>
            )}
          </p>
        </div>

        <button
          onClick={handleRefresh}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white
                     px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50
                     disabled:opacity-40 transition-colors shrink-0"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {/* ── Error state ──────────────────────────────────────────────────────── */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4">
          <p className="text-sm font-semibold text-red-700">Unable to load fundamentals data</p>
          <p className="text-xs text-red-600 mt-1">{error}</p>
        </div>
      )}

      {/* ── Fundamentals trust notice (shown when any holding has no data) ──── */}
      {!loading && meta?.incomplete && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-3 flex items-start gap-3">
          <span className="mt-0.5 text-amber-500 text-base leading-none select-none">⚠</span>
          <div>
            <p className="text-sm font-semibold text-amber-800">
              Partial data — fundamentals available for {meta.available_holdings} of {meta.total_holdings} holdings
              {meta.coverage_pct !== null && (
                <span className="font-normal text-amber-700"> ({meta.coverage_pct}% coverage)</span>
              )}
            </p>
            {meta.unavailable_tickers.length > 0 && (
              <p className="text-xs text-amber-700 mt-0.5">
                No data: {meta.unavailable_tickers.join(', ')}
              </p>
            )}
          </div>
        </div>
      )}

      {!error && (
        <>
          {/* ── 1. Portfolio-level weighted averages ─────────────────────────── */}
          <PortfolioWeightedMetricsCard
            weightedMetrics={weightedMetrics}
            totalHoldings={holdings.length}
            loading={loading}
          />

          {/* ── 2. Per-stock sortable table ──────────────────────────────────── */}
          <FundamentalsTable
            holdings={enrichedHoldings}
            loading={loading}
          />
        </>
      )}
    </div>
  )
}
