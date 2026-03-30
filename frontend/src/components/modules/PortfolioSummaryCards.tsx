/**
 * PortfolioSummaryCards
 * ----------------------
 * Four KPI cards rendered at the top of the dashboard.
 * Receives pre-computed data from usePortfolio — does zero computation itself.
 *
 * Cards:
 *   1. Total Invested   — cost basis (qty × avg cost)
 *   2. Current Value    — market value (qty × current price)
 *   3. Unrealised P&L   — absolute gain/loss in ₹
 *   4. Return %         — percentage return since cost
 *
 * Loading: shows animated skeleton cards.
 * Null summary: cards render with em-dashes.
 */

'use client'

import { TrendingUp, TrendingDown, Wallet, BarChart2, IndianRupee, Percent } from 'lucide-react'
import { TooltipHelp } from '@/components/common/TooltipHelp'
import { formatCurrency, formatPct } from '@/constants'
import { cn } from '@/lib/utils'
import type { PortfolioSummary } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface PortfolioSummaryCardsProps {
  summary: PortfolioSummary | null
  loading?: boolean
}

interface CardConfig {
  title: string
  value: string
  subtitle: string
  positive: boolean | null       // null = neutral (no colour applied)
  Icon: React.ElementType
  iconBg: string
  iconColor: string
  tooltipMetric?: string
  tooltipText?: string
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SummaryCardSkeleton() {
  return (
    <div className="card p-5 animate-pulse">
      <div className="flex items-start justify-between mb-4">
        <div className="h-3 w-28 rounded bg-slate-200" />
        <div className="h-7 w-7 rounded-lg bg-slate-100" />
      </div>
      <div className="h-8 w-36 rounded bg-slate-200 mb-2" />
      <div className="h-3 w-24 rounded bg-slate-100" />
    </div>
  )
}

// ─── Single Card ──────────────────────────────────────────────────────────────

function SummaryCard({
  title,
  value,
  subtitle,
  positive,
  Icon,
  iconBg,
  iconColor,
  tooltipMetric,
  tooltipText,
}: CardConfig) {
  const subtitleColor =
    positive === true  ? 'text-emerald-600' :
    positive === false ? 'text-red-500'     :
                         'text-slate-500'

  return (
    <div className="card p-5 hover:shadow-md transition-shadow duration-200">
      {/* Header row */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <p className="text-xs font-medium text-slate-500 leading-none">{title}</p>
          {(tooltipMetric || tooltipText) && (
            <TooltipHelp metric={tooltipMetric} text={tooltipText} position="top" />
          )}
        </div>
        <div className={cn('flex h-8 w-8 items-center justify-center rounded-lg shrink-0', iconBg)}>
          <Icon className={cn('h-4 w-4', iconColor)} />
        </div>
      </div>

      {/* Value */}
      <p className="text-2xl font-bold text-slate-900 tracking-tight tabular-nums leading-none">
        {value}
      </p>

      {/* Subtitle */}
      <p className={cn('mt-1.5 text-xs font-medium leading-none', subtitleColor)}>
        {subtitle}
      </p>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function PortfolioSummaryCards({ summary, loading = false }: PortfolioSummaryCardsProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => <SummaryCardSkeleton key={i} />)}
      </div>
    )
  }

  const pnlPositive = summary ? summary.total_pnl >= 0 : null
  const PnLIcon = pnlPositive === false ? TrendingDown : TrendingUp

  const cards: CardConfig[] = [
    {
      title:     'Total Invested',
      value:     summary ? formatCurrency(summary.total_cost) : '—',
      subtitle:  summary ? `${summary.num_holdings} holdings · cost basis` : 'No data',
      positive:  null,
      Icon:      Wallet,
      iconBg:    'bg-slate-100',
      iconColor: 'text-slate-600',
      tooltipText: 'The total amount you have invested — calculated as the sum of (quantity × average cost) for each holding.',
    },
    {
      title:     'Current Value',
      value:     summary ? formatCurrency(summary.total_value) : '—',
      subtitle:  summary
        ? `${summary.total_value >= summary.total_cost ? '▲' : '▼'} vs ₹${Math.round(summary.total_cost / 100000)}L invested`
        : 'No data',
      positive:  summary ? summary.total_value >= summary.total_cost : null,
      Icon:      IndianRupee,
      iconBg:    'bg-indigo-50',
      iconColor: 'text-indigo-600',
      tooltipText: 'The current market value of all your holdings — calculated as (quantity × current price) for each holding.',
    },
    {
      title:     'Unrealised P&L',
      value:     summary ? formatCurrency(summary.total_pnl) : '—',
      subtitle:  summary
        ? `${pnlPositive ? '▲ Profit' : '▼ Loss'} of ${Math.abs(summary.total_pnl / summary.total_cost * 100).toFixed(1)}% on invested capital`
        : 'No data',
      positive:  pnlPositive,
      Icon:      PnLIcon,
      iconBg:    pnlPositive === false ? 'bg-red-50' : 'bg-emerald-50',
      iconColor: pnlPositive === false ? 'text-red-500' : 'text-emerald-600',
      tooltipText: 'Profit or loss compared to your cost basis. Unrealised means these gains/losses exist on paper and are not yet booked.',
    },
    {
      title:     'Return %',
      value:     summary ? formatPct(summary.total_pnl_pct) : '—',
      subtitle:  summary
        ? `Absolute return since first purchase`
        : 'No data',
      positive:  pnlPositive,
      Icon:      Percent,
      iconBg:    pnlPositive === false ? 'bg-red-50' : 'bg-emerald-50',
      iconColor: pnlPositive === false ? 'text-red-500' : 'text-emerald-600',
      tooltipText: 'Total percentage return on your portfolio since purchase — (Current Value − Total Invested) ÷ Total Invested × 100.',
    },
  ]

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {cards.map((card) => (
        <SummaryCard key={card.title} {...card} />
      ))}
    </div>
  )
}
