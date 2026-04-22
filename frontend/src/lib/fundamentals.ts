/**
 * lib/fundamentals.ts — Pure computation for fundamentals & valuation analytics
 * -------------------------------------------------------------------------------
 * No React imports. Zero side effects. Fully testable.
 *
 * Exports:
 *   mergeWithFundamentals()     — joins holdings with per-ticker ratio data
 *   DEFAULT_THRESHOLDS          — fallback thresholds (mirrors backend defaults)
 *   peStatus() / pbStatus() … — traffic-light status (accept thresholds from backend)
 *   formatMetricValue()         — display formatting for ratio values
 *
 * Threshold design:
 *   The canonical threshold values live in:
 *     backend/app/services/fundamentals_view_service.py
 *   They are shipped to the frontend in every /analytics/ratios response
 *   under `thresholds`. All status functions accept a `FundamentalsThresholds`
 *   parameter — callers should pass the backend-provided thresholds.
 *   `DEFAULT_THRESHOLDS` is a compile-time fallback used only before the API
 *   response has loaded; it mirrors the backend defaults exactly.
 *
 * Removed in Fundamentals Isolation (Phase):
 *   computeWeightedMetrics() — was dead code; weighted metrics are backend-owned
 *                              and returned in the /analytics/ratios `weighted` field.
 */

import type { Holding, FinancialRatio, HoldingWithFundamentals, WeightedFundamentals, FundamentalsThresholds } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

export type MetricStatus = 'good' | 'warning' | 'danger' | 'neutral'

export interface MetricStatusConfig {
  status: MetricStatus
  label: string     // e.g. "Attractive", "Fair", "Expensive"
}

// ─── Default thresholds (compile-time fallback only) ─────────────────────────
//
// These values MUST stay in sync with the Python constants in:
//   backend/app/services/fundamentals_view_service.py
//
// They are used ONLY as a fallback before the API response has loaded.
// All live rendering should use the backend-provided `thresholds` from
// useFundamentals() → FinancialRatiosResponse.thresholds.

export const DEFAULT_THRESHOLDS: FundamentalsThresholds = {
  // P/E
  pe_cheap:        15,
  pe_fair_max:     30,
  pe_elevated_max: 50,
  // PEG
  peg_undervalued: 1.0,
  peg_fair_max:    2.0,
  peg_premium_max: 3.0,
  // P/B
  pb_below_book:  1.0,
  pb_fair_max:    4.0,
  pb_premium_max: 10.0,
  // ROE (%)
  roe_excellent: 25,
  roe_good:      15,
  roe_moderate:  8,
  // ROA (%)
  roa_excellent: 15,
  roa_good:      8,
  roa_moderate:  3,
  // Margin (%)
  margin_strong:   20,
  margin_moderate: 10,
  margin_thin:     5,
  // Growth (%)
  growth_high:    20,
  growth_healthy: 8,
  growth_slow:    0,
  // D/E
  dte_conservative: 0.5,
  dte_moderate:     1.5,
  dte_leveraged:    2.5,
  // Div yield (%)
  div_yield_high:     3.0,
  div_yield_moderate: 1.0,
  // Insight-level thresholds
  insight_pe_expensive:    30,
  insight_pe_cheap:        18,
  insight_peg_expensive:   2,
  insight_roe_strong:      20,
  insight_roe_weak:        12,
  insight_margin_thin:     10,
  insight_div_yield_solid: 2,
  insight_div_yield_low:   0.5,
}

// ─── Simulation-only: client-side weighted metrics computation ────────────────
//
// @deprecated for real portfolio display — the backend owns weighted metrics and
//   returns them in the /analytics/ratios `weighted` field. Do not call this in
//   page components or hooks that display the live portfolio.
//
// PRESERVED for lib/simulation.ts — the simulation engine computes weighted
//   metrics for HYPOTHETICAL portfolios (what-if scenarios) that cannot be
//   serviced by the backend API. This is a legitimate client-side use case.
//
// If you are calling this outside of simulation logic, stop and use
//   useFundamentals().weightedMetrics instead.

export function computeWeightedMetrics(
  holdings: HoldingWithFundamentals[]
): WeightedFundamentals | null {
  const valid = holdings.filter(
    (h) => (h.market_value ?? 0) > 0 && h.fundamentals !== null
  )
  if (valid.length === 0) return null

  const totalValue = valid.reduce((sum, h) => sum + (h.market_value ?? 0), 0)
  if (totalValue === 0) return null

  function wtdAvg(extractor: (f: FinancialRatio) => number | null): { value: number | null; count: number } {
    let weightedSum = 0
    let weightSum   = 0
    let count       = 0
    for (const h of valid) {
      const val = extractor(h.fundamentals!)
      if (val === null || !isFinite(val)) continue
      const w = (h.market_value ?? 0) / totalValue
      weightedSum += w * val
      weightSum   += w
      count++
    }
    if (count === 0 || weightSum === 0) return { value: null, count: 0 }
    return { value: weightedSum / weightSum, count }
  }

  const pe         = wtdAvg((f) => f.pe_ratio)
  const fwd_pe     = wtdAvg((f) => f.forward_pe)
  const pb         = wtdAvg((f) => f.pb_ratio)
  const ev_ebitda  = wtdAvg((f) => f.ev_ebitda)
  const peg        = wtdAvg((f) => f.peg_ratio)
  const div_yield  = wtdAvg((f) => f.dividend_yield)
  const roe        = wtdAvg((f) => f.roe)
  const roa        = wtdAvg((f) => f.roa)
  const op_margin  = wtdAvg((f) => f.operating_margin)
  const pr_margin  = wtdAvg((f) => f.profit_margin)
  const rev_growth = wtdAvg((f) => f.revenue_growth)
  const ear_growth = wtdAvg((f) => f.earnings_growth)
  const dte        = wtdAvg((f) => f.debt_to_equity)

  return {
    wtd_pe:               pe.value,
    wtd_forward_pe:       fwd_pe.value,
    wtd_pb:               pb.value,
    wtd_ev_ebitda:        ev_ebitda.value,
    wtd_peg:              peg.value,
    wtd_div_yield:        div_yield.value,
    wtd_roe:              roe.value,
    wtd_roa:              roa.value,
    wtd_operating_margin: op_margin.value,
    wtd_profit_margin:    pr_margin.value,
    wtd_revenue_growth:   rev_growth.value,
    wtd_earnings_growth:  ear_growth.value,
    wtd_debt_to_equity:   dte.value,
    coverage: {
      pe:               pe.count,
      forward_pe:       fwd_pe.count,
      pb:               pb.count,
      ev_ebitda:        ev_ebitda.count,
      peg:              peg.count,
      div_yield:        div_yield.count,
      roe:              roe.count,
      roa:              roa.count,
      operating_margin: op_margin.count,
      profit_margin:    pr_margin.count,
      revenue_growth:   rev_growth.count,
      earnings_growth:  ear_growth.count,
      debt_to_equity:   dte.count,
    },
  }
}

// ─── Merge holdings with fundamentals ────────────────────────────────────────

/**
 * Joins holdings array with per-ticker fundamental ratios.
 * Holdings without a matching ratio entry get fundamentals: null.
 * This is a pure client-side join — no financial computation.
 */
export function mergeWithFundamentals(
  holdings: Holding[],
  ratios: FinancialRatio[]
): HoldingWithFundamentals[] {
  const ratioMap = new Map(ratios.map((r) => [r.ticker, r]))
  return holdings.map((h) => ({
    ...h,
    fundamentals: ratioMap.get(h.ticker) ?? null,
  }))
}

// ─── Metric status (traffic-light) ───────────────────────────────────────────
//
// Each function accepts an optional `t: FundamentalsThresholds` parameter.
// When the backend thresholds have loaded, callers pass them here.
// Before they load, DEFAULT_THRESHOLDS is used as a fallback.

/** P/E ratio traffic-light. */
export function peStatus(
  value: number | null,
  t: FundamentalsThresholds = DEFAULT_THRESHOLDS
): MetricStatusConfig {
  if (value === null) return { status: 'neutral', label: 'N/A' }
  if (value < t.pe_cheap)        return { status: 'good',    label: 'Cheap'     }
  if (value < t.pe_fair_max)     return { status: 'neutral', label: 'Fair'      }
  if (value < t.pe_elevated_max) return { status: 'warning', label: 'Elevated'  }
  return                                { status: 'danger',  label: 'Expensive' }
}

/** PEG ratio traffic-light. */
export function pegStatus(
  value: number | null,
  t: FundamentalsThresholds = DEFAULT_THRESHOLDS
): MetricStatusConfig {
  if (value === null)        return { status: 'neutral', label: 'N/A'         }
  if (value < t.peg_undervalued) return { status: 'good',    label: 'Undervalued' }
  if (value < t.peg_fair_max)    return { status: 'neutral', label: 'Fair'        }
  if (value < t.peg_premium_max) return { status: 'warning', label: 'Premium'     }
  return                                 { status: 'danger',  label: 'Expensive'   }
}

/** P/B ratio traffic-light. */
export function pbStatus(
  value: number | null,
  t: FundamentalsThresholds = DEFAULT_THRESHOLDS
): MetricStatusConfig {
  if (value === null)        return { status: 'neutral', label: 'N/A'        }
  if (value < t.pb_below_book)   return { status: 'good',    label: 'Below Book' }
  if (value < t.pb_fair_max)     return { status: 'neutral', label: 'Fair'       }
  if (value < t.pb_premium_max)  return { status: 'warning', label: 'Premium'    }
  return                                 { status: 'danger',  label: 'High'       }
}

/** ROE traffic-light. */
export function roeStatus(
  value: number | null,
  t: FundamentalsThresholds = DEFAULT_THRESHOLDS
): MetricStatusConfig {
  if (value === null)      return { status: 'neutral', label: 'N/A'      }
  if (value >= t.roe_excellent) return { status: 'good',    label: 'Excellent' }
  if (value >= t.roe_good)      return { status: 'good',    label: 'Good'      }
  if (value >= t.roe_moderate)  return { status: 'warning', label: 'Moderate'  }
  return                               { status: 'danger',  label: 'Weak'      }
}

/** ROA traffic-light. */
export function roaStatus(
  value: number | null,
  t: FundamentalsThresholds = DEFAULT_THRESHOLDS
): MetricStatusConfig {
  if (value === null)      return { status: 'neutral', label: 'N/A'      }
  if (value >= t.roa_excellent) return { status: 'good',    label: 'Excellent' }
  if (value >= t.roa_good)      return { status: 'good',    label: 'Good'      }
  if (value >= t.roa_moderate)  return { status: 'warning', label: 'Moderate'  }
  return                               { status: 'danger',  label: 'Weak'      }
}

/** Operating / net margin traffic-light. */
export function marginStatus(
  value: number | null,
  t: FundamentalsThresholds = DEFAULT_THRESHOLDS
): MetricStatusConfig {
  if (value === null)       return { status: 'neutral', label: 'N/A'      }
  if (value >= t.margin_strong)   return { status: 'good',    label: 'Strong'    }
  if (value >= t.margin_moderate) return { status: 'neutral', label: 'Moderate'  }
  if (value >= t.margin_thin)     return { status: 'warning', label: 'Thin'      }
  return                                 { status: 'danger',  label: 'Very Thin' }
}

/** Revenue / earnings growth traffic-light. */
export function growthStatus(
  value: number | null,
  t: FundamentalsThresholds = DEFAULT_THRESHOLDS
): MetricStatusConfig {
  if (value === null)       return { status: 'neutral', label: 'N/A'       }
  if (value >= t.growth_high)     return { status: 'good',    label: 'High'      }
  if (value >= t.growth_healthy)  return { status: 'good',    label: 'Healthy'   }
  if (value >= t.growth_slow)     return { status: 'warning', label: 'Slow'      }
  return                                 { status: 'danger',  label: 'Declining' }
}

/** Debt/Equity ratio traffic-light. */
export function dteStatus(
  value: number | null,
  t: FundamentalsThresholds = DEFAULT_THRESHOLDS
): MetricStatusConfig {
  if (value === null)          return { status: 'neutral', label: 'N/A'          }
  if (value <= t.dte_conservative) return { status: 'good',    label: 'Conservative' }
  if (value <= t.dte_moderate)     return { status: 'neutral', label: 'Moderate'     }
  if (value <= t.dte_leveraged)    return { status: 'warning', label: 'Leveraged'    }
  return                                  { status: 'danger',  label: 'High Debt'    }
}

/** Dividend yield traffic-light. */
export function divYieldStatus(
  value: number | null,
  t: FundamentalsThresholds = DEFAULT_THRESHOLDS
): MetricStatusConfig {
  if (value === null)         return { status: 'neutral', label: 'N/A'       }
  if (value >= t.div_yield_high)    return { status: 'good',    label: 'High Yield' }
  if (value >= t.div_yield_moderate) return { status: 'neutral', label: 'Moderate'  }
  return                                   { status: 'neutral', label: 'Low'        }
}

// ─── Metric formatting ────────────────────────────────────────────────────────

/**
 * Format a ratio value for display.
 * Returns "—" for null/undefined.
 */
export function fmtRatio(value: number | null | undefined, decimals = 1): string {
  if (value === null || value === undefined) return '—'
  return value.toFixed(decimals) + '×'
}

export function fmtPct(value: number | null | undefined, decimals = 1): string {
  if (value === null || value === undefined) return '—'
  return value.toFixed(decimals) + '%'
}

export function fmtX(value: number | null | undefined, decimals = 1): string {
  if (value === null || value === undefined) return '—'
  return value.toFixed(decimals) + '×'
}

export function fmtMarketCap(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  if (value >= 1_000_000_000_000) {
    return '₹' + (value / 1_000_000_000_000).toFixed(1) + 'T'
  }
  if (value >= 10_000_000_000) {
    // Express in crores (1 crore = 10M)
    return '₹' + Math.round(value / 10_000_000).toLocaleString('en-IN') + ' Cr'
  }
  return '₹' + Math.round(value).toLocaleString('en-IN')
}

// ─── Status CSS helpers ───────────────────────────────────────────────────────

export const STATUS_TEXT: Record<MetricStatus, string> = {
  good:    'text-emerald-600',
  warning: 'text-amber-600',
  danger:  'text-red-600',
  neutral: 'text-slate-500',
}

export const STATUS_BG: Record<MetricStatus, string> = {
  good:    'bg-emerald-50 border-emerald-200',
  warning: 'bg-amber-50 border-amber-200',
  danger:  'bg-red-50 border-red-200',
  neutral: 'bg-slate-50 border-slate-200',
}

export const STATUS_DOT: Record<MetricStatus, string> = {
  good:    'bg-emerald-500',
  warning: 'bg-amber-500',
  danger:  'bg-red-500',
  neutral: 'bg-slate-300',
}
