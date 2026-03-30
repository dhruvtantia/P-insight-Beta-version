/**
 * Portfolio Insight Engine — lib/insights.ts
 * -------------------------------------------
 * Pure computation functions. Zero React imports, zero side effects.
 * All insights are rule-based — no AI / LLM required.
 *
 * Entry point:
 *   computePortfolioInsights(input) → PortfolioInsightItem[]
 *
 * Rules implemented (12 total across 6 categories):
 *   Concentration:   single-stock flag, sector overweight, top-3 weight
 *   Valuation:       wtd P/E vs market, PEG ratio signal
 *   Quality:         weighted ROE, profit-margin signal
 *   Income:          dividend yield assessment
 *   Diversification: sector count, diversification score
 *   Performance:     top gainer, top loser, largest position
 *   Watchlist:       high-conviction signals
 *
 * Phase 2 extension: add more sophisticated rules, target prices from watchlist,
 * live P/E vs sector averages, relative-strength signals.
 */

import type {
  Holding,
  SectorAllocation,
  WeightedFundamentals,
  RiskSnapshot,
  WatchlistItem,
} from '@/types'

// ─── Insight shape ────────────────────────────────────────────────────────────

export type InsightCategory =
  | 'concentration'
  | 'valuation'
  | 'quality'
  | 'income'
  | 'diversification'
  | 'performance'
  | 'watchlist'

export type InsightSeverity = 'critical' | 'warning' | 'info' | 'positive'

export interface PortfolioInsightItem {
  id:        string
  category:  InsightCategory
  severity:  InsightSeverity
  title:     string
  message:   string
  /** Optional key metric to call out prominently in the card */
  metric?:   { value: string; label: string }
  /** Optional CTA link */
  action?:   { label: string; href: string }
}

// ─── Input shape ──────────────────────────────────────────────────────────────

export interface InsightEngineInput {
  holdings:        Holding[]
  sectors:         SectorAllocation[]
  weightedMetrics: WeightedFundamentals | null
  riskSnapshot:    RiskSnapshot | null
  watchlistItems:  WatchlistItem[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (v: number | null, suffix = '', digits = 1): string =>
  v !== null ? `${v.toFixed(digits)}${suffix}` : 'N/A'

const fmtPct = (v: number | null) => fmt(v, '%')
const fmtMul = (v: number | null) => fmt(v, '×')

// ─── Rule functions ───────────────────────────────────────────────────────────

function concentrationRules(
  holdings: Holding[],
  sectors: SectorAllocation[],
  riskSnapshot: RiskSnapshot | null,
): PortfolioInsightItem[] {
  const items: PortfolioInsightItem[] = []

  // 1. Single-stock concentration
  const maxHolding = [...holdings].sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))[0]
  if (maxHolding && (maxHolding.weight ?? 0) >= 30) {
    items.push({
      id: 'concentration-single-stock',
      category: 'concentration',
      severity: (maxHolding.weight ?? 0) >= 40 ? 'critical' : 'warning',
      title: 'High Single-Stock Concentration',
      message: `${maxHolding.name} represents ${fmtPct(maxHolding.weight ?? null)} of your portfolio. A position this large amplifies both gains and losses from a single company.`,
      metric: { value: fmtPct(maxHolding.weight ?? null), label: maxHolding.ticker.replace(/\.(NS|BSE)$/i, '') },
      action: { label: 'Compare peers', href: `/peers?ticker=${maxHolding.ticker}` },
    })
  }

  // 2. Sector overweight (> 50%)
  const topSector = [...sectors].sort((a, b) => b.weight_pct - a.weight_pct)[0]
  if (topSector && topSector.weight_pct >= 50) {
    items.push({
      id: 'concentration-sector',
      category: 'concentration',
      severity: topSector.weight_pct >= 65 ? 'critical' : 'warning',
      title: `${topSector.sector} Sector Overweight`,
      message: `${topSector.weight_pct.toFixed(1)}% of your portfolio is in ${topSector.sector}. Sector-level events could have an outsized impact on your returns.`,
      metric: { value: fmtPct(topSector.weight_pct), label: topSector.sector },
    })
  }

  // 3. Top-3 holdings weight
  const top3Weight = riskSnapshot?.top3_weight ?? null
  if (top3Weight !== null && top3Weight >= 60) {
    items.push({
      id: 'concentration-top3',
      category: 'concentration',
      severity: 'info',
      title: 'Top 3 Holdings Drive Most Returns',
      message: `Your top 3 holdings account for ${fmtPct(top3Weight)} of portfolio value. Returns will be closely tied to these positions.`,
      metric: { value: fmtPct(top3Weight), label: 'Top 3 weight' },
      action: { label: 'View all holdings', href: '/holdings' },
    })
  }

  return items
}

function valuationRules(w: WeightedFundamentals | null): PortfolioInsightItem[] {
  const items: PortfolioInsightItem[] = []
  if (!w) return items

  // 4. P/E vs market benchmark (~20–22× for Nifty 50)
  if (w.wtd_pe !== null) {
    if (w.wtd_pe > 30) {
      items.push({
        id: 'valuation-pe-expensive',
        category: 'valuation',
        severity: 'warning',
        title: 'Portfolio Trading at Premium Valuation',
        message: `Weighted-average P/E of ${fmtMul(w.wtd_pe)} is above the Nifty 50 benchmark (~21×). Growth expectations are built into current prices — watch for earnings disappointments.`,
        metric: { value: fmtMul(w.wtd_pe), label: 'Wtd P/E' },
        action: { label: 'View fundamentals', href: '/fundamentals' },
      })
    } else if (w.wtd_pe <= 18) {
      items.push({
        id: 'valuation-pe-cheap',
        category: 'valuation',
        severity: 'positive',
        title: 'Portfolio Looks Attractively Valued',
        message: `Weighted-average P/E of ${fmtMul(w.wtd_pe)} is below the market average (~21×). The portfolio is priced at a relative discount if earnings estimates hold.`,
        metric: { value: fmtMul(w.wtd_pe), label: 'Wtd P/E' },
        action: { label: 'View fundamentals', href: '/fundamentals' },
      })
    }
  }

  // 5. PEG ratio signal
  if (w.wtd_peg !== null && w.wtd_peg > 2) {
    items.push({
      id: 'valuation-peg',
      category: 'valuation',
      severity: 'info',
      title: 'Growth Premium May Be Expensive',
      message: `Weighted PEG of ${fmtMul(w.wtd_peg)} suggests the portfolio's growth is priced in. A PEG above 2× means you're paying more per unit of expected growth.`,
      metric: { value: fmtMul(w.wtd_peg), label: 'Wtd PEG' },
    })
  }

  return items
}

function qualityRules(w: WeightedFundamentals | null): PortfolioInsightItem[] {
  const items: PortfolioInsightItem[] = []
  if (!w) return items

  // 6. ROE signal
  if (w.wtd_roe !== null) {
    if (w.wtd_roe >= 20) {
      items.push({
        id: 'quality-roe-strong',
        category: 'quality',
        severity: 'positive',
        title: 'Strong Portfolio Return on Equity',
        message: `Weighted-average ROE of ${fmtPct(w.wtd_roe)} indicates your holdings generate well above average returns on shareholders' capital. ROE > 20% is a hallmark of quality businesses.`,
        metric: { value: fmtPct(w.wtd_roe), label: 'Wtd ROE' },
      })
    } else if (w.wtd_roe < 12) {
      items.push({
        id: 'quality-roe-weak',
        category: 'quality',
        severity: 'warning',
        title: 'Below-Average Return on Equity',
        message: `Weighted ROE of ${fmtPct(w.wtd_roe)} is below the 15% threshold often used to identify quality businesses. Consider reviewing holdings for capital efficiency.`,
        metric: { value: fmtPct(w.wtd_roe), label: 'Wtd ROE' },
      })
    }
  }

  // 7. Profit margin
  if (w.wtd_profit_margin !== null && w.wtd_profit_margin < 10) {
    items.push({
      id: 'quality-margin',
      category: 'quality',
      severity: 'info',
      title: 'Thin Profit Margins Across Holdings',
      message: `Weighted net profit margin of ${fmtPct(w.wtd_profit_margin)} leaves limited buffer for cost pressures. Note: banks are excluded from this calculation as margins are not directly comparable.`,
      metric: { value: fmtPct(w.wtd_profit_margin), label: 'Wtd Net Margin' },
    })
  }

  return items
}

function incomeRules(w: WeightedFundamentals | null): PortfolioInsightItem[] {
  const items: PortfolioInsightItem[] = []
  if (!w || w.wtd_div_yield === null) return items

  if (w.wtd_div_yield >= 2) {
    items.push({
      id: 'income-yield-good',
      category: 'income',
      severity: 'positive',
      title: 'Solid Dividend Income',
      message: `Weighted dividend yield of ${fmtPct(w.wtd_div_yield)} provides meaningful income. This exceeds the Nifty 50's typical 1.3% yield and acts as a partial buffer during downturns.`,
      metric: { value: fmtPct(w.wtd_div_yield), label: 'Wtd Div Yield' },
    })
  } else if (w.wtd_div_yield < 0.5) {
    items.push({
      id: 'income-yield-low',
      category: 'income',
      severity: 'info',
      title: 'Low Dividend Contribution',
      message: `Weighted dividend yield of ${fmtPct(w.wtd_div_yield)} is minimal. Your portfolio is primarily growth-oriented. Income-seeking investors may want to add dividend payers to the watchlist.`,
      metric: { value: fmtPct(w.wtd_div_yield), label: 'Wtd Div Yield' },
      action: { label: 'View watchlist', href: '/watchlist' },
    })
  }

  return items
}

function diversificationRules(
  sectors: SectorAllocation[],
  riskSnapshot: RiskSnapshot | null,
): PortfolioInsightItem[] {
  const items: PortfolioInsightItem[] = []

  const numSectors = sectors.length
  const divScore   = riskSnapshot?.diversification_score ?? null
  const hhi        = riskSnapshot?.hhi ?? null

  // 8. Well-diversified signal
  if (numSectors >= 5 && hhi !== null && hhi < 0.15) {
    items.push({
      id: 'diversification-good',
      category: 'diversification',
      severity: 'positive',
      title: 'Well-Diversified Portfolio',
      message: `${numSectors} sectors with an HHI of ${hhi.toFixed(3)} indicates good diversification. No single position or sector dominates your risk exposure.`,
      metric: { value: divScore !== null ? divScore.toFixed(0) : '—', label: 'Div. Score' },
    })
  }

  // 9. Low sector count
  if (numSectors < 4) {
    items.push({
      id: 'diversification-low-sectors',
      category: 'diversification',
      severity: 'warning',
      title: 'Limited Sector Diversification',
      message: `Portfolio spans only ${numSectors} sector${numSectors === 1 ? '' : 's'}. Adding exposure to uncorrelated sectors (e.g., Consumer, Healthcare, Infrastructure) would reduce sector-specific risk.`,
      metric: { value: String(numSectors), label: 'Sectors' },
    })
  }

  return items
}

function performanceRules(holdings: Holding[]): PortfolioInsightItem[] {
  const items: PortfolioInsightItem[] = []
  if (holdings.length === 0) return items

  const withPnl = holdings.filter((h) => h.pnl_pct !== undefined && h.pnl_pct !== null)
  if (withPnl.length === 0) return items

  // 10. Top gainer
  const topGainer = [...withPnl].sort((a, b) => (b.pnl_pct ?? 0) - (a.pnl_pct ?? 0))[0]
  if ((topGainer.pnl_pct ?? 0) > 0) {
    items.push({
      id: 'performance-top-gainer',
      category: 'performance',
      severity: 'positive',
      title: 'Top Portfolio Gainer',
      message: `${topGainer.name} is your best performer with a ${fmtPct(topGainer.pnl_pct ?? null)} return. Consider reviewing whether to rebalance this position.`,
      metric: { value: fmtPct(topGainer.pnl_pct ?? null), label: topGainer.ticker.replace(/\.(NS|BSE)$/i, '') },
      action: { label: 'Compare peers', href: `/peers?ticker=${topGainer.ticker}` },
    })
  }

  // 11. Top loser (only if significantly negative)
  const topLoser = [...withPnl].sort((a, b) => (a.pnl_pct ?? 0) - (b.pnl_pct ?? 0))[0]
  if ((topLoser.pnl_pct ?? 0) < -10) {
    items.push({
      id: 'performance-top-loser',
      category: 'performance',
      severity: 'warning',
      title: 'Significant Underperformer',
      message: `${topLoser.name} is down ${fmtPct(Math.abs(topLoser.pnl_pct ?? 0))} from your average cost. Reviewing fundamentals and peer performance can help assess whether this is temporary or structural.`,
      metric: { value: fmtPct(topLoser.pnl_pct ?? null), label: topLoser.ticker.replace(/\.(NS|BSE)$/i, '') },
      action: { label: 'View fundamentals', href: '/fundamentals' },
    })
  }

  return items
}

function watchlistRules(
  watchlistItems: WatchlistItem[],
  holdings: Holding[],
): PortfolioInsightItem[] {
  const items: PortfolioInsightItem[] = []
  if (watchlistItems.length === 0) return items

  const holdingTickers = new Set(holdings.map((h) => h.ticker.toUpperCase()))

  // 12. High-conviction watchlist items not yet in portfolio
  const highConviction = watchlistItems.filter(
    (w) => w.tag === 'High Conviction' && !holdingTickers.has(w.ticker.toUpperCase())
  )
  if (highConviction.length > 0) {
    const tickers = highConviction.slice(0, 3).map((w) => w.ticker.replace(/\.(NS|BSE)$/i, '')).join(', ')
    items.push({
      id: 'watchlist-high-conviction',
      category: 'watchlist',
      severity: 'info',
      title: `${highConviction.length} High Conviction Watchlist Signal${highConviction.length > 1 ? 's' : ''}`,
      message: `You have stocks tagged "High Conviction" on your watchlist that are not yet in your portfolio: ${tickers}${highConviction.length > 3 ? ` and ${highConviction.length - 3} more` : ''}. Compare against current holdings using the peer tool.`,
      metric: { value: String(highConviction.length), label: 'Signals' },
      action: { label: 'View watchlist', href: '/watchlist' },
    })
  }

  // Watchlist items that have target prices and are in portfolio
  const portfolioWithTargets = watchlistItems.filter(
    (w) =>
      holdingTickers.has(w.ticker.toUpperCase()) &&
      w.target_price !== null &&
      w.target_price !== undefined
  )
  if (portfolioWithTargets.length > 0) {
    items.push({
      id: 'watchlist-target-price',
      category: 'watchlist',
      severity: 'info',
      title: `${portfolioWithTargets.length} Holding${portfolioWithTargets.length > 1 ? 's' : ''} with Watchlist Target Price`,
      message: `You have target prices set for ${portfolioWithTargets.map((w) => w.ticker.replace(/\.(NS|BSE)$/i, '')).join(', ')}. Compare current prices against your targets to review your thesis.`,
      action: { label: 'Open watchlist', href: '/watchlist' },
    })
  }

  return items
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function computePortfolioInsights(input: InsightEngineInput): PortfolioInsightItem[] {
  const { holdings, sectors, weightedMetrics, riskSnapshot, watchlistItems } = input

  if (holdings.length === 0) return []

  return [
    ...concentrationRules(holdings, sectors, riskSnapshot),
    ...valuationRules(weightedMetrics),
    ...qualityRules(weightedMetrics),
    ...incomeRules(weightedMetrics),
    ...diversificationRules(sectors, riskSnapshot),
    ...performanceRules(holdings),
    ...watchlistRules(watchlistItems, holdings),
  ]
}

// ─── Severity sort order (for display) ───────────────────────────────────────

const SEVERITY_ORDER: Record<InsightSeverity, number> = {
  critical: 0,
  warning:  1,
  info:     2,
  positive: 3,
}

export function sortInsightsBySeverity(insights: PortfolioInsightItem[]): PortfolioInsightItem[] {
  return [...insights].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
}
