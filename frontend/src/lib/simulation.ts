/**
 * Portfolio Simulation Engine — lib/simulation.ts
 * -------------------------------------------------
 * Pure computation. Zero React, zero API calls, zero side effects.
 *
 * Core operations:
 *   buildScenario()             — construct a PortfolioScenario from holdings + fundamentals
 *   applyWeightChanges()        — update weights and recompute all derived metrics
 *   computeSimulatedSectors()   — rebuild SectorAllocation[] from simulated holdings
 *   normalizeWeights()          — scale weights so they sum exactly to 100
 *   computeScenarioDelta()      — before/after diff for every tracked metric
 *   generateRebalanceSuggestions() — rule-based suggestions with estimated impact
 *
 * Weight model:
 *   totalValue is fixed (from the base portfolio) — it is the unit of account.
 *   Each holding's market_value = (weight / 100) × totalValue.
 *   Sector weights are re-derived from summed market_values.
 *   Weights are in percent (0–100), NOT decimals.
 */

import type {
  Holding,
  SectorAllocation,
  FinancialRatio,
  WeightedFundamentals,
  RiskSnapshot,
  WatchlistItem,
} from '@/types'
import { computeRiskSnapshot }     from '@/lib/risk'
import { computeWeightedMetrics }  from '@/lib/fundamentals'

// ─── Core simulation types ────────────────────────────────────────────────────

/** Action tag for a position in the simulated portfolio */
export type SimulationAction = 'hold' | 'add' | 'modified' | 'remove'

/** A single position inside a simulated portfolio */
export interface SimulatedHolding {
  ticker:          string
  name:            string
  sector:          string
  weight:          number              // % — can be edited by user
  market_value:    number              // weight/100 × totalValue (derived)
  action:          SimulationAction
  original_weight: number             // weight before simulation (0 if newly added)
  fundamentals:    FinancialRatio | null
}

/** A fully-computed portfolio snapshot — used for both Current and Simulated states */
export interface PortfolioScenario {
  label:            'Current' | 'Simulated'
  holdings:         SimulatedHolding[]
  sectors:          SectorAllocation[]
  riskSnapshot:     RiskSnapshot | null
  weightedMetrics:  WeightedFundamentals | null
  totalWeight:      number             // Σ weights — ideally 100
  totalValue:       number             // fixed reference total
}

/** Per-metric before/after comparison */
export interface MetricDelta<T> {
  current:    T
  simulated:  T
  delta:      T extends number ? number : never
  improved:   boolean
}

/** Full before/after comparison between two scenarios */
export interface ScenarioDelta {
  hhi:                   { current: number; simulated: number; delta: number; improved: boolean }
  diversification_score: { current: number; simulated: number; delta: number; improved: boolean }
  risk_profile:          { current: string; simulated: string; changed: boolean; improved: boolean }
  max_holding_weight:    { current: number; simulated: number; delta: number; improved: boolean }
  max_sector_weight:     { current: number; simulated: number; delta: number; improved: boolean }
  num_sectors:           { current: number; simulated: number; delta: number; improved: boolean }
  num_holdings:          { current: number; simulated: number; delta: number }
  wtd_pe:                { current: number | null; simulated: number | null; delta: number | null }
  wtd_roe:               { current: number | null; simulated: number | null; delta: number | null; improved: boolean }
  wtd_div_yield:         { current: number | null; simulated: number | null; delta: number | null; improved: boolean }
}

/** A concrete rebalancing action suggestion with estimated impact */
export interface RebalanceSuggestion {
  id:              string
  type:            'trim' | 'add_from_watchlist' | 'remove' | 'rebalance'
  ticker?:         string
  sector?:         string
  title:           string
  rationale:       string
  suggestedWeight?: number     // target weight after action (%)
  currentWeight?:  number      // current weight (%)
  priority:        'high' | 'medium' | 'low'
  impact: {
    hhi_delta:       number    // negative = improvement
    div_score_delta: number    // positive = improvement
  }
}

// ─── Formatting helpers (internal) ───────────────────────────────────────────

const shortTicker = (t: string) => t.replace(/\.(NS|BSE|BO)$/i, '')

// ─── Sector recomputation ─────────────────────────────────────────────────────

/**
 * Rebuilds SectorAllocation[] from a list of simulated holdings.
 * Holdings with action === 'remove' are excluded.
 */
export function computeSimulatedSectors(
  holdings: SimulatedHolding[],
): SectorAllocation[] {
  const active = holdings.filter((h) => h.action !== 'remove')
  const totalValue = active.reduce((s, h) => s + h.market_value, 0)
  if (totalValue === 0) return []

  const sectorMap = new Map<string, { value: number; count: number }>()
  for (const h of active) {
    const sector = h.sector || 'Other'
    const existing = sectorMap.get(sector) ?? { value: 0, count: 0 }
    sectorMap.set(sector, { value: existing.value + h.market_value, count: existing.count + 1 })
  }

  return Array.from(sectorMap.entries())
    .map(([sector, { value, count }]) => ({
      sector,
      value,
      weight_pct: (value / totalValue) * 100,
      num_holdings: count,
    }))
    .sort((a, b) => b.weight_pct - a.weight_pct)
}

// ─── Scenario builder ─────────────────────────────────────────────────────────

/**
 * Converts SimulatedHolding[] into the Holding-compatible shapes needed by
 * computeRiskSnapshot and computeWeightedMetrics.
 */
function toRiskHoldings(holdings: SimulatedHolding[]): Holding[] {
  return holdings
    .filter((h) => h.action !== 'remove')
    .map((h) => ({
      id:            undefined,
      ticker:        h.ticker,
      name:          h.name,
      quantity:      1,                 // not used in risk computation
      average_cost:  0,
      current_price: h.market_value,
      sector:        h.sector,
      market_value:  h.market_value,
      weight:        h.weight,
    }))
}

/**
 * Builds a fully-computed PortfolioScenario from a holdings list.
 * Call this whenever the simulated weights change.
 */
export function buildScenario(
  label:      'Current' | 'Simulated',
  holdings:   SimulatedHolding[],
  totalValue: number,
): PortfolioScenario {
  const active   = holdings.filter((h) => h.action !== 'remove')
  const sectors  = computeSimulatedSectors(holdings)
  const totalWeight = active.reduce((s, h) => s + h.weight, 0)

  // Risk snapshot — uses Holding-compatible shape
  const riskHoldings = toRiskHoldings(holdings)
  const riskSnapshot = computeRiskSnapshot(riskHoldings, sectors, null)

  // Weighted metrics — computeWeightedMetrics uses market_value + fundamentals
  const enrichedHoldings = active.map((h) => ({
    ...h,
    id:           undefined as undefined,
    quantity:     1,
    average_cost: 0,
    current_price: h.market_value,
  }))
  const weightedMetrics = computeWeightedMetrics(enrichedHoldings)

  return {
    label,
    holdings,
    sectors,
    riskSnapshot,
    weightedMetrics,
    totalWeight,
    totalValue,
  }
}

// ─── Weight utilities ─────────────────────────────────────────────────────────

/**
 * Creates the initial SimulatedHolding[] from the base portfolio holdings.
 * Fundamentals are passed in via a Map keyed by ticker.
 */
export function initSimulatedHoldings(
  holdings:    Holding[],
  ratioMap:    Map<string, FinancialRatio>,
  totalValue:  number,
): SimulatedHolding[] {
  return holdings.map((h) => ({
    ticker:          h.ticker,
    name:            h.name,
    sector:          h.sector ?? 'Other',
    weight:          h.weight ?? 0,
    market_value:    h.market_value ?? (h.weight ?? 0) / 100 * totalValue,
    action:          'hold' as SimulationAction,
    original_weight: h.weight ?? 0,
    fundamentals:    ratioMap.get(h.ticker) ?? null,
  }))
}

/**
 * Updates a single holding's weight and recomputes its market_value.
 * Returns a new array (immutable).
 */
export function setHoldingWeight(
  holdings:   SimulatedHolding[],
  ticker:     string,
  weight:     number,
  totalValue: number,
): SimulatedHolding[] {
  return holdings.map((h) => {
    if (h.ticker !== ticker) return h
    const clamped = Math.max(0, Math.min(100, weight))
    return {
      ...h,
      weight:       clamped,
      market_value: (clamped / 100) * totalValue,
      action:       h.original_weight === 0 ? 'add'
                    : Math.abs(clamped - h.original_weight) < 0.01 ? 'hold'
                    : 'modified',
    }
  })
}

/**
 * Scales all non-removed holding weights so they sum to exactly 100.
 * Preserves relative proportions.
 */
export function normalizeWeights(
  holdings:   SimulatedHolding[],
  totalValue: number,
): SimulatedHolding[] {
  const active = holdings.filter((h) => h.action !== 'remove')
  const sum    = active.reduce((s, h) => s + h.weight, 0)
  if (sum === 0) return holdings

  const scale = 100 / sum
  return holdings.map((h) => {
    if (h.action === 'remove') return h
    const newWeight = Math.round(h.weight * scale * 100) / 100
    return {
      ...h,
      weight:       newWeight,
      market_value: (newWeight / 100) * totalValue,
      action:       h.original_weight === 0 ? 'add'
                    : Math.abs(newWeight - h.original_weight) < 0.01 ? 'hold'
                    : 'modified',
    }
  })
}

/**
 * Adds a new holding to the simulated portfolio.
 * Defaults to a 5% weight; recalculates market_value from that.
 */
export function addHolding(
  holdings:      SimulatedHolding[],
  newHolding:    Omit<SimulatedHolding, 'action' | 'original_weight' | 'market_value'>,
  totalValue:    number,
): SimulatedHolding[] {
  // Don't add if already present
  if (holdings.some((h) => h.ticker === newHolding.ticker)) return holdings
  const weight = newHolding.weight > 0 ? newHolding.weight : 5
  const added: SimulatedHolding = {
    ...newHolding,
    weight,
    market_value:    (weight / 100) * totalValue,
    action:          'add',
    original_weight: 0,
  }
  return [...holdings, added]
}

/**
 * Marks a holding for removal (action = 'remove', weight = 0).
 * This keeps it visible in the UI as a "will be removed" row.
 */
export function markRemoved(
  holdings:   SimulatedHolding[],
  ticker:     string,
  totalValue: number,
): SimulatedHolding[] {
  return holdings.map((h) => {
    if (h.ticker !== ticker) return h
    return {
      ...h,
      weight:       0,
      market_value: 0,
      action:       'remove' as SimulationAction,
    }
  })
}

/**
 * Undoes a removal (restores original weight for a removed holding).
 */
export function undoRemove(
  holdings:   SimulatedHolding[],
  ticker:     string,
  totalValue: number,
): SimulatedHolding[] {
  return holdings.map((h) => {
    if (h.ticker !== ticker || h.action !== 'remove') return h
    const w = h.original_weight > 0 ? h.original_weight : 5
    return {
      ...h,
      weight:       w,
      market_value: (w / 100) * totalValue,
      action:       'hold' as SimulationAction,
    }
  })
}

// ─── Scenario delta ───────────────────────────────────────────────────────────

/** Risk profile ordinal for "better/worse" comparison */
const PROFILE_ORDER: Record<string, number> = {
  highly_concentrated: 0,
  sector_concentrated: 1,
  aggressive:          2,
  moderate:            3,
  conservative:        4,
}

/**
 * Computes a full before/after metric diff between two scenarios.
 */
export function computeScenarioDelta(
  base: PortfolioScenario,
  sim:  PortfolioScenario,
): ScenarioDelta {
  const b = base.riskSnapshot
  const s = sim.riskSnapshot
  const bm = base.weightedMetrics
  const sm = sim.weightedMetrics

  const hhi_b = b?.hhi ?? 0
  const hhi_s = s?.hhi ?? 0

  const ds_b = b?.diversification_score ?? 0
  const ds_s = s?.diversification_score ?? 0

  const profile_b = b?.risk_profile ?? 'moderate'
  const profile_s = s?.risk_profile ?? 'moderate'

  const pe_b = bm?.wtd_pe ?? null
  const pe_s = sm?.wtd_pe ?? null

  const roe_b = bm?.wtd_roe ?? null
  const roe_s = sm?.wtd_roe ?? null

  const dy_b = bm?.wtd_div_yield ?? null
  const dy_s = sm?.wtd_div_yield ?? null

  return {
    hhi: {
      current:   hhi_b,
      simulated: hhi_s,
      delta:     hhi_s - hhi_b,
      improved:  hhi_s < hhi_b,
    },
    diversification_score: {
      current:   ds_b,
      simulated: ds_s,
      delta:     ds_s - ds_b,
      improved:  ds_s > ds_b,
    },
    risk_profile: {
      current:  profile_b,
      simulated: profile_s,
      changed:  profile_b !== profile_s,
      improved: (PROFILE_ORDER[profile_s] ?? 3) > (PROFILE_ORDER[profile_b] ?? 3),
    },
    max_holding_weight: {
      current:   b?.max_holding_weight ?? 0,
      simulated: s?.max_holding_weight ?? 0,
      delta:     (s?.max_holding_weight ?? 0) - (b?.max_holding_weight ?? 0),
      improved:  (s?.max_holding_weight ?? 0) < (b?.max_holding_weight ?? 0),
    },
    max_sector_weight: {
      current:   b?.max_sector_weight ?? 0,
      simulated: s?.max_sector_weight ?? 0,
      delta:     (s?.max_sector_weight ?? 0) - (b?.max_sector_weight ?? 0),
      improved:  (s?.max_sector_weight ?? 0) < (b?.max_sector_weight ?? 0),
    },
    num_sectors: {
      current:   b?.num_sectors ?? 0,
      simulated: s?.num_sectors ?? 0,
      delta:     (s?.num_sectors ?? 0) - (b?.num_sectors ?? 0),
      improved:  (s?.num_sectors ?? 0) > (b?.num_sectors ?? 0),
    },
    num_holdings: {
      current:  b?.num_holdings ?? 0,
      simulated: s?.num_holdings ?? 0,
      delta:    (s?.num_holdings ?? 0) - (b?.num_holdings ?? 0),
    },
    wtd_pe: {
      current:   pe_b,
      simulated: pe_s,
      delta:     pe_b !== null && pe_s !== null ? pe_s - pe_b : null,
    },
    wtd_roe: {
      current:   roe_b,
      simulated: roe_s,
      delta:     roe_b !== null && roe_s !== null ? roe_s - roe_b : null,
      improved:  roe_s !== null && roe_b !== null ? roe_s > roe_b : false,
    },
    wtd_div_yield: {
      current:   dy_b,
      simulated: dy_s,
      delta:     dy_b !== null && dy_s !== null ? dy_s - dy_b : null,
      improved:  dy_s !== null && dy_b !== null ? dy_s > dy_b : false,
    },
  }
}

// ─── Rebalance suggestions ─────────────────────────────────────────────────────

/**
 * Generates rule-based rebalance suggestions from the current simulated scenario.
 * Each suggestion carries an estimated impact on HHI and diversification score.
 */
export function generateRebalanceSuggestions(
  baseScenario:  PortfolioScenario,
  watchlistItems: WatchlistItem[],
): RebalanceSuggestion[] {
  const suggestions: RebalanceSuggestion[] = []
  const { holdings, riskSnapshot, sectors } = baseScenario

  const active = holdings.filter((h) => h.action !== 'remove')
  const holdingTickers = new Set(active.map((h) => h.ticker.toUpperCase()))
  const sectorNames    = new Set(sectors.map((s) => s.sector.toLowerCase()))

  // ── 1. Trim over-weight single stock ──────────────────────────────────────
  const overWeight = active.filter((h) => h.weight >= 25)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 2)

  for (const h of overWeight) {
    const targetWeight = 20
    const weightReduced = h.weight - targetWeight
    // Approximate HHI improvement: removing (w/100)^2 + adding (target/100)^2
    const hhi_delta = Math.pow(targetWeight / 100, 2) - Math.pow(h.weight / 100, 2)

    suggestions.push({
      id:              `trim-${h.ticker}`,
      type:            'trim',
      ticker:          h.ticker,
      title:           `Trim ${shortTicker(h.ticker)} from ${h.weight.toFixed(1)}% to ~${targetWeight}%`,
      rationale:       `${h.name} represents ${h.weight.toFixed(1)}% of the portfolio. Reducing to ${targetWeight}% would lower single-stock risk while keeping meaningful exposure.`,
      suggestedWeight: targetWeight,
      currentWeight:   h.weight,
      priority:        h.weight >= 35 ? 'high' : 'medium',
      impact: {
        hhi_delta,
        div_score_delta: Math.round(Math.abs(hhi_delta) * 70 * 100) / 100,
      },
    })
  }

  // ── 2. Rebalance top-3 concentration ──────────────────────────────────────
  const top3Weight = riskSnapshot?.top3_weight ?? 0
  if (top3Weight >= 60 && overWeight.length === 0) {
    const top3  = [...active].sort((a, b) => b.weight - a.weight).slice(0, 3)
    const target = Math.min(top3[0].weight * 0.8, 25)
    suggestions.push({
      id:       'rebalance-top3',
      type:     'rebalance',
      title:    `Rebalance top 3 holdings (${top3Weight.toFixed(1)}% combined)`,
      rationale: `Your top 3 positions — ${top3.map((h) => shortTicker(h.ticker)).join(', ')} — drive ${top3Weight.toFixed(1)}% of portfolio movements. Distributing some weight to other holdings would smooth returns.`,
      priority: 'medium',
      impact:   { hhi_delta: -0.03, div_score_delta: 5 },
    })
  }

  // ── 3. Add diversifying sector ────────────────────────────────────────────
  const MAJOR_SECTOR_KEYWORDS = [
    ['pharma', 'health'],
    ['fmcg', 'consumer'],
    ['telecom'],
    ['infra', 'construction'],
    ['auto', 'vehicle'],
  ]
  const missingSectors = MAJOR_SECTOR_KEYWORDS.filter(
    (kws) => !kws.some((kw) => Array.from(sectorNames).some((s) => s.includes(kw)))
  )

  if (missingSectors.length > 0 && riskSnapshot && riskSnapshot.num_sectors < 6) {
    // Check if any watchlist item covers a missing sector
    const diversifyingWl = watchlistItems.filter((wi) => {
      if (holdingTickers.has(wi.ticker.toUpperCase())) return false
      const sector = (wi.sector ?? '').toLowerCase()
      return missingSectors.some((kws) => kws.some((kw) => sector.includes(kw)))
    })

    if (diversifyingWl.length > 0) {
      const pick = diversifyingWl[0]
      suggestions.push({
        id:       `add-watchlist-${pick.ticker}`,
        type:     'add_from_watchlist',
        ticker:   pick.ticker,
        sector:   pick.sector ?? undefined,
        title:    `Add ${shortTicker(pick.ticker)} to expand sector coverage`,
        rationale: `${pick.name ?? pick.ticker} is on your watchlist and would add exposure to a sector not currently in your portfolio, improving diversification.`,
        suggestedWeight: 5,
        priority: 'medium',
        impact:   { hhi_delta: -0.005, div_score_delta: 7 },
      })
    } else {
      suggestions.push({
        id:       'add-new-sector',
        type:     'add_from_watchlist',
        title:    `Add a stock from an unrepresented sector`,
        rationale: `Your portfolio lacks exposure to ${missingSectors.slice(0, 2).map((kws) => kws[0]).join(' and ')}. Adding even a small position in one of these sectors would improve HHI and reduce correlated risk.`,
        priority: 'low',
        impact:   { hhi_delta: -0.005, div_score_delta: 7 },
      })
    }
  }

  // ── 4. Consider removing weak ROE holding ─────────────────────────────────
  const weakROE = active.filter(
    (h) => h.fundamentals?.roe !== null && (h.fundamentals?.roe ?? 0) < 8 && h.weight < 15
  )
  if (weakROE.length > 0) {
    const pick = weakROE[0]
    suggestions.push({
      id:           `review-${pick.ticker}`,
      type:         'remove',
      ticker:       pick.ticker,
      title:        `Review ${shortTicker(pick.ticker)} — weak ROE (${(pick.fundamentals?.roe ?? 0).toFixed(1)}%)`,
      rationale:    `${pick.name} has a low return on equity of ${(pick.fundamentals?.roe ?? 0).toFixed(1)}% and represents ${pick.weight.toFixed(1)}% of the portfolio. Consider whether the capital could be better deployed elsewhere.`,
      currentWeight: pick.weight,
      priority:     'low',
      impact:       { hhi_delta: -Math.pow(pick.weight / 100, 2), div_score_delta: 1 },
    })
  }

  return suggestions
}
