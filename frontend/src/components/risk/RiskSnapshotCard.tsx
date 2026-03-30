/**
 * RiskSnapshotCard
 * -----------------
 * Shows the key risk metrics derived from the portfolio.
 * Two modes:
 *
 *   compact = false (default): Full card — used at the top of /risk page.
 *     Displays profile badge, diversification score bar, all key metrics.
 *
 *   compact = true: Horizontal strip — used on the dashboard between charts
 *     and insights. Shows profile + 4 key numbers.
 *
 * Data: receives RiskSnapshot (pre-computed from computeRiskSnapshot()).
 */

'use client'

import { Shield, TrendingUp } from 'lucide-react'
import { RiskProfileBadge } from './RiskProfileBadge'
import { RiskMetricItem } from './RiskMetricItem'
import { TooltipHelp } from '@/components/common/TooltipHelp'
import { cn } from '@/lib/utils'
import {
  holdingWeightStatus,
  top3WeightStatus,
  sectorWeightStatus,
  hhiStatus,
  diversificationScoreStatus,
} from '@/lib/risk'
import type { RiskSnapshot } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface RiskSnapshotCardProps {
  snapshot: RiskSnapshot | null
  loading?: boolean
  compact?: boolean
}

// ─── Skeleton states ──────────────────────────────────────────────────────────

function CompactSkeleton() {
  return (
    <div className="card p-5 animate-pulse">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-8">
        <div className="flex items-center gap-3 shrink-0">
          <div className="h-5 w-5 rounded bg-slate-200" />
          <div>
            <div className="h-3 w-24 rounded bg-slate-200 mb-1.5" />
            <div className="h-5 w-32 rounded-full bg-slate-100" />
          </div>
        </div>
        <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-1">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex justify-between py-1.5">
              <div className="h-3 w-20 rounded bg-slate-100" />
              <div className="h-3 w-10 rounded bg-slate-200" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function FullSkeleton() {
  return (
    <div className="card p-5 animate-pulse space-y-4">
      <div className="flex items-center gap-3">
        <div className="h-5 w-5 rounded bg-slate-200" />
        <div className="h-4 w-32 rounded bg-slate-200" />
      </div>
      <div className="flex items-center gap-4">
        <div className="h-6 w-36 rounded-full bg-slate-200" />
        <div className="flex-1 h-3 rounded-full bg-slate-100" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="rounded-lg bg-slate-50 p-4 h-[72px]" />
        ))}
      </div>
    </div>
  )
}

// ─── Diversification score bar ────────────────────────────────────────────────

function DiversificationBar({
  score,
  compact = false,
}: {
  score: number
  compact?: boolean
}) {
  const status = diversificationScoreStatus(score)
  const colors = {
    good:    'bg-emerald-500',
    warning: 'bg-amber-400',
    danger:  'bg-red-500',
    neutral: 'bg-slate-300',
  }

  return (
    <div className={cn('flex items-center gap-3', compact && 'flex-col gap-1')}>
      {!compact && (
        <span className="text-[10px] text-slate-400 uppercase tracking-wider shrink-0 w-8">0</span>
      )}
      <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden min-w-[80px]">
        <div
          className={cn('h-full rounded-full transition-all duration-700', colors[status])}
          style={{ width: `${score}%` }}
        />
      </div>
      {!compact && (
        <span className="text-[10px] text-slate-400 uppercase tracking-wider shrink-0 w-6 text-right">100</span>
      )}
      <span className={cn(
        'font-bold tabular-nums shrink-0',
        compact ? 'text-xs' : 'text-sm',
        status === 'good'    && 'text-emerald-700',
        status === 'warning' && 'text-amber-700',
        status === 'danger'  && 'text-red-600',
      )}>
        {score}
        {compact && <span className="text-slate-400 font-normal">/100</span>}
      </span>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function RiskSnapshotCard({
  snapshot,
  loading = false,
  compact = false,
}: RiskSnapshotCardProps) {
  // Loading states
  if (loading && !snapshot) {
    return compact ? <CompactSkeleton /> : <FullSkeleton />
  }

  if (!snapshot) return null

  // ── COMPACT MODE (dashboard strip) ────────────────────────────────────────
  if (compact) {
    return (
      <div className="card overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100">
          <Shield className="h-4 w-4 text-slate-400 shrink-0" />
          <h3 className="text-sm font-semibold text-slate-800">Risk Snapshot</h3>
          <TooltipHelp metric="risk_profile" />
          <div className="ml-auto flex items-center gap-3">
            <RiskProfileBadge profile={snapshot.risk_profile} size="sm" />
          </div>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Diversification bar */}
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className="text-[11px] font-semibold text-slate-500">Diversification Score</span>
              <TooltipHelp metric="diversification_score" />
            </div>
            <DiversificationBar score={snapshot.diversification_score} compact />
          </div>

          {/* Metrics grid — 2×3 on lg, 2×3 on sm, stacked on mobile */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-0.5">
            <RiskMetricItem
              label="Largest holding"
              value={`${snapshot.max_holding_weight.toFixed(1)}%`}
              status={holdingWeightStatus(snapshot.max_holding_weight)}
              tooltipMetric="concentration"
              compact
            />
            <RiskMetricItem
              label="Top 3 combined"
              value={`${snapshot.top3_weight.toFixed(1)}%`}
              status={top3WeightStatus(snapshot.top3_weight)}
              compact
            />
            <RiskMetricItem
              label="Sectors"
              value={`${snapshot.num_sectors}`}
              status={snapshot.num_sectors >= 5 ? 'good' : snapshot.num_sectors >= 3 ? 'warning' : 'danger'}
              compact
            />
            <RiskMetricItem
              label="Largest sector"
              value={`${snapshot.max_sector_weight.toFixed(1)}%`}
              status={sectorWeightStatus(snapshot.max_sector_weight)}
              tooltipMetric="sector_concentration"
              compact
            />
            <RiskMetricItem
              label="HHI"
              value={snapshot.hhi.toFixed(3)}
              status={hhiStatus(snapshot.hhi)}
              tooltipMetric="hhi"
              compact
            />
            <RiskMetricItem
              label="Effective N"
              value={snapshot.effective_n.toFixed(1)}
              status={snapshot.effective_n >= 7 ? 'good' : snapshot.effective_n >= 4 ? 'warning' : 'danger'}
              tooltipMetric="effective_n"
              compact
            />
          </div>
        </div>
      </div>
    )
  }

  // ── FULL MODE (/risk page top card) ───────────────────────────────────────
  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-100">
        <Shield className="h-4 w-4 text-slate-500 shrink-0" />
        <h3 className="text-sm font-semibold text-slate-800">Portfolio Risk Snapshot</h3>
        <TooltipHelp metric="risk_profile" />
        <span className="text-[11px] text-slate-400 hidden sm:block ml-1">
          — derived from position weights &amp; sectors (no price history required)
        </span>
      </div>

      <div className="p-5 space-y-5">
        {/* Profile + diversification score row */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div>
              <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Risk Profile</p>
              <RiskProfileBadge profile={snapshot.risk_profile} size="lg" />
            </div>
          </div>

          <div className="flex-1 sm:pl-6 sm:border-l border-slate-100">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5">
                <p className="text-xs font-semibold text-slate-600">Diversification Score</p>
                <TooltipHelp metric="diversification_score" />
              </div>
              <TrendingUp className="h-3.5 w-3.5 text-slate-300" />
            </div>
            <DiversificationBar score={snapshot.diversification_score} />
            <p className="text-[10px] text-slate-400 mt-1">
              {snapshot.diversification_score >= 65
                ? 'Good spread across positions and sectors'
                : snapshot.diversification_score >= 40
                ? 'Moderate — some concentration exists'
                : 'Low — consider spreading across more positions or sectors'}
            </p>
          </div>
        </div>

        {/* Metrics grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <RiskMetricItem
            label="Largest Single Holding"
            value={`${snapshot.max_holding_weight.toFixed(1)}%`}
            status={holdingWeightStatus(snapshot.max_holding_weight)}
            tooltipMetric="concentration"
            description={
              snapshot.max_holding_weight >= 35
                ? 'This is high — a large loss in this stock will significantly affect the portfolio.'
                : snapshot.max_holding_weight >= 20
                ? 'Above 20% is worth monitoring — consider whether the conviction justifies the size.'
                : 'Within a healthy range. No single stock dominates.'
            }
          />

          <RiskMetricItem
            label="Top 3 Combined Weight"
            value={`${snapshot.top3_weight.toFixed(1)}%`}
            status={top3WeightStatus(snapshot.top3_weight)}
            tooltipMetric="portfolio_weight"
            description={
              snapshot.top3_weight >= 60
                ? 'Three positions hold the majority — portfolio outcome is heavily tied to these.'
                : snapshot.top3_weight >= 45
                ? 'Moderate top-3 concentration. Monitor these positions closely.'
                : 'Well distributed. No small group of stocks dominates.'
            }
          />

          <RiskMetricItem
            label="Top 5 Combined Weight"
            value={`${snapshot.top5_weight.toFixed(1)}%`}
            status={
              snapshot.top5_weight >= 75 ? 'danger'
              : snapshot.top5_weight >= 55 ? 'warning'
              : 'good'
            }
            description={`Your top 5 positions make up ${snapshot.top5_weight.toFixed(1)}% of the portfolio.`}
          />

          <RiskMetricItem
            label="Largest Sector"
            value={`${snapshot.max_sector_name} · ${snapshot.max_sector_weight.toFixed(1)}%`}
            status={sectorWeightStatus(snapshot.max_sector_weight)}
            tooltipMetric="sector_concentration"
            description={
              snapshot.max_sector_weight >= 55
                ? `${snapshot.max_sector_name} dominates. Sector-wide headwinds will have outsized impact.`
                : snapshot.max_sector_weight >= 35
                ? `${snapshot.max_sector_name} is the heaviest sector — within watchable range.`
                : 'Sector allocation looks balanced.'
            }
          />

          <RiskMetricItem
            label="HHI (Concentration Index)"
            value={snapshot.hhi.toFixed(4)}
            status={hhiStatus(snapshot.hhi)}
            tooltipMetric="hhi"
            description={
              snapshot.hhi >= 0.25
                ? 'Highly concentrated. The equivalent of just a few equal-weight positions.'
                : snapshot.hhi >= 0.12
                ? 'Moderate concentration. Room to spread further.'
                : 'Well diversified by position weights.'
            }
          />

          <RiskMetricItem
            label="Effective N"
            value={`${snapshot.effective_n.toFixed(1)} positions`}
            status={
              snapshot.effective_n >= 7 ? 'good'
              : snapshot.effective_n >= 4 ? 'warning'
              : 'danger'
            }
            tooltipMetric="effective_n"
            description={`Despite ${snapshot.num_holdings} holdings, capital is distributed as if in ${snapshot.effective_n.toFixed(1)} equal positions.`}
          />
        </div>

        {/* Flags */}
        {(snapshot.single_stock_flag || snapshot.sector_concentration_flag) && (
          <div className="flex flex-wrap gap-2 pt-3 border-t border-slate-100">
            {snapshot.single_stock_flag && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                Single-stock flag: a position exceeds 30%
              </span>
            )}
            {snapshot.sector_concentration_flag && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-[11px] font-semibold text-orange-700">
                <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
                Sector flag: {snapshot.max_sector_name} exceeds 50%
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
