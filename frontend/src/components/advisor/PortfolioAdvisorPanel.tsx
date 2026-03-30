/**
 * PortfolioAdvisorPanel — dashboard widget for the advisor
 * ---------------------------------------------------------
 * Shows a condensed analysis of the portfolio:
 *   • Quick response to the top risk or opportunity found
 *   • Up to 2 compact insight cards
 *   • "Ask the advisor →" CTA link to /advisor
 *
 * Uses the advisor engine directly (no hook — avoids extra data fetches
 * since the dashboard already passes holdings/sectors/riskSnapshot as props).
 */

'use client'

import { useMemo }                from 'react'
import Link                       from 'next/link'
import { MessageCircle, Sparkles, ArrowRight } from 'lucide-react'
import { useFundamentals }        from '@/hooks/useFundamentals'
import { useWatchlist }           from '@/hooks/useWatchlist'
import { useOptimization }        from '@/hooks/useOptimization'
import { useSnapshots }           from '@/hooks/useSnapshots'
import { useDelta }               from '@/hooks/useDelta'
import { usePortfolioStore }      from '@/store/portfolioStore'
import { routeQuery }             from '@/lib/advisor'
import { AdvisorResponseCard }    from './AdvisorResponseCard'
import type { Holding, SectorAllocation, RiskSnapshot } from '@/types'

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function PanelSkeleton() {
  return (
    <div className="card animate-pulse">
      <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100">
        <div className="h-4 w-4 rounded bg-slate-200" />
        <div className="h-3.5 w-36 rounded bg-slate-200" />
      </div>
      <div className="p-5 space-y-3">
        <div className="h-3 w-full rounded bg-slate-100" />
        <div className="h-3 w-4/5 rounded bg-slate-100" />
        <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 space-y-2">
          <div className="h-3 w-1/2 rounded bg-slate-200" />
          <div className="h-2.5 w-full rounded bg-slate-100" />
          <div className="h-2.5 w-3/4 rounded bg-slate-100" />
        </div>
      </div>
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

interface PortfolioAdvisorPanelProps {
  holdings:      Holding[]
  sectors:       SectorAllocation[]
  riskSnapshot:  RiskSnapshot | null
  loading:       boolean
}

export function PortfolioAdvisorPanel({
  holdings,
  sectors,
  riskSnapshot,
  loading,
}: PortfolioAdvisorPanelProps) {

  const { enrichedHoldings, weightedMetrics, loading: fundLoading } = useFundamentals(holdings)
  const { items: watchlistItems } = useWatchlist()
  const { data: optData } = useOptimization()

  // ── Latest delta (non-blocking) ────────────────────────────────────────────
  //    Silently load the most recent 2 snapshots to get delta context.
  //    If unavailable, delta remains null — advisor falls back gracefully.
  const { activePortfolioId } = usePortfolioStore()
  const { snapshots } = useSnapshots(activePortfolioId)
  const latestToId   = snapshots.length >= 2 ? snapshots[0].id : null
  const latestFromId = snapshots.length >= 2 ? snapshots[1].id : null
  const { delta: latestDelta } = useDelta(latestFromId, latestToId)

  // Summarise optimizer outputs for the advisor engine
  const optimizationSummary = useMemo(() => {
    if (!optData?.max_sharpe) return null
    const ms = optData.max_sharpe
    const mv = optData.min_variance
    const cur = optData.current
    const rebalCount = optData.rebalance?.length ?? 0
    return {
      maxSharpe: {
        expectedReturn: ms.expected_return,
        volatility:     ms.volatility,
        sharpeRatio:    ms.sharpe_ratio,
        topWeights:     Object.entries(ms.weights)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 3)
          .map(([t, w]) => ({ ticker: t.replace(/\.(NS|BO|BSE)$/i, ''), weight: +(w * 100).toFixed(1) })),
      },
      minVariance: mv ? {
        volatility:  mv.volatility,
        sharpeRatio: mv.sharpe_ratio,
      } : null,
      currentSharpe:    cur?.sharpe_ratio ?? null,
      rebalanceActions: rebalCount,
      period:           optData.meta?.period,
    }
  }, [optData])

  const engineInput = useMemo(
    () => ({
      holdings,
      enrichedHoldings,
      sectors,
      weightedMetrics,
      riskSnapshot,
      watchlistItems,
      optimizationSummary,
      latestDelta,
    }),
    [holdings, enrichedHoldings, sectors, weightedMetrics, riskSnapshot, watchlistItems, optimizationSummary, latestDelta],
  )

  // Pick the most relevant quick-analysis:
  // • If there is a concentration flag → concentration analysis
  // • If watchlist has high-conviction items → watchlist
  // • Fallback → general overview
  const quickAnalysis = useMemo(() => {
    if (holdings.length === 0) return null
    if (riskSnapshot?.single_stock_flag || riskSnapshot?.sector_concentration_flag) {
      return routeQuery('Which stock contributes the most risk?', engineInput)
    }
    if (watchlistItems.some((w) => w.tag === 'High Conviction')) {
      return routeQuery('What are my watchlist opportunities?', engineInput)
    }
    return routeQuery('Give me a portfolio overview', engineInput)
  }, [holdings.length, riskSnapshot, watchlistItems, engineInput])

  if (loading || fundLoading) return <PanelSkeleton />
  if (!quickAnalysis) return null

  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-indigo-500 shrink-0" />
          <h3 className="text-sm font-semibold text-slate-800">Portfolio Advisor</h3>
          <p className="text-[11px] text-slate-400 ml-1 hidden sm:block">
            — rule-based analysis of your portfolio
          </p>
        </div>
        <Link
          href="/advisor"
          className="flex items-center gap-1 text-[11px] font-medium text-indigo-600
                     hover:text-indigo-800 transition-colors"
        >
          <MessageCircle className="h-3.5 w-3.5" />
          Ask the advisor
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {/* Quick analysis — compact mode (2 items max, no follow-ups) */}
      <div className="p-4">
        <AdvisorResponseCard response={quickAnalysis} compact />
      </div>

      {/* Suggested questions */}
      <div className="border-t border-slate-100 bg-slate-50/40 px-5 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
          Try asking
        </p>
        <div className="flex flex-wrap gap-1.5">
          {[
            ...(latestDelta ? ['What changed in my portfolio?'] : []),
            'What sectors am I missing?',
            'Is my portfolio overvalued?',
            'How should I optimize?',
          ].slice(0, 3).map((q) => (
            <Link
              key={q}
              href={`/advisor?q=${encodeURIComponent(q)}`}
              className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px]
                         text-slate-600 hover:bg-indigo-50 hover:border-indigo-200
                         hover:text-indigo-700 transition-colors"
            >
              {q}
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
