'use client'

/**
 * RelativeValuationSummary — insight pills showing the selected stock's rank.
 *
 * For each of 5 key metrics, shows where the selected stock stands among all
 * stocks in the comparison (selected + peers combined).
 *
 * Rankings:
 *   When the backend ships pre-computed rankings (via the `rankings` prop),
 *   the component reads them directly. This is the canonical path — the
 *   backend owns the ranking logic and ships it with the response.
 *   The local `rank()` fallback is retained only for backward compat with
 *   responses that predate the Peers Isolation phase.
 *
 * Example outputs:
 *   "P/E: 2nd cheapest of 5"   → metric where lower is better
 *   "ROE: #1 of 4"             → metric where higher is better
 *   "Revenue Growth: N/A"       → selected stock has null value
 */

import { useMemo }                        from 'react'
import { cn }                            from '@/lib/utils'
import type { PeerStock, PeerRankings }  from '@/types'

// ─── Metrics to summarise ─────────────────────────────────────────────────────

interface SummaryMetric {
  key:           keyof PeerStock
  label:         string
  lowerIsBetter: boolean
  bestWord:      string    // e.g. "cheapest" / "highest"
}

const SUMMARY_METRICS: SummaryMetric[] = [
  { key: 'pe_ratio',       label: 'P/E',          lowerIsBetter: true,  bestWord: 'cheapest' },
  { key: 'roe',            label: 'ROE',           lowerIsBetter: false, bestWord: 'highest'  },
  { key: 'revenue_growth', label: 'Rev Growth',    lowerIsBetter: false, bestWord: 'fastest'  },
  { key: 'profit_margin',  label: 'Profit Margin', lowerIsBetter: false, bestWord: 'widest'   },
  { key: 'pb_ratio',       label: 'P/B',           lowerIsBetter: true,  bestWord: 'cheapest' },
]

// ─── Ordinal helper ───────────────────────────────────────────────────────────

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0])
}

// ─── Local ranking fallback ────────────────────────────────────────────────────
// Used only when the response predates the Peers Isolation phase.

function rankLocal(
  selected: PeerStock,
  all: PeerStock[],
  metric: SummaryMetric,
): { rank: number; total: number } | null {
  const allVals    = all.map((s) => s[metric.key] as number | null)
  const nonNull    = allVals.filter((v): v is number => v !== null)
  const selectedVal = selected[metric.key] as number | null

  if (selectedVal === null) return null
  if (nonNull.length < 2)  return null

  const sorted = [...nonNull].sort((a, b) =>
    metric.lowerIsBetter ? a - b : b - a,
  )
  const rank = sorted.indexOf(selectedVal) + 1
  return { rank, total: nonNull.length }
}

// ─── Sentiment ────────────────────────────────────────────────────────────────

type Sentiment = 'best' | 'good' | 'mid' | 'poor' | 'worst'

function sentiment(rank: number, total: number): Sentiment {
  if (rank === 1)                           return 'best'
  if (rank <= Math.ceil(total * 0.33))      return 'good'
  if (rank >= total)                        return 'worst'
  if (rank >= Math.ceil(total * 0.67))      return 'poor'
  return 'mid'
}

const PILL_STYLES: Record<Sentiment, string> = {
  best:  'bg-emerald-50 border-emerald-200 text-emerald-700',
  good:  'bg-emerald-50/60 border-emerald-100 text-emerald-600',
  mid:   'bg-slate-50 border-slate-200 text-slate-600',
  poor:  'bg-amber-50 border-amber-200 text-amber-700',
  worst: 'bg-red-50 border-red-200 text-red-700',
}

const RANK_ICON: Record<Sentiment, string> = {
  best:  '🟢',
  good:  '🟩',
  mid:   '⬜',
  poor:  '🟡',
  worst: '🔴',
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  selected:  PeerStock
  peers:     PeerStock[]
  /** Server-computed rankings. When present, local ranking logic is skipped. */
  rankings?: PeerRankings
}

export function RelativeValuationSummary({ selected, peers, rankings }: Props) {
  const allStocks = useMemo(() => [selected, ...peers], [selected, peers])

  const insights = useMemo(() =>
    SUMMARY_METRICS.map((m) => {
      const selectedVal = selected[m.key] as number | null
      if (selectedVal === null) return { metric: m, result: null }

      // ── Backend rankings (canonical path) ─────────────────────────────────
      const backendEntry = rankings?.[m.key]
      if (backendEntry) {
        const rank  = backendEntry.ranks[0]   // index 0 = selected stock
        const total = backendEntry.total_with_data
        if (rank === null || total < 2) return { metric: m, result: null }
        return { metric: m, result: { rank, total } }
      }

      // ── Local fallback (legacy responses without backend rankings) ─────────
      const result = rankLocal(selected, allStocks, m)
      return { metric: m, result }
    }),
    [selected, allStocks, rankings],
  )

  const hasAny = insights.some((i) => i.result !== null)
  if (!hasAny) return null

  const baseName = selected.ticker.replace(/\.(NS|BSE|BO)$/i, '')

  return (
    <div className="card px-5 py-4">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
        {baseName} vs peers — at a glance
      </p>
      <div className="flex flex-wrap gap-2">
        {insights.map(({ metric, result }) => {
          if (!result) {
            return (
              <div
                key={metric.key}
                className="rounded-full border border-slate-100 bg-slate-50 px-3 py-1.5
                           text-[11px] text-slate-400 font-medium"
              >
                {metric.label}: N/A
              </div>
            )
          }

          const sent    = sentiment(result.rank, result.total)
          const isFirst = result.rank === 1

          const text = isFirst
            ? `${metric.label}: ${metric.bestWord} of ${result.total}`
            : `${metric.label}: ${ordinal(result.rank)} of ${result.total}`

          return (
            <div
              key={metric.key}
              className={cn(
                'rounded-full border px-3 py-1.5 text-[11px] font-semibold flex items-center gap-1.5',
                PILL_STYLES[sent],
              )}
            >
              <span>{RANK_ICON[sent]}</span>
              <span>{text}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
