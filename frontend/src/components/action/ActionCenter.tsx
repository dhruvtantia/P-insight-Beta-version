/**
 * ActionCenter
 * -------------
 * Unified surface that aggregates next-best-actions from multiple data sources
 * and presents them as a scrollable list of ActionCards on the dashboard.
 *
 * Actions are generated client-side from:
 *   - Portfolio state (no snapshot yet, upload pending, etc.)
 *   - Data mode (mock mode reminder)
 *   - Portfolio content (concentrated positions, missing data)
 *
 * This is Phase 5 scaffolding — the action list will grow in future phases
 * as more signals (advisor, optimizer, broker sync) come online.
 */

'use client'

import React, { useMemo } from 'react'
import { Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ActionCard } from './ActionCard'
import { usePortfolioStore } from '@/store/portfolioStore'
import { useDataModeStore } from '@/store/dataModeStore'
import type { Action, ActionType, ActionCategory } from '@/types'
import type { Holding, PortfolioSummary } from '@/types'

interface ActionCenterProps {
  holdings?:   Holding[]
  summary?:    PortfolioSummary | null
  /** max actions to display (default 5) */
  maxItems?:   number
  compact?:    boolean
  className?:  string
}

// ─── Action generators ────────────────────────────────────────────────────────

function makeAction(
  id: string,
  type: ActionType,
  category: ActionCategory,
  title: string,
  description: string,
  priority: number,
  opts?: { href?: string; cta?: string }
): Action {
  return { id, type, category, title, description, priority, dismissible: true, ...opts }
}

function generateActions(params: {
  portfolios:         ReturnType<typeof usePortfolioStore.getState>['portfolios']
  activePortfolioId:  number | null
  loaded:             boolean
  mode:               string
  holdings:           Holding[]
  summary:            PortfolioSummary | null
}): Action[] {
  const { portfolios, activePortfolioId, loaded, mode, holdings, summary } = params
  const actions: Action[] = []

  // 1. No portfolio yet — suggest upload
  if (loaded && portfolios.length === 0) {
    actions.push(makeAction(
      'no-portfolio',
      'warning',
      'upload',
      'Upload your portfolio',
      'No portfolio found. Import your holdings via CSV or Excel to unlock all analytics.',
      1,
      { href: '/upload', cta: 'Upload now' }
    ))
  }

  // 2. Mock mode reminder
  if (mode === 'mock') {
    actions.push(makeAction(
      'mock-mode',
      'info',
      'portfolio',
      'Using demo data',
      'You\'re viewing mock portfolio data. Upload your own holdings to see real insights.',
      10,
      { href: '/upload', cta: 'Switch to real data' }
    ))
  }

  // 3. Active portfolio has no snapshot
  if (activePortfolioId !== null) {
    const activeP = portfolios.find((p) => p.id === activePortfolioId)
    if (activeP && activeP.source !== 'mock') {
      // Suggest snapshot if portfolio has holdings
      if (holdings.length > 0) {
        actions.push(makeAction(
          'take-snapshot',
          'suggestion',
          'snapshot',
          'Take a portfolio snapshot',
          'Capture today\'s state to build your portfolio history and track changes over time.',
          5,
          { href: '/portfolios', cta: 'Go to Portfolios' }
        ))
      }
    }
  }

  // 4. Concentration risk — single position > 25%
  const overweightHoldings = holdings.filter((h) => (h.weight ?? 0) > 25)
  if (overweightHoldings.length > 0) {
    const names = overweightHoldings.map((h) => h.ticker).join(', ')
    actions.push(makeAction(
      'concentration-risk',
      'warning',
      'portfolio',
      `Concentration risk: ${names}`,
      `${overweightHoldings.length > 1 ? 'These positions' : names} account${overweightHoldings.length === 1 ? 's' : ''} for over 25% of your portfolio. Consider rebalancing.`,
      2,
      { href: '/optimize', cta: 'Run optimizer' }
    ))
  }

  // 5. Negative P&L > 10%
  const bigLosers = holdings.filter(
    (h) => h.current_price !== null && h.pnl_pct !== undefined && (h.pnl_pct ?? 0) < -10
  )
  if (bigLosers.length > 0) {
    actions.push(makeAction(
      'big-losers',
      'warning',
      'portfolio',
      `${bigLosers.length} holding${bigLosers.length > 1 ? 's' : ''} down >10%`,
      `${bigLosers.map((h) => h.ticker).join(', ')} — review your position thesis or set stop-loss targets.`,
      3,
      { href: '/dashboard', cta: 'Review holdings' }
    ))
  }

  // 6. If quant page not visited yet
  if (holdings.length > 0 && summary) {
    actions.push(makeAction(
      'run-quant',
      'suggestion',
      'optimizer',
      'Run quantitative analysis',
      'Get Sharpe ratio, drawdown analysis, correlation matrix, and factor contribution for your portfolio.',
      8,
      { href: '/quant', cta: 'Open Quant' }
    ))
  }

  // Sort by priority (ascending — lower number = more urgent)
  return actions.sort((a, b) => a.priority - b.priority)
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ActionCenter({
  holdings   = [],
  summary    = null,
  maxItems   = 5,
  compact    = false,
  className,
}: ActionCenterProps): React.ReactElement {
  const { portfolios, activePortfolioId, loaded } = usePortfolioStore()
  const { mode } = useDataModeStore()

  const actions = useMemo(() => generateActions({
    portfolios,
    activePortfolioId,
    loaded,
    mode,
    holdings,
    summary,
  }), [portfolios, activePortfolioId, loaded, mode, holdings, summary])

  const displayed = actions.slice(0, maxItems)

  if (displayed.length === 0) return <></>

  return (
    <section className={cn('space-y-2', className)}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <Zap className="h-4 w-4 text-indigo-500" />
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          Action Center
        </h2>
        <span className="ml-auto text-xs text-slate-400">
          {displayed.length} item{displayed.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Action list */}
      <div className="space-y-2">
        {displayed.map((action) => (
          <ActionCard
            key={action.id}
            action={action}
            compact={compact}
          />
        ))}
      </div>

      {actions.length > maxItems && (
        <p className="text-xs text-slate-400 text-center pt-1">
          +{actions.length - maxItems} more action{actions.length - maxItems !== 1 ? 's' : ''}
        </p>
      )}
    </section>
  )
}
