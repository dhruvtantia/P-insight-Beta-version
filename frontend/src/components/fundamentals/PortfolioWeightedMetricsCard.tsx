'use client'

/**
 * PortfolioWeightedMetricsCard — portfolio-level weighted-average fundamentals
 * ------------------------------------------------------------------------------
 * Grouped sections: Valuation / Quality / Growth / Income & Leverage
 * Status dots + interpretation labels on every metric.
 * Null displayed as "—" with "coverage X/N holdings" footnote.
 */

import { TooltipHelp }  from '@/components/common/TooltipHelp'
import {
  peStatus, pegStatus, pbStatus, roeStatus, roaStatus,
  marginStatus, growthStatus, dteStatus, divYieldStatus,
  fmtX, fmtRatio, fmtPct, fmtMarketCap,
  STATUS_DOT, STATUS_TEXT,
  DEFAULT_THRESHOLDS,
  type MetricStatus,
} from '@/lib/fundamentals'
import type { WeightedFundamentals, FundamentalsThresholds } from '@/types'
import { cn } from '@/lib/utils'

// ─── Section + metric definitions ────────────────────────────────────────────

interface MetricDef {
  label:   string
  tooltip: string
  value:   number | null
  format:  (v: number | null) => string
  status:  { status: MetricStatus; label: string }
  coverage?: number
}

interface SectionDef {
  title:   string
  color:   string
  metrics: MetricDef[]
}

function buildSections(
  w: WeightedFundamentals,
  totalHoldings: number,
  t: FundamentalsThresholds,
): SectionDef[] {
  const c = w.coverage
  const n = totalHoldings

  return [
    {
      title: 'Valuation',
      color: 'text-indigo-700 border-indigo-200 bg-indigo-50',
      metrics: [
        {
          label: 'Wtd. P/E',         tooltip: 'wtd_pe',
          value: w.wtd_pe,           format: fmtX,
          status: peStatus(w.wtd_pe, t),
          coverage: c.pe,
        },
        {
          label: 'Wtd. Fwd P/E',     tooltip: 'forward_pe',
          value: w.wtd_forward_pe,   format: fmtX,
          status: peStatus(w.wtd_forward_pe, t),
          coverage: c.forward_pe,
        },
        {
          label: 'Wtd. P/B',         tooltip: 'pb_ratio',
          value: w.wtd_pb,           format: fmtX,
          status: pbStatus(w.wtd_pb, t),
          coverage: c.pb,
        },
        {
          label: 'Wtd. EV/EBITDA',   tooltip: 'ev_ebitda',
          value: w.wtd_ev_ebitda,    format: fmtX,
          status: { status: 'neutral' as MetricStatus, label: '' },
          coverage: c.ev_ebitda,
        },
        {
          label: 'Wtd. PEG',         tooltip: 'peg_ratio',
          value: w.wtd_peg,          format: fmtRatio,
          status: pegStatus(w.wtd_peg, t),
          coverage: c.peg,
        },
      ],
    },
    {
      title: 'Quality',
      color: 'text-teal-700 border-teal-200 bg-teal-50',
      metrics: [
        {
          label: 'Wtd. ROE',             tooltip: 'wtd_roe',
          value: w.wtd_roe,              format: fmtPct,
          status: roeStatus(w.wtd_roe, t),
          coverage: c.roe,
        },
        {
          label: 'Wtd. ROA',             tooltip: 'roa',
          value: w.wtd_roa,              format: fmtPct,
          status: roaStatus(w.wtd_roa, t),
          coverage: c.roa,
        },
        {
          label: 'Wtd. Op. Margin',      tooltip: 'wtd_operating_margin',
          value: w.wtd_operating_margin, format: fmtPct,
          status: marginStatus(w.wtd_operating_margin, t),
          coverage: c.operating_margin,
        },
        {
          label: 'Wtd. Net Margin',      tooltip: 'profit_margin',
          value: w.wtd_profit_margin,    format: fmtPct,
          status: marginStatus(w.wtd_profit_margin, t),
          coverage: c.profit_margin,
        },
      ],
    },
    {
      title: 'Growth',
      color: 'text-emerald-700 border-emerald-200 bg-emerald-50',
      metrics: [
        {
          label: 'Wtd. Rev. Growth',    tooltip: 'revenue_growth',
          value: w.wtd_revenue_growth,  format: fmtPct,
          status: growthStatus(w.wtd_revenue_growth, t),
          coverage: c.revenue_growth,
        },
        {
          label: 'Wtd. EPS Growth',     tooltip: 'earnings_growth',
          value: w.wtd_earnings_growth, format: fmtPct,
          status: growthStatus(w.wtd_earnings_growth, t),
          coverage: c.earnings_growth,
        },
      ],
    },
    {
      title: 'Income & Leverage',
      color: 'text-amber-700 border-amber-200 bg-amber-50',
      metrics: [
        {
          label: 'Wtd. Div. Yield',   tooltip: 'wtd_div_yield',
          value: w.wtd_div_yield,     format: fmtPct,
          status: divYieldStatus(w.wtd_div_yield, t),
          coverage: c.div_yield,
        },
        {
          label: 'Wtd. D/E Ratio',    tooltip: 'debt_to_equity',
          value: w.wtd_debt_to_equity, format: fmtRatio,
          status: dteStatus(w.wtd_debt_to_equity, t),
          coverage: c.debt_to_equity,
        },
      ],
    },
  ]
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  weightedMetrics: WeightedFundamentals | null
  totalHoldings:   number
  loading?:        boolean
  /** Backend-provided threshold constants. Falls back to DEFAULT_THRESHOLDS if not provided. */
  thresholds?:     FundamentalsThresholds | null
}

export function PortfolioWeightedMetricsCard({
  weightedMetrics,
  totalHoldings,
  loading = false,
  thresholds,
}: Props) {
  if (loading) {
    return (
      <div className="card p-5 space-y-4 animate-pulse">
        <div className="h-4 w-52 rounded bg-slate-200" />
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
              <div className="h-3 w-20 rounded bg-slate-200 mb-2" />
              <div className="h-5 w-12 rounded bg-slate-100" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (!weightedMetrics) return null

  const sections = buildSections(weightedMetrics, totalHoldings, thresholds ?? DEFAULT_THRESHOLDS)

  return (
    <div className="card overflow-hidden">
      <div className="flex items-start justify-between px-5 py-4 border-b border-slate-100">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Portfolio-Level Fundamentals</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Weighted averages by portfolio value. Re-normalised among holdings with non-null values.
          </p>
        </div>
        <TooltipHelp metric="wtd_pe" position="left" />
      </div>

      <div className="p-5 space-y-5">
        {sections.map((section) => (
          <div key={section.title}>
            {/* Section title */}
            <div className="flex items-center gap-2 mb-3">
              <span
                className={cn(
                  'rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                  section.color
                )}
              >
                {section.title}
              </span>
            </div>

            {/* Metric tiles */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {section.metrics.map((m) => {
                const isNull = m.value === null
                const { status, label: statusLabel } = m.status

                return (
                  <div
                    key={m.label}
                    className="rounded-lg border border-slate-100 bg-white p-3 hover:border-slate-200 transition-colors"
                  >
                    <div className="flex items-center gap-1 mb-1.5">
                      <p className="text-[11px] font-medium text-slate-500 truncate">{m.label}</p>
                      <TooltipHelp metric={m.tooltip} position="top" />
                    </div>

                    <div className="flex items-end justify-between gap-1">
                      <p
                        className={cn(
                          'text-xl font-bold',
                          isNull ? 'text-slate-200' : STATUS_TEXT[status] ?? 'text-slate-800'
                        )}
                      >
                        {m.format(m.value)}
                      </p>
                      {!isNull && statusLabel && (
                        <span
                          className={cn(
                            'text-[9px] font-semibold uppercase tracking-wide shrink-0 mb-0.5',
                            STATUS_TEXT[status] ?? 'text-slate-400'
                          )}
                        >
                          {statusLabel}
                        </span>
                      )}
                    </div>

                    {/* Coverage footnote */}
                    {m.coverage !== undefined && (
                      <p className="text-[9px] text-slate-300 mt-1">
                        {isNull ? 'No data' : `${m.coverage}/${totalHoldings} holdings`}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50">
        <p className="text-[10px] text-slate-400">
          Metrics where all contributing holdings have null values show as —.
          Banks (HDFC, ICICI etc.) are correctly excluded from D/E, EV/EBITDA, and margin calculations.
        </p>
      </div>
    </div>
  )
}
