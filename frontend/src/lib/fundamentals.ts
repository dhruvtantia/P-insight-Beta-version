/**
 * lib/fundamentals.ts — Pure computation for fundamentals & valuation analytics
 * -------------------------------------------------------------------------------
 * No React imports. Zero side effects. Fully testable.
 *
 * Exports:
 *   mergeWithFundamentals()     — joins holdings with per-ticker ratio data
 *   computeWeightedMetrics()    — weighted-average fundamentals across portfolio
 *   metricStatus()              — traffic-light status for individual metric values
 *   formatMetricValue()         — display formatting for ratio values
 */

import type { Holding, FinancialRatio, HoldingWithFundamentals, WeightedFundamentals } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

export type MetricStatus = 'good' | 'warning' | 'danger' | 'neutral'

export interface MetricStatusConfig {
  status: MetricStatus
  label: string     // e.g. "Attractive", "Fair", "Expensive"
}

// ─── Merge holdings with fundamentals ────────────────────────────────────────

/**
 * Joins holdings array with per-ticker fundamental ratios.
 * Holdings without a matching ratio entry get fundamentals: null.
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

// ─── Weighted portfolio metrics ───────────────────────────────────────────────

/**
 * Computes portfolio-level weighted-average fundamentals.
 *
 * Weighting strategy:
 *   - Each holding's weight = market_value / total_portfolio_value
 *   - If a holding has null for a metric, it is excluded from that metric's average
 *   - Weights are re-normalised among non-null contributors so nulls don't bias toward zero
 *   - coverage[key] = number of holdings that contributed a non-null value
 *
 * Bank holdings (HDFC, ICICI, etc.) naturally have null for D/E, operating_margin,
 * ev_ebitda — this is correct behaviour, not missing data.
 */
export function computeWeightedMetrics(
  holdings: HoldingWithFundamentals[]
): WeightedFundamentals | null {
  // Need at least one holding with both market_value and fundamentals
  const valid = holdings.filter(
    (h) => (h.market_value ?? 0) > 0 && h.fundamentals !== null
  )
  if (valid.length === 0) return null

  const totalValue = valid.reduce((sum, h) => sum + (h.market_value ?? 0), 0)
  if (totalValue === 0) return null

  // Helper: compute weighted average for a given metric extractor
  function wtdAvg(
    extractor: (f: FinancialRatio) => number | null
  ): { value: number | null; count: number } {
    let weightedSum = 0
    let weightSum = 0
    let count = 0

    for (const h of valid) {
      const val = extractor(h.fundamentals!)
      if (val === null || !isFinite(val)) continue
      const w = (h.market_value ?? 0) / totalValue
      weightedSum += w * val
      weightSum += w
      count++
    }

    if (count === 0 || weightSum === 0) return { value: null, count: 0 }
    // Re-normalise to account for excluded nulls
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

// ─── Metric status (traffic-light) ───────────────────────────────────────────

/**
 * Returns a traffic-light status + label for a given metric value.
 * Thresholds are broad, representative of Indian large-cap equities.
 */
export function peStatus(value: number | null): MetricStatusConfig {
  if (value === null) return { status: 'neutral', label: 'N/A' }
  if (value < 15)     return { status: 'good',    label: 'Cheap'      }
  if (value < 30)     return { status: 'neutral',  label: 'Fair'       }
  if (value < 50)     return { status: 'warning',  label: 'Elevated'   }
  return               { status: 'danger',  label: 'Expensive'  }
}

export function pegStatus(value: number | null): MetricStatusConfig {
  if (value === null) return { status: 'neutral', label: 'N/A'         }
  if (value < 1.0)    return { status: 'good',    label: 'Undervalued' }
  if (value < 2.0)    return { status: 'neutral',  label: 'Fair'        }
  if (value < 3.0)    return { status: 'warning',  label: 'Premium'     }
  return               { status: 'danger',  label: 'Expensive'   }
}

export function pbStatus(value: number | null): MetricStatusConfig {
  if (value === null) return { status: 'neutral', label: 'N/A'       }
  if (value < 1.0)    return { status: 'good',    label: 'Below Book' }
  if (value < 4.0)    return { status: 'neutral',  label: 'Fair'      }
  if (value < 10.0)   return { status: 'warning',  label: 'Premium'   }
  return               { status: 'danger',  label: 'High'      }
}

export function roeStatus(value: number | null): MetricStatusConfig {
  if (value === null) return { status: 'neutral', label: 'N/A'       }
  if (value >= 25)    return { status: 'good',    label: 'Excellent'  }
  if (value >= 15)    return { status: 'good',    label: 'Good'       }
  if (value >= 8)     return { status: 'warning',  label: 'Moderate'  }
  return               { status: 'danger',  label: 'Weak'      }
}

export function roaStatus(value: number | null): MetricStatusConfig {
  if (value === null) return { status: 'neutral', label: 'N/A'      }
  if (value >= 15)    return { status: 'good',    label: 'Excellent' }
  if (value >= 8)     return { status: 'good',    label: 'Good'      }
  if (value >= 3)     return { status: 'warning',  label: 'Moderate' }
  return               { status: 'danger',  label: 'Weak'     }
}

export function marginStatus(value: number | null): MetricStatusConfig {
  if (value === null) return { status: 'neutral', label: 'N/A'      }
  if (value >= 20)    return { status: 'good',    label: 'Strong'    }
  if (value >= 10)    return { status: 'neutral',  label: 'Moderate' }
  if (value >= 5)     return { status: 'warning',  label: 'Thin'     }
  return               { status: 'danger',  label: 'Very Thin' }
}

export function growthStatus(value: number | null): MetricStatusConfig {
  if (value === null) return { status: 'neutral', label: 'N/A'      }
  if (value >= 20)    return { status: 'good',    label: 'High'      }
  if (value >= 8)     return { status: 'good',    label: 'Healthy'   }
  if (value >= 0)     return { status: 'warning',  label: 'Slow'     }
  return               { status: 'danger',  label: 'Declining' }
}

export function dteStatus(value: number | null): MetricStatusConfig {
  if (value === null) return { status: 'neutral', label: 'N/A'         }
  if (value <= 0.5)   return { status: 'good',    label: 'Conservative' }
  if (value <= 1.5)   return { status: 'neutral',  label: 'Moderate'    }
  if (value <= 2.5)   return { status: 'warning',  label: 'Leveraged'   }
  return               { status: 'danger',  label: 'High Debt'    }
}

export function divYieldStatus(value: number | null): MetricStatusConfig {
  if (value === null) return { status: 'neutral', label: 'N/A'       }
  if (value >= 3.0)   return { status: 'good',    label: 'High Yield' }
  if (value >= 1.0)   return { status: 'neutral',  label: 'Moderate'  }
  return               { status: 'neutral',  label: 'Low'       }
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
