/**
 * Simulation Page — /simulate (v2)
 * ----------------------------------
 * Portfolio simulation and rebalancing sandbox.
 *
 * Layout (lg+):
 *   Full-width: page header + context strip + controls bar
 *   Left column (7/12):
 *     • "Base Portfolio" section header
 *     • AllocationSlider list
 *   Right column (5/12, sticky):
 *     • ScenarioComparisonPanel
 *     • RebalanceSuggestionCard list
 *     • Empty hint when unmodified
 *
 * Deep-link:
 *   /simulate?add=TICKER.NS  — auto-adds that ticker from watchlist on mount
 *
 * UX improvements in v2:
 *   - ContextSummaryStrip shows base portfolio stats at top
 *   - Section labels distinguish "Base Portfolio" from "Scenario Impact"
 *   - Controls bar: Normalize renamed, Reset is red/destructive, badge is more prominent
 *   - Scenario column headers are visually larger and colour-coded
 *   - Disclaimer is now a proper info callout
 */

'use client'

import { useEffect, useRef, Suspense }  from 'react'
import { useSearchParams }              from 'next/navigation'
import Link                             from 'next/link'
import { GitFork, RefreshCw, AlertCircle,
         Lightbulb, ArrowLeft, Info,
         TrendingUp, Shield, Zap }      from 'lucide-react'
import { useSimulation }                from '@/hooks/useSimulation'
import { useOptimization }              from '@/hooks/useOptimization'
import { AllocationSlider }             from '@/components/simulate/AllocationSlider'
import { SimulationControls }           from '@/components/simulate/SimulationControls'
import { ScenarioComparisonPanel }      from '@/components/simulate/ScenarioComparisonPanel'
import { RebalanceSuggestionCard }      from '@/components/simulate/RebalanceSuggestionCard'
import { ContextSummaryStrip }          from '@/components/ui/ContextSummaryStrip'
import { InlineHelperText }             from '@/components/ui/InlineHelperText'
import { cn }                           from '@/lib/utils'
import type { PortfolioPoint }          from '@/types'

// ─── Optimizer preset card ────────────────────────────────────────────────────

interface OptimizerPresetCardProps {
  maxSharpe:   PortfolioPoint | null
  minVariance: PortfolioPoint | null
  loading:     boolean
  error:       string | null
  onApplyMaxSharpe:   () => void
  onApplyMinVariance: () => void
}

function OptimizerPresetCard({
  maxSharpe, minVariance, loading, error,
  onApplyMaxSharpe, onApplyMinVariance,
}: OptimizerPresetCardProps) {
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100 bg-indigo-50/60">
        <Zap className="h-4 w-4 text-indigo-500 shrink-0" />
        <h3 className="text-sm font-semibold text-slate-800">Optimizer Presets</h3>
        <Link
          href="/optimize"
          className="ml-auto text-[11px] font-medium text-indigo-600 hover:text-indigo-800 transition-colors"
        >
          View frontier →
        </Link>
      </div>

      <div className="p-4 space-y-2">
        {error && (
          <p className="text-[11px] text-red-500 pb-1">
            Optimizer unavailable — start backend to enable presets.
          </p>
        )}

        {/* Max Sharpe preset */}
        <button
          onClick={onApplyMaxSharpe}
          disabled={loading || !maxSharpe}
          className={cn(
            'w-full flex items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-all',
            'hover:bg-amber-50 hover:border-amber-300 disabled:opacity-40 disabled:cursor-not-allowed',
            'border-amber-200 bg-amber-50/40',
          )}
        >
          <TrendingUp className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-800">Apply Max Sharpe</p>
            <p className="text-[10px] text-slate-500 leading-snug mt-0.5">
              Best risk-adjusted return
              {maxSharpe && (
                <span className="ml-1 text-amber-700 font-semibold">
                  · {maxSharpe.expected_return.toFixed(1)}% ret
                  · {maxSharpe.volatility.toFixed(1)}% vol
                  · {maxSharpe.sharpe_ratio.toFixed(2)}× Sharpe
                </span>
              )}
            </p>
          </div>
        </button>

        {/* Min Variance preset */}
        <button
          onClick={onApplyMinVariance}
          disabled={loading || !minVariance}
          className={cn(
            'w-full flex items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-all',
            'hover:bg-blue-50 hover:border-blue-300 disabled:opacity-40 disabled:cursor-not-allowed',
            'border-blue-200 bg-blue-50/40',
          )}
        >
          <Shield className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-800">Apply Min Variance</p>
            <p className="text-[10px] text-slate-500 leading-snug mt-0.5">
              Lowest achievable risk
              {minVariance && (
                <span className="ml-1 text-blue-700 font-semibold">
                  · {minVariance.volatility.toFixed(1)}% vol
                  · {minVariance.expected_return.toFixed(1)}% ret
                </span>
              )}
            </p>
          </div>
        </button>

        {loading && (
          <p className="text-[10px] text-slate-400 text-center pt-1">
            <RefreshCw className="h-3 w-3 inline animate-spin mr-1" />
            Loading optimizer…
          </p>
        )}
      </div>
    </div>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function PageSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-14 rounded-xl bg-slate-100" />
      <div className="h-12 rounded-xl bg-slate-100" />
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-7 space-y-3">
          {[0,1,2,3,4].map((i) => (
            <div key={i} className="h-14 rounded-xl bg-slate-100" />
          ))}
        </div>
        <div className="lg:col-span-5 space-y-3">
          <div className="h-80 rounded-xl bg-slate-100" />
          <div className="h-32 rounded-xl bg-slate-100" />
        </div>
      </div>
    </div>
  )
}

// ─── Page inner (reads search params) ─────────────────────────────────────────

function SimulatePageInner() {
  const searchParams = useSearchParams()
  const addParam     = searchParams.get('add')

  const {
    baseScenario,
    simScenario,
    delta,
    suggestions,
    totalSimWeight,
    isModified,
    watchlistItems,
    portfolioTickers,
    addStock,
    addNewStock,
    addFromWatchlist,
    removeStock,
    undoRemove,
    setWeight,
    normalize,
    reset,
    applyFromSuggestion,
    applyOptimizedWeights,
    loading,
    error,
  } = useSimulation()

  // Optimizer presets — load once (1Y / historical_mean / auto defaults)
  const {
    data:          optData,
    loading:       optLoading,
    error:         optError,
  } = useOptimization()

  const maxSharpeWeights   = optData?.max_sharpe?.weights   ?? null
  const minVarianceWeights = optData?.min_variance?.weights ?? null

  // Deep-link: auto-add ticker from URL param once watchlist is loaded
  const addParamApplied = useRef(false)
  useEffect(() => {
    if (!addParam || addParamApplied.current || watchlistItems.length === 0) return
    const upper   = addParam.toUpperCase()
    const wlItem  = watchlistItems.find((w) => w.ticker.toUpperCase() === upper)
    if (wlItem) {
      addFromWatchlist(wlItem)
      addParamApplied.current = true
    }
  }, [addParam, watchlistItems, addFromWatchlist])

  if (loading) return <PageSkeleton />

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6">
        <div className="flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
          <p className="text-sm text-red-700">
            Could not load portfolio: {error}.{' '}
            <Link href="/dashboard" className="underline">Go to dashboard</Link>
          </p>
        </div>
      </div>
    )
  }

  if (!baseScenario || !simScenario) {
    return (
      <div className="flex h-64 items-center justify-center text-slate-400">
        <RefreshCw className="h-5 w-5 animate-spin mr-2" />
        <span className="text-sm">Building simulation…</span>
      </div>
    )
  }

  const simHoldings   = simScenario.holdings
  const simTickers    = new Set(simHoldings.map((h) => h.ticker.toUpperCase()))
  const modifiedCount = simHoldings.filter((h) => h.action !== 'hold').length

  // Sort: adds first → modified → hold (by original weight desc) → removed last
  const ORDER: Record<string, number> = { add: 0, modified: 1, hold: 2, remove: 3 }
  const sorted = [...simHoldings].sort((a, b) => {
    const oa = ORDER[a.action] ?? 2
    const ob = ORDER[b.action] ?? 2
    if (oa !== ob) return oa - ob
    return b.original_weight - a.original_weight
  })

  const activeCount = sorted.filter((h) => h.action !== 'remove').length
  const baseRisk    = baseScenario.riskSnapshot?.risk_profile?.replace(/_/g, ' ') ?? '—'
  const basePE      = baseScenario.weightedMetrics?.wtd_pe?.toFixed(1) ?? '—'
  const baseHHI     = baseScenario.riskSnapshot?.hhi.toFixed(3) ?? '—'
  const baseDiv     = baseScenario.riskSnapshot?.diversification_score ?? '—'

  return (
    <div className="space-y-5 max-w-[1560px]">

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <GitFork className="h-5 w-5 text-violet-500" />
            <h1 className="text-lg font-bold text-slate-900">Portfolio Simulator</h1>
            {isModified && (
              <span className="rounded-full bg-amber-100 text-amber-700 border border-amber-200
                               text-[10px] font-semibold px-2.5 py-0.5">
                {modifiedCount} change{modifiedCount > 1 ? 's' : ''} from base
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500">
            Drag the weight sliders, remove or add holdings — the right panel updates instantly.
          </p>
        </div>
        <Link
          href="/dashboard"
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-700
                     transition-colors shrink-0 mt-0.5"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Dashboard
        </Link>
      </div>

      {/* ── Base portfolio context strip ─────────────────────────────────── */}
      <ContextSummaryStrip
        items={[
          { label: 'Base Holdings',  value: String(baseScenario.holdings.length) },
          { label: 'Risk Profile',   value: baseRisk.replace(/\b\w/g, (c) => c.toUpperCase()),
            badge: true,
            badgeColor:
              baseRisk.includes('high')     ? 'red'     :
              baseRisk.includes('moderate') ? 'amber'   :
              'emerald',
          },
          { label: 'HHI',             value: baseHHI },
          { label: 'Div. Score',      value: String(baseDiv) },
          { label: 'Wtd P/E',         value: basePE !== '—' ? `${basePE}×` : '—' },
        ]}
      />

      {/* ── Controls bar ─────────────────────────────────────────────────── */}
      <SimulationControls
        totalSimWeight={totalSimWeight}
        isModified={isModified}
        modifiedCount={modifiedCount}
        watchlistItems={watchlistItems}
        portfolioTickers={portfolioTickers}
        simTickers={simTickers}
        onAddFromWatchlist={addFromWatchlist}
        onAddNewStock={addNewStock}
        onNormalize={normalize}
        onReset={reset}
      />

      {/* ── Two-column layout ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">

        {/* ── Left: allocation sliders ─────────────────────────────────── */}
        <div className="lg:col-span-7 space-y-2">
          {/* Section label */}
          <div className="flex items-center gap-2 px-1 mb-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
              Holdings ({activeCount} active{sorted.filter((h) => h.action === 'remove').length > 0
                ? ` · ${sorted.filter((h) => h.action === 'remove').length} removed`
                : ''})
            </p>
            <div className="flex-1 h-px bg-slate-100" />
            <InlineHelperText text="Drag slider · hover to remove" />
          </div>

          {sorted.map((holding) => (
            <AllocationSlider
              key={holding.ticker}
              holding={holding}
              onSetWeight={setWeight}
              onRemove={removeStock}
              onUndoRemove={undoRemove}
            />
          ))}

          {sorted.length === 0 && (
            <div className="rounded-xl border-2 border-dashed border-slate-200 py-12 text-center text-slate-400">
              <GitFork className="h-6 w-6 mx-auto mb-2 text-slate-300" />
              <p className="text-sm">No holdings to display.</p>
              <p className="text-xs mt-1">Add stocks from your watchlist using the controls above.</p>
            </div>
          )}
        </div>

        {/* ── Right: comparison + suggestions ──────────────────────────── */}
        <div className="lg:col-span-5 space-y-4 sticky top-4">

          {/* Optimizer presets */}
          <OptimizerPresetCard
            maxSharpe={optData?.max_sharpe ?? null}
            minVariance={optData?.min_variance ?? null}
            loading={optLoading}
            error={optError}
            onApplyMaxSharpe={() => {
              if (maxSharpeWeights) applyOptimizedWeights(maxSharpeWeights)
            }}
            onApplyMinVariance={() => {
              if (minVarianceWeights) applyOptimizedWeights(minVarianceWeights)
            }}
          />

          {/* Scenario comparison panel */}
          {delta && (
            <ScenarioComparisonPanel
              base={baseScenario}
              sim={simScenario}
              delta={delta}
            />
          )}

          {/* Rebalance suggestions */}
          {suggestions.length > 0 && (
            <div className="card overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100 bg-amber-50/60">
                <Lightbulb className="h-4 w-4 text-amber-500 shrink-0" />
                <h3 className="text-sm font-semibold text-slate-800">
                  Rebalancing Suggestions
                </h3>
                <span className="ml-auto rounded-full bg-amber-100 text-amber-700
                                 border border-amber-200 text-[10px] font-bold px-2 py-0.5">
                  {suggestions.length}
                </span>
              </div>
              <div className="p-4 space-y-3">
                {suggestions.map((s) => (
                  <RebalanceSuggestionCard
                    key={s.id}
                    suggestion={s}
                    onApply={applyFromSuggestion}
                  />
                ))}
              </div>
            </div>
          )}

          {/* No changes yet — hint */}
          {!isModified && (
            <div className="rounded-xl border border-slate-100 bg-slate-50/60 px-5 py-6 text-center">
              <GitFork className="h-7 w-7 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-medium text-slate-600 mb-1">
                No changes yet
              </p>
              <p className="text-xs text-slate-400 leading-relaxed">
                Drag a slider, add a stock, or use an <span className="text-indigo-500 font-medium">Optimizer Preset</span> above to instantly load an MPT-optimized allocation.
              </p>
              {watchlistItems.length > 0 && (
                <p className="text-xs text-violet-500 mt-3 font-medium">
                  {watchlistItems.filter((w) => !portfolioTickers.has(w.ticker.toUpperCase())).length} watchlist stocks available to add →
                </p>
              )}
            </div>
          )}

          {/* Disclaimer */}
          <div className="flex items-start gap-2 rounded-lg border border-slate-100 bg-slate-50 px-4 py-3">
            <Info className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5" />
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Simulation is for analysis only — no trades are executed.
              Fundamentals are sourced from Yahoo Finance when available.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Page export ─────────────────────────────────────────────────────────────

export default function SimulatePage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <SimulatePageInner />
    </Suspense>
  )
}
