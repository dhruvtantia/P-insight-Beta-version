/**
 * RiskInsightsPanel
 * ------------------
 * Rule-based risk commentary panel for the /risk page.
 *
 * Derives a set of plain-English insight cards from the RiskSnapshot.
 * Each insight has:
 *   - type: 'flag' | 'observation' | 'suggestion'
 *   - severity: matching the app-wide convention
 *   - title + message
 *
 * No ML, no historical prices, no black box — every insight is traceable
 * to a specific threshold rule defined here.
 */

'use client'

import { AlertTriangle, CheckCircle2, Info, Lightbulb } from 'lucide-react'
import { cn } from '@/lib/utils'
import { RiskProfileBadge } from './RiskProfileBadge'
import type { RiskSnapshot } from '@/types'

// ─── Insight types ────────────────────────────────────────────────────────────

type InsightType = 'flag' | 'observation' | 'suggestion'
type Severity    = 'danger' | 'warning' | 'info' | 'good'

interface DerivedInsight {
  type: InsightType
  severity: Severity
  title: string
  message: string
}

// ─── Insight derivation (pure function) ──────────────────────────────────────

function deriveInsights(snapshot: RiskSnapshot): DerivedInsight[] {
  const insights: DerivedInsight[] = []
  const {
    max_holding_weight,
    top3_weight,
    top5_weight,
    max_sector_weight,
    max_sector_name,
    num_sectors,
    num_holdings,
    hhi,
    effective_n,
    diversification_score,
    single_stock_flag,
    sector_concentration_flag,
    top_holdings_by_weight,
  } = snapshot

  const topTicker = top_holdings_by_weight[0]?.ticker.replace(/\.(NS|BSE|BO)$/i, '') ?? 'Top holding'

  // ── Concentration flags ──────────────────────────────────────────────────

  if (max_holding_weight >= 40) {
    insights.push({
      type: 'flag',
      severity: 'danger',
      title: 'Very high single-stock concentration',
      message: `${topTicker} represents ${max_holding_weight.toFixed(1)}% of the portfolio. A single adverse event in this company — earnings miss, regulatory action, or market shock — could significantly impair overall returns.`,
    })
  } else if (single_stock_flag) {
    insights.push({
      type: 'flag',
      severity: 'warning',
      title: 'Elevated single-stock exposure',
      message: `${topTicker} holds ${max_holding_weight.toFixed(1)}% of the portfolio. Positions above 30% are worth monitoring — consider whether the conviction justifies this size.`,
    })
  }

  if (max_sector_weight >= 60) {
    insights.push({
      type: 'flag',
      severity: 'danger',
      title: 'Sector concentration risk',
      message: `${max_sector_name} accounts for ${max_sector_weight.toFixed(1)}% of the portfolio. Industry-wide events — policy changes, rate cycles, or commodity shocks — will have an outsized effect.`,
    })
  } else if (sector_concentration_flag) {
    insights.push({
      type: 'flag',
      severity: 'warning',
      title: 'Elevated sector exposure',
      message: `${max_sector_name} makes up ${max_sector_weight.toFixed(1)}% of the portfolio. Sector headwinds can affect multiple holdings simultaneously — consider spreading across additional sectors.`,
    })
  }

  // ── Top-3 concentration ──────────────────────────────────────────────────

  if (top3_weight >= 60) {
    insights.push({
      type: 'observation',
      severity: 'warning',
      title: 'Top 3 holdings dominate',
      message: `Your top 3 positions account for ${top3_weight.toFixed(1)}% of the portfolio. The remaining holdings have limited influence on overall performance.`,
    })
  }

  // ── HHI / effective N ────────────────────────────────────────────────────

  if (hhi >= 0.25) {
    insights.push({
      type: 'observation',
      severity: 'warning',
      title: 'High concentration index (HHI)',
      message: `HHI of ${hhi.toFixed(3)} suggests the portfolio behaves like ${effective_n.toFixed(1)} equally-weighted positions — despite having ${num_holdings} holdings. Many holdings have minimal weight.`,
    })
  }

  // ── Sector breadth ───────────────────────────────────────────────────────

  if (num_sectors >= 5 && hhi <= 0.12) {
    insights.push({
      type: 'observation',
      severity: 'good',
      title: 'Strong sector diversification',
      message: `Exposure across ${num_sectors} sectors with a low HHI (${hhi.toFixed(3)}) indicates good diversification. Industry-specific events are less likely to have outsized portfolio impact.`,
    })
  } else if (num_sectors <= 2) {
    insights.push({
      type: 'observation',
      severity: 'warning',
      title: 'Low sector breadth',
      message: `Only ${num_sectors} sector${num_sectors === 1 ? '' : 's'} represented. Adding positions from different industries would reduce correlated risk.`,
    })
  }

  // ── Diversification score ─────────────────────────────────────────────────

  if (diversification_score >= 70) {
    insights.push({
      type: 'observation',
      severity: 'good',
      title: 'Well-balanced position sizing',
      message: `Diversification score of ${diversification_score}/100 suggests position weights are reasonably balanced. No single bet overwhelms the portfolio.`,
    })
  }

  // ── Suggestions ───────────────────────────────────────────────────────────

  if (top5_weight >= 75 && num_holdings > 5) {
    insights.push({
      type: 'suggestion',
      severity: 'info',
      title: 'Consider trimming top positions',
      message: `Top 5 holdings represent ${top5_weight.toFixed(1)}% of the portfolio, leaving the remaining ${num_holdings - 5} positions with minimal influence. Trimming and redistributing could improve effective diversification.`,
    })
  }

  if (num_sectors < 4 && num_holdings >= 5) {
    insights.push({
      type: 'suggestion',
      severity: 'info',
      title: 'Sector breadth could be improved',
      message: `With ${num_holdings} holdings spread across only ${num_sectors} sector${num_sectors === 1 ? '' : 's'}, adding exposure to other industries (e.g. healthcare, consumer staples, or utilities) would reduce correlated drawdown risk.`,
    })
  }

  // Default: if no flags
  if (insights.length === 0) {
    insights.push({
      type: 'observation',
      severity: 'good',
      title: 'No significant concentration flags',
      message: 'No major concentration or diversification warnings detected based on current position weights and sector allocation.',
    })
  }

  return insights
}

// ─── Insight card ─────────────────────────────────────────────────────────────

const SEVERITY_CONFIG: Record<
  Severity,
  { border: string; bg: string; iconColor: string; Icon: React.ElementType }
> = {
  danger:  { border: 'border-red-200',    bg: 'bg-red-50',    iconColor: 'text-red-500',    Icon: AlertTriangle   },
  warning: { border: 'border-amber-200',  bg: 'bg-amber-50',  iconColor: 'text-amber-500',  Icon: AlertTriangle   },
  info:    { border: 'border-blue-200',   bg: 'bg-blue-50',   iconColor: 'text-blue-500',   Icon: Lightbulb       },
  good:    { border: 'border-emerald-200',bg: 'bg-emerald-50',iconColor: 'text-emerald-600',Icon: CheckCircle2    },
}

const TYPE_LABEL: Record<InsightType, string> = {
  flag:        'FLAG',
  observation: 'OBSERVATION',
  suggestion:  'SUGGESTION',
}

function InsightCard({ insight }: { insight: DerivedInsight }) {
  const config = SEVERITY_CONFIG[insight.severity]
  const { Icon } = config
  return (
    <div className={cn(
      'flex gap-3 rounded-lg border p-4 transition-colors',
      config.border, config.bg
    )}>
      <Icon className={cn('h-4 w-4 shrink-0 mt-0.5', config.iconColor)} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <p className="text-xs font-bold text-slate-800">{insight.title}</p>
          <span className={cn(
            'text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded border',
            config.border, 'bg-white/60', config.iconColor
          )}>
            {TYPE_LABEL[insight.type]}
          </span>
        </div>
        <p className="text-[12px] text-slate-600 leading-relaxed">{insight.message}</p>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface RiskInsightsPanelProps {
  snapshot: RiskSnapshot | null
  loading?: boolean
}

export function RiskInsightsPanel({ snapshot, loading = false }: RiskInsightsPanelProps) {
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-100">
        <Info className="h-4 w-4 text-indigo-500 shrink-0" />
        <h3 className="text-sm font-semibold text-slate-800">Risk Insights</h3>
        <span className="text-[11px] text-slate-400 ml-1 hidden sm:block">
          — rule-based, derived from position weights
        </span>
        {snapshot && (
          <div className="ml-auto">
            <RiskProfileBadge profile={snapshot.risk_profile} size="sm" />
          </div>
        )}
      </div>

      <div className="p-5">
        {loading ? (
          <div className="space-y-3 animate-pulse">
            {[0, 1, 2].map((i) => (
              <div key={i} className="rounded-lg bg-slate-50 border border-slate-100 p-4 flex gap-3">
                <div className="h-4 w-4 rounded bg-slate-200 shrink-0 mt-0.5" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-48 rounded bg-slate-200" />
                  <div className="h-2.5 w-full rounded bg-slate-100" />
                  <div className="h-2.5 w-4/5 rounded bg-slate-100" />
                </div>
              </div>
            ))}
          </div>
        ) : !snapshot ? (
          <p className="text-sm text-slate-400 text-center py-6">No portfolio data loaded.</p>
        ) : (
          <div className="space-y-3">
            {/* Profile classification reason */}
            <div className="rounded-lg border border-indigo-100 bg-indigo-50/60 p-4">
              <div className="flex items-start gap-3">
                <Info className="h-4 w-4 text-indigo-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-indigo-800 mb-0.5">
                    Why this profile?
                  </p>
                  <p className="text-[12px] text-indigo-700 leading-relaxed">
                    {snapshot.risk_profile_reason}
                  </p>
                </div>
              </div>
            </div>

            {/* Derived insight cards */}
            {deriveInsights(snapshot).map((insight, i) => (
              <InsightCard key={i} insight={insight} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
