'use client'

/**
 * PortfolioInsightsPanel — full rule-based intelligence layer.
 *
 * Data flow:
 *   useFundamentals(holdings) → weightedMetrics
 *   useWatchlist()            → watchlistItems
 *   computePortfolioInsights() → PortfolioInsightItem[]
 *   sortInsightsBySeverity()   → displayed grid
 *
 * Replaces the old InsightsPanel that used backend commentary.
 * The backend commentary still runs, but this panel provides richer,
 * more interactive client-computed insights.
 */

import { useMemo, useState }            from 'react'
import { Lightbulb, ChevronDown,
         ChevronUp, RefreshCw }         from 'lucide-react'
import { useFundamentals }              from '@/hooks/useFundamentals'
import { useWatchlist }                 from '@/hooks/useWatchlist'
import { computePortfolioInsights,
         sortInsightsBySeverity }       from '@/lib/insights'
import { InsightCard }                  from './InsightCard'
import { InsightSeverityBadge }         from './InsightSeverityBadge'
import { cn }                           from '@/lib/utils'
import type { Holding, SectorAllocation,
              RiskSnapshot }            from '@/types'

const COLLAPSE_AFTER = 4   // Show top N insights by default

interface Props {
  holdings:     Holding[]
  sectors:      SectorAllocation[]
  riskSnapshot: RiskSnapshot | null
  loading:      boolean
}

export function PortfolioInsightsPanel({ holdings, sectors, riskSnapshot, loading }: Props) {
  const [expanded, setExpanded] = useState(false)

  // ── Data ────────────────────────────────────────────────────────────────────
  const { weightedMetrics, loading: fundLoading } = useFundamentals(holdings)
  const { items: watchlistItems }                 = useWatchlist()

  // ── Compute insights ────────────────────────────────────────────────────────
  const allInsights = useMemo(() => {
    if (holdings.length === 0) return []
    return sortInsightsBySeverity(
      computePortfolioInsights({
        holdings,
        sectors,
        weightedMetrics,
        riskSnapshot,
        watchlistItems,
      })
    )
  }, [holdings, sectors, weightedMetrics, riskSnapshot, watchlistItems])

  const isLoading     = loading || fundLoading
  const displayCount  = expanded ? allInsights.length : COLLAPSE_AFTER
  const displayed     = allInsights.slice(0, displayCount)
  const hiddenCount   = allInsights.length - COLLAPSE_AFTER

  // Severity summary counts
  const criticalCount = allInsights.filter((i) => i.severity === 'critical').length
  const warningCount  = allInsights.filter((i) => i.severity === 'warning').length
  const positiveCount = allInsights.filter((i) => i.severity === 'positive').length

  return (
    <div className="card overflow-hidden">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
        <Lightbulb className="h-4 w-4 text-amber-500 shrink-0" />
        <h3 className="text-sm font-semibold text-slate-800">Portfolio Intelligence</h3>
        <p className="text-[11px] text-slate-400 hidden sm:block">
          — rule-based analysis from your data
        </p>

        {/* Severity summary chips */}
        {!isLoading && allInsights.length > 0 && (
          <div className="ml-auto flex items-center gap-1.5">
            {criticalCount > 0 && (
              <span className="text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 rounded-full px-2 py-0.5">
                {criticalCount} critical
              </span>
            )}
            {warningCount > 0 && (
              <span className="text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                {warningCount} warning
              </span>
            )}
            {positiveCount > 0 && (
              <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                {positiveCount} positive
              </span>
            )}
          </div>
        )}

        {isLoading && (
          <RefreshCw className="ml-auto h-3.5 w-3.5 text-slate-400 animate-spin" />
        )}
      </div>

      {/* ── Content ─────────────────────────────────────────────────────────── */}
      {isLoading ? (
        <InsightsSkeleton />
      ) : allInsights.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-slate-400">
          No insights available yet. Add portfolio holdings to unlock analysis.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 p-5">
            {displayed.map((insight) => (
              <InsightCard key={insight.id} insight={insight} />
            ))}
          </div>

          {/* ── Expand / Collapse ──────────────────────────────────────────── */}
          {allInsights.length > COLLAPSE_AFTER && (
            <div className="border-t border-slate-100 px-5 py-3">
              <button
                onClick={() => setExpanded((e) => !e)}
                className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-800 transition-colors"
              >
                {expanded ? (
                  <>
                    <ChevronUp className="h-3.5 w-3.5" />
                    Show fewer insights
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-3.5 w-3.5" />
                    Show {hiddenCount} more insight{hiddenCount > 1 ? 's' : ''}
                  </>
                )}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function InsightsSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 p-5">
      {[1, 2, 3].map((i) => (
        <div key={i} className="rounded-xl border border-slate-100 p-4 animate-pulse border-l-4 border-l-slate-200">
          <div className="flex justify-between mb-2">
            <div className="h-4 w-20 rounded-full bg-slate-200" />
            <div className="h-5 w-10 rounded bg-slate-100" />
          </div>
          <div className="h-3.5 rounded bg-slate-200 w-5/6 mb-1.5" />
          <div className="h-3 rounded bg-slate-100 w-full mb-1" />
          <div className="h-3 rounded bg-slate-100 w-4/5" />
        </div>
      ))}
    </div>
  )
}
