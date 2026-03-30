/**
 * Risk Computation Library
 * -------------------------
 * Pure functions — zero React, zero UI, zero API calls.
 * All metrics are derived from holdings[] and sectors[] already in usePortfolio().
 *
 * FORMULAS
 * ────────────────────────────────────────────────────────────────────────────
 * HHI (Herfindahl–Hirschman Index):
 *   HHI = Σ (weight_i / 100)²
 *   Range: 1/N (perfectly equal) → 1.0 (all in one holding)
 *   Thresholds: < 0.12 = well diversified | 0.12–0.25 = moderate | > 0.25 = concentrated
 *
 * Effective N:
 *   effective_n = 1 / HHI
 *   Interpretation: equivalent number of equal-weight positions
 *
 * Diversification Score (0–100):
 *   Component A — weight balance (70 pts):
 *     hhi_best  = 1/N  (perfectly equal weights, N = num holdings)
 *     hhi_score = max(0, (1 - HHI) / (1 - hhi_best)) × 70
 *   Component B — sector breadth (30 pts):
 *     sector_score = min(30, (num_sectors - 1) × 7.5)
 *   Total = round(hhi_score + sector_score), clamped to [0, 100]
 *
 * RISK PROFILE (evaluated in priority order)
 * ────────────────────────────────────────────────────────────────────────────
 * 1. highly_concentrated — max holding ≥ 40% OR HHI ≥ 0.30
 * 2. sector_concentrated — max sector weight ≥ 60%
 * 3. aggressive          — top-3 combined ≥ 60% OR num_sectors ≤ 2
 * 4. conservative        — num_sectors ≥ 5 AND HHI ≤ 0.12
 * 5. moderate            — default
 */

import type { Holding, SectorAllocation, PortfolioSummary, RiskSnapshot, RiskProfile } from '@/types'

// ─── Status threshold helpers ─────────────────────────────────────────────────

export type RiskStatus = 'good' | 'warning' | 'danger' | 'neutral'

/** Return a traffic-light status for a given metric value. */
export function holdingWeightStatus(weight: number): RiskStatus {
  if (weight >= 35) return 'danger'
  if (weight >= 20) return 'warning'
  return 'good'
}

export function top3WeightStatus(weight: number): RiskStatus {
  if (weight >= 60) return 'danger'
  if (weight >= 45) return 'warning'
  return 'good'
}

export function sectorWeightStatus(weight: number): RiskStatus {
  if (weight >= 55) return 'danger'
  if (weight >= 35) return 'warning'
  return 'good'
}

export function hhiStatus(hhi: number): RiskStatus {
  if (hhi >= 0.25) return 'danger'
  if (hhi >= 0.12) return 'warning'
  return 'good'
}

export function diversificationScoreStatus(score: number): RiskStatus {
  if (score >= 65) return 'good'
  if (score >= 40) return 'warning'
  return 'danger'
}

// ─── Risk profile classification ──────────────────────────────────────────────

interface ProfileInput {
  max_holding_weight: number
  top3_weight: number
  max_sector_weight: number
  max_sector_name: string
  num_sectors: number
  hhi: number
  top_ticker: string
}

function classifyRiskProfile(p: ProfileInput): {
  profile: RiskProfile
  reason: string
} {
  // 1. Highly concentrated — single stock dominance OR very high HHI
  if (p.max_holding_weight >= 40 || p.hhi >= 0.30) {
    return {
      profile: 'highly_concentrated',
      reason: `${p.top_ticker} alone represents ${p.max_holding_weight.toFixed(1)}% of the portfolio. Single-stock concentration is very high — a sharp move in this stock heavily impacts overall returns.`,
    }
  }

  // 2. Sector concentrated — one industry dominates
  if (p.max_sector_weight >= 60) {
    return {
      profile: 'sector_concentrated',
      reason: `${p.max_sector_name} makes up ${p.max_sector_weight.toFixed(1)}% of the portfolio. This heavy sector tilt means the portfolio is exposed to industry-wide headwinds or regulatory changes.`,
    }
  }

  // 3. Aggressive — top 3 positions crowd out everything else, or very few sectors
  if (p.top3_weight >= 60 || p.num_sectors <= 2) {
    return {
      profile: 'aggressive',
      reason: `Top 3 holdings account for ${p.top3_weight.toFixed(1)}% of the portfolio across only ${p.num_sectors} sector${p.num_sectors === 1 ? '' : 's'}. Limited diversification amplifies both upside and downside.`,
    }
  }

  // 4. Conservative — broad sector spread with balanced weights
  if (p.num_sectors >= 5 && p.hhi <= 0.12) {
    return {
      profile: 'conservative',
      reason: `Portfolio is spread across ${p.num_sectors} sectors with balanced position sizes (HHI = ${p.hhi.toFixed(3)}). This is a well-diversified, lower-concentration profile.`,
    }
  }

  // 5. Moderate — everything else
  return {
    profile: 'moderate',
    reason: `Portfolio shows reasonable diversification across ${p.num_sectors} sector${p.num_sectors === 1 ? '' : 's'} with no single position dominating. Some concentration exists but within normal bounds.`,
  }
}

// ─── Main computation ─────────────────────────────────────────────────────────

/**
 * computeRiskSnapshot
 * --------------------
 * Derives all risk/concentration metrics from the three data arrays
 * already available from usePortfolio().
 *
 * Returns null when there are no holdings (e.g. loading state).
 */
export function computeRiskSnapshot(
  holdings: Holding[],
  sectors: SectorAllocation[],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _summary: PortfolioSummary | null,
): RiskSnapshot | null {
  if (holdings.length === 0) return null

  // ── Sort helpers ─────────────────────────────────────────────────────────
  const byWeightDesc = [...holdings].sort(
    (a, b) => (b.weight ?? 0) - (a.weight ?? 0)
  )
  const bySectorDesc = [...sectors].sort((a, b) => b.weight_pct - a.weight_pct)

  // ── Concentration metrics ─────────────────────────────────────────────────
  const max_holding_weight = byWeightDesc[0]?.weight ?? 0
  const top3_weight = byWeightDesc.slice(0, 3).reduce((s, h) => s + (h.weight ?? 0), 0)
  const top5_weight = byWeightDesc.slice(0, 5).reduce((s, h) => s + (h.weight ?? 0), 0)

  const max_sector_weight = bySectorDesc[0]?.weight_pct ?? 0
  const max_sector_name   = bySectorDesc[0]?.sector ?? 'Unknown'

  const num_holdings = holdings.length
  const num_sectors  = sectors.length

  // ── HHI — Σ (weight_i / 100)² ────────────────────────────────────────────
  const hhi = holdings.reduce(
    (sum, h) => sum + Math.pow((h.weight ?? 0) / 100, 2),
    0
  )

  // Clamp to valid range (floating point edge cases near 0 or 1)
  const hhi_clamped = Math.min(1, Math.max(0, hhi))

  // Effective N = 1 / HHI (i.e. equivalent equal-weight positions)
  const effective_n = hhi_clamped > 0 ? 1 / hhi_clamped : num_holdings

  // ── Diversification score (0–100) ─────────────────────────────────────────
  // Component A: weight balance (70 pts)
  //   Best possible HHI for this N = 1/N (equal weights)
  //   Score = how close we are to that ideal
  const hhi_ideal = num_holdings > 1 ? 1 / num_holdings : 1
  const hhi_range = 1 - hhi_ideal   // gap between worst (1.0) and best (1/N)
  const hhi_component =
    num_holdings > 1 && hhi_range > 0
      ? Math.max(0, ((1 - hhi_clamped) / hhi_range)) * 70
      : 0

  // Component B: sector breadth (30 pts) — full credit at 5+ sectors
  const sector_component = Math.min(30, Math.max(0, (num_sectors - 1) * 7.5))

  const diversification_score = Math.round(
    Math.min(100, Math.max(0, hhi_component + sector_component))
  )

  // ── Flags ─────────────────────────────────────────────────────────────────
  const single_stock_flag = max_holding_weight >= 30
  const sector_concentration_flag = max_sector_weight >= 50

  // ── Top holdings (for ConcentrationBreakdown) ─────────────────────────────
  const top_holdings_by_weight = byWeightDesc.slice(0, 8).map((h) => ({
    ticker: h.ticker,
    name: h.name,
    weight: h.weight ?? 0,
    sector: h.sector ?? 'Unknown',
  }))

  // ── Risk profile ──────────────────────────────────────────────────────────
  const top_ticker = byWeightDesc[0]?.ticker.replace(/\.(NS|BSE|BO)$/i, '') ?? 'Top holding'
  const { profile, reason } = classifyRiskProfile({
    max_holding_weight,
    top3_weight,
    max_sector_weight,
    max_sector_name,
    num_sectors,
    hhi: hhi_clamped,
    top_ticker,
  })

  return {
    max_holding_weight,
    top3_weight,
    top5_weight,
    max_sector_weight,
    max_sector_name,
    num_sectors,
    num_holdings,
    hhi: hhi_clamped,
    effective_n,
    diversification_score,
    risk_profile: profile,
    risk_profile_reason: reason,
    single_stock_flag,
    sector_concentration_flag,
    top_holdings_by_weight,
  }
}
