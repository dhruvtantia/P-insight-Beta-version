'use client'

/**
 * PeerComparisonTable — full side-by-side fundamental comparison.
 *
 * Layout: metrics as rows, stocks as columns (standard "comp table" format).
 * The selected stock occupies the first data column and is highlighted.
 *
 * Rankings:
 *   When the backend ships pre-computed rankings (via the `rankings` prop),
 *   the component reads them directly. This is the canonical path — the
 *   backend owns the ranking logic and ships it with the response.
 *   The local `rankValues()` fallback is retained only for backward compat
 *   with any response that predates the Peers Isolation phase.
 *
 * Color coding (direction-aware):
 *   • For metrics where lower is better (P/E, P/B, EV/EBITDA, PEG, D/E):
 *       best value (lowest)  = green, worst = red
 *   • For metrics where higher is better (ROE, ROA, margins, growth, yield):
 *       best value (highest) = green, worst = red
 *   Null values are always shown as "—" with no color.
 *
 * Inline bar: each cell contains a thin proportional bar relative to the
 * column max so values can be scanned visually without reading numbers.
 *
 * Tooltip: metric names show METRIC_TOOLTIPS on hover via title attribute.
 */

import { useMemo }                        from 'react'
import { METRIC_TOOLTIPS }               from '@/constants'
import { cn }                            from '@/lib/utils'
import type { PeerStock, PeerRankings }  from '@/types'

// ─── Metric definitions ────────────────────────────────────────────────────────

type MetricKey = keyof PeerStock

interface MetricDef {
  key:           MetricKey
  label:         string
  group:         string
  suffix:        string
  lowerIsBetter: boolean
  fmt:           (v: number) => string
}

const pct = (v: number) => `${v.toFixed(1)}%`
const mul = (v: number) => `${v.toFixed(1)}×`

const METRICS: MetricDef[] = [
  // Valuation
  { key: 'pe_ratio',         label: 'P/E (Trailing)',   group: 'Valuation', suffix: '×', lowerIsBetter: true,  fmt: mul },
  { key: 'forward_pe',       label: 'Forward P/E',      group: 'Valuation', suffix: '×', lowerIsBetter: true,  fmt: mul },
  { key: 'pb_ratio',         label: 'P/B',              group: 'Valuation', suffix: '×', lowerIsBetter: true,  fmt: mul },
  { key: 'ev_ebitda',        label: 'EV/EBITDA',        group: 'Valuation', suffix: '×', lowerIsBetter: true,  fmt: mul },
  { key: 'peg_ratio',        label: 'PEG',              group: 'Valuation', suffix: '×', lowerIsBetter: true,  fmt: mul },
  // Quality
  { key: 'roe',              label: 'ROE',              group: 'Quality',   suffix: '%', lowerIsBetter: false, fmt: pct },
  { key: 'roa',              label: 'ROA',              group: 'Quality',   suffix: '%', lowerIsBetter: false, fmt: pct },
  { key: 'operating_margin', label: 'Operating Margin', group: 'Quality',   suffix: '%', lowerIsBetter: false, fmt: pct },
  { key: 'profit_margin',    label: 'Profit Margin',    group: 'Quality',   suffix: '%', lowerIsBetter: false, fmt: pct },
  // Growth
  { key: 'revenue_growth',   label: 'Revenue Growth',   group: 'Growth',    suffix: '%', lowerIsBetter: false, fmt: pct },
  { key: 'earnings_growth',  label: 'Earnings Growth',  group: 'Growth',    suffix: '%', lowerIsBetter: false, fmt: pct },
  // Income
  { key: 'dividend_yield',   label: 'Dividend Yield',   group: 'Income',    suffix: '%', lowerIsBetter: false, fmt: pct },
  // Leverage
  { key: 'debt_to_equity',   label: 'Debt / Equity',    group: 'Leverage',  suffix: '×', lowerIsBetter: true,  fmt: mul },
]

const GROUP_COLORS: Record<string, string> = {
  Valuation: 'bg-violet-50 text-violet-700',
  Quality:   'bg-sky-50 text-sky-700',
  Growth:    'bg-emerald-50 text-emerald-700',
  Income:    'bg-amber-50 text-amber-700',
  Leverage:  'bg-red-50 text-red-700',
}

const GROUP_BAR: Record<string, string> = {
  Valuation: 'bg-violet-300',
  Quality:   'bg-sky-300',
  Growth:    'bg-emerald-300',
  Income:    'bg-amber-300',
  Leverage:  'bg-red-300',
}

// Traffic-light colors for best / worst ranking
const RANK_BG: Record<number, string> = {
  1: 'text-emerald-700 bg-emerald-50',   // best
  2: 'text-emerald-600',
  3: 'text-slate-600',
}
const WORST_BG = 'text-red-600 bg-red-50'

// ─── Local ranking fallback ────────────────────────────────────────────────────
// Used only when the response predates the Peers Isolation phase and does not
// carry pre-computed rankings from the backend.

function rankValuesLocal(
  values: (number | null)[],
  lowerIsBetter: boolean,
): number[] {
  const nonNull = values
    .map((v, i) => ({ v, i }))
    .filter((x): x is { v: number; i: number } => x.v !== null)

  const sorted = [...nonNull].sort((a, b) =>
    lowerIsBetter ? a.v - b.v : b.v - a.v,
  )

  const ranks = new Array(values.length).fill(0)
  sorted.forEach((item, rankIdx) => {
    ranks[item.i] = rankIdx + 1
  })
  return ranks
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  selected:  PeerStock
  peers:     PeerStock[]
  /** Server-computed rankings. When present, local ranking logic is skipped. */
  rankings?: PeerRankings
}

export function PeerComparisonTable({ selected, peers, rankings }: Props) {
  const allStocks = useMemo(() => [selected, ...peers], [selected, peers])
  const n = allStocks.length

  // Pre-compute bar widths and rank positions per metric.
  // Ranks come from the backend when available; local computation is a fallback.
  const metricStats = useMemo(() => {
    return METRICS.map((m) => {
      const values = allStocks.map((s) => s[m.key] as number | null)

      // Bar widths: proportional to absolute max of positive values
      const positiveVals = values.filter((v): v is number => v !== null && v > 0)
      const absMax = positiveVals.length > 0 ? Math.max(...positiveVals) : 1
      const bars = values.map((v) =>
        v !== null && v > 0 ? Math.round((v / absMax) * 100) : 0,
      )

      // Ranks: prefer backend-shipped rankings, fall back to local computation
      let ranks: (number | null)[]
      const backendEntry = rankings?.[m.key]
      if (backendEntry) {
        ranks = backendEntry.ranks
      } else {
        // Legacy fallback — 0 means null (no data)
        const localRanks = rankValuesLocal(values, m.lowerIsBetter)
        ranks = localRanks.map((r) => (r === 0 ? null : r))
      }

      const totalNonNull = values.filter((v) => v !== null).length

      return { values, bars, ranks, totalNonNull }
    })
  }, [allStocks, rankings])

  if (allStocks.length === 0) return null

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          {/* ── Column headers ────────────────────────────────────────────── */}
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/80">
              {/* Metric label column */}
              <th className="sticky left-0 z-10 bg-slate-50 px-5 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wide min-w-[160px]">
                Metric
              </th>

              {allStocks.map((stock, si) => {
                const isSelected = si === 0
                const base = stock.ticker.replace(/\.(NS|BSE|BO)$/i, '')
                const isUnavailable = stock.source === 'timeout' || stock.source === 'unavailable'
                return (
                  <th
                    key={stock.ticker}
                    className={cn(
                      'px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-wide min-w-[110px]',
                      isSelected
                        ? 'bg-indigo-50 text-indigo-600 border-x border-indigo-100'
                        : isUnavailable
                          ? 'text-slate-300'
                          : 'text-slate-500',
                    )}
                  >
                    <span className="font-mono">{base}</span>
                    {isSelected && (
                      <span className="block text-[9px] font-medium text-indigo-400 normal-case tracking-normal">
                        ← selected
                      </span>
                    )}
                    {isUnavailable && !isSelected && (
                      <span className="block text-[9px] font-medium text-slate-300 normal-case tracking-normal">
                        {stock.source === 'timeout' ? 'timed out' : 'unavailable'}
                      </span>
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>

          {/* ── Metric rows ───────────────────────────────────────────────── */}
          <tbody>
            {METRICS.map((metric, mi) => {
              const { values, bars, ranks, totalNonNull } = metricStats[mi]
              const tooltip  = METRIC_TOOLTIPS[metric.key] ?? metric.label
              const worstRank = totalNonNull

              // Separator row between groups
              const prevGroup  = mi > 0 ? METRICS[mi - 1].group : null
              const isGroupStart = metric.group !== prevGroup

              return (
                <>
                  {isGroupStart && (
                    <tr key={`group-${metric.group}`}>
                      <td
                        colSpan={n + 1}
                        className={cn(
                          'px-5 py-1.5 text-[10px] font-bold uppercase tracking-widest border-t border-b',
                          GROUP_COLORS[metric.group],
                          'border-current/10',
                        )}
                      >
                        {metric.group}
                      </td>
                    </tr>
                  )}

                  <tr
                    key={metric.key}
                    className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors"
                  >
                    {/* Metric label */}
                    <td
                      className="sticky left-0 z-10 bg-white px-5 py-2.5 text-xs text-slate-600 font-medium whitespace-nowrap"
                      title={tooltip}
                    >
                      {metric.label}
                      <span className="ml-1 text-slate-300 cursor-help" title={tooltip}>ⓘ</span>
                    </td>

                    {/* Value cells */}
                    {allStocks.map((stock, si) => {
                      const val        = values[si]
                      const bar        = bars[si]
                      const rank       = ranks[si]
                      const isSelected = si === 0
                      const isNull     = val === null

                      // Color class based on rank
                      let colorClass = 'text-slate-600'
                      if (!isNull && totalNonNull > 1 && rank !== null) {
                        if (rank === worstRank) {
                          colorClass = WORST_BG
                        } else if (rank <= 2 && RANK_BG[rank]) {
                          colorClass = RANK_BG[rank]
                        }
                      }

                      return (
                        <td
                          key={stock.ticker}
                          className={cn(
                            'px-4 py-2.5 text-right',
                            isSelected && 'bg-indigo-50/60 border-x border-indigo-100/60',
                          )}
                        >
                          {isNull ? (
                            <span className="text-slate-300 text-xs">—</span>
                          ) : (
                            <div className="flex flex-col items-end gap-0.5">
                              <span className={cn('text-xs font-semibold tabular-nums rounded px-1', colorClass)}>
                                {metric.fmt(val as number)}
                              </span>
                              {/* Proportional bar */}
                              <div className="w-full h-1 rounded-full bg-slate-100 overflow-hidden">
                                <div
                                  className={cn('h-full rounded-full transition-all', GROUP_BAR[metric.group])}
                                  style={{ width: `${bar}%` }}
                                />
                              </div>
                            </div>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                </>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Footer legend */}
      <div className="px-5 py-3 border-t border-slate-100 flex items-center gap-6 text-[10px] text-slate-400">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded bg-emerald-200" />
          Best in group
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded bg-red-200" />
          Weakest in group
        </span>
        <span className="text-slate-300">— = not applicable or unavailable</span>
      </div>
    </div>
  )
}
