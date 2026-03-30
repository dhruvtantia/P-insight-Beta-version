'use client'

/**
 * FundamentalsSnapshotCard — compact 4-metric dashboard strip
 * ------------------------------------------------------------
 * Shows: Wtd P/E  |  Wtd Div Yield  |  Wtd ROE  |  Wtd Op Margin
 *
 * compact=true  → dashboard strip (horizontal 4-col row, no section header)
 * compact=false → not used here; full view lives in PortfolioWeightedMetricsCard
 *
 * Receives WeightedFundamentals from the parent (useFundamentals hook).
 * Zero new API calls.
 */

import Link        from 'next/link'
import { BarChart2, ArrowRight } from 'lucide-react'
import { TooltipHelp } from '@/components/common/TooltipHelp'
import {
  peStatus, roeStatus, marginStatus, divYieldStatus,
  fmtX, fmtPct,
  STATUS_TEXT, STATUS_DOT,
  type MetricStatus,
} from '@/lib/fundamentals'
import type { WeightedFundamentals } from '@/types'
import { cn } from '@/lib/utils'

// ─── 4-metric config ──────────────────────────────────────────────────────────

interface SnapMetric {
  label:   string
  tooltip: string
  value:   number | null
  format:  (v: number | null) => string
  status:  { status: MetricStatus; label: string }
}

function buildSnapMetrics(w: WeightedFundamentals): SnapMetric[] {
  return [
    {
      label: 'Wtd. P/E',   tooltip: 'wtd_pe',
      value: w.wtd_pe,     format: fmtX,
      status: peStatus(w.wtd_pe),
    },
    {
      label: 'Div. Yield', tooltip: 'wtd_div_yield',
      value: w.wtd_div_yield, format: fmtPct,
      status: divYieldStatus(w.wtd_div_yield),
    },
    {
      label: 'Wtd. ROE',   tooltip: 'wtd_roe',
      value: w.wtd_roe,    format: fmtPct,
      status: roeStatus(w.wtd_roe),
    },
    {
      label: 'Op. Margin', tooltip: 'wtd_operating_margin',
      value: w.wtd_operating_margin, format: fmtPct,
      status: marginStatus(w.wtd_operating_margin),
    },
  ]
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  weightedMetrics: WeightedFundamentals | null
  loading?:        boolean
}

export function FundamentalsSnapshotCard({ weightedMetrics, loading = false }: Props) {
  // Loading skeleton
  if (loading) {
    return (
      <div className="card px-5 py-4 animate-pulse">
        <div className="flex items-center justify-between mb-3">
          <div className="h-3.5 w-40 rounded bg-slate-200" />
          <div className="h-3 w-24 rounded bg-slate-100" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1,2,3,4].map((i) => (
            <div key={i} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
              <div className="h-3 w-16 rounded bg-slate-200 mb-2" />
              <div className="h-5 w-12 rounded bg-slate-100" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (!weightedMetrics) return null

  const metrics = buildSnapMetrics(weightedMetrics)

  return (
    <div className="card px-5 py-4">
      {/* Header row */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <BarChart2 className="h-4 w-4 text-teal-500" />
          <h3 className="text-sm font-semibold text-slate-800">Fundamentals Snapshot</h3>
        </div>
        <Link
          href="/fundamentals"
          className="flex items-center gap-1 text-[11px] font-medium text-indigo-600 hover:text-indigo-800 transition-colors"
        >
          Full view <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {/* 4-metric row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {metrics.map((m) => {
          const isNull = m.value === null
          const { status, label: statusLabel } = m.status

          return (
            <div
              key={m.label}
              className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2.5"
            >
              <div className="flex items-center gap-1 mb-1">
                <p className="text-[11px] text-slate-500 font-medium truncate">{m.label}</p>
                <TooltipHelp metric={m.tooltip} position="top" />
              </div>

              <div className="flex items-end gap-1.5">
                <p
                  className={cn(
                    'text-lg font-bold leading-none',
                    isNull
                      ? 'text-slate-200'
                      : STATUS_TEXT[status] ?? 'text-slate-800'
                  )}
                >
                  {m.format(m.value)}
                </p>
                {!isNull && statusLabel && (
                  <span
                    className={cn(
                      'text-[9px] font-semibold uppercase tracking-wide mb-0.5',
                      STATUS_TEXT[status] ?? 'text-slate-400'
                    )}
                  >
                    {statusLabel}
                  </span>
                )}
              </div>

              {/* Status dot indicator */}
              {!isNull && (
                <div className="flex items-center gap-1 mt-1.5">
                  <span className={cn('h-1.5 w-1.5 rounded-full', STATUS_DOT[status])} />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
