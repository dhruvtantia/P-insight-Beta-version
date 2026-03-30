/**
 * ConcentrationBreakdown
 * -----------------------
 * Horizontal bar chart (CSS-only, no Recharts) showing top holdings by weight%,
 * with threshold markers at 20% (warning) and 35% (danger).
 *
 * The bar width is relative to the maximum weight in the set, not 100%.
 * This makes differences between positions visually readable even when all
 * positions are < 25%.
 *
 * Used on the full /risk page.
 */

'use client'

import { TooltipHelp } from '@/components/common/TooltipHelp'
import { SECTOR_COLORS, DEFAULT_SECTOR_COLOR } from '@/constants'
import { cn } from '@/lib/utils'
import { holdingWeightStatus } from '@/lib/risk'
import type { RiskSnapshot } from '@/types'

// ─── Status colours for bar fill ─────────────────────────────────────────────

const BAR_COLOR: Record<ReturnType<typeof holdingWeightStatus>, string> = {
  good:    '#6366f1',   // indigo — safe
  warning: '#f59e0b',   // amber — watch
  danger:  '#ef4444',   // red — concern
  neutral: '#94a3b8',
}

// ─── Threshold lines ──────────────────────────────────────────────────────────

const THRESHOLDS = [
  { pct: 20, label: '20%', colorClass: 'border-amber-300', textClass: 'text-amber-500' },
  { pct: 35, label: '35%', colorClass: 'border-red-300',   textClass: 'text-red-400'   },
]

// ─── Types ────────────────────────────────────────────────────────────────────

interface ConcentrationBreakdownProps {
  snapshot: RiskSnapshot
  loading?: boolean
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton({ rows = 6 }: { rows?: number }) {
  const widths = [88, 72, 60, 50, 38, 28].slice(0, rows)
  return (
    <div className="space-y-4 animate-pulse p-5">
      {widths.map((w, i) => (
        <div key={i}>
          <div className="flex justify-between mb-1.5">
            <div className="h-3 rounded bg-slate-200" style={{ width: `${w * 0.6}px` }} />
            <div className="h-3 w-8 rounded bg-slate-100" />
          </div>
          <div className="h-2.5 w-full rounded-full bg-slate-100">
            <div className="h-2.5 rounded-full bg-slate-200" style={{ width: `${w}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ConcentrationBreakdown({
  snapshot,
  loading = false,
}: ConcentrationBreakdownProps) {
  const { top_holdings_by_weight } = snapshot

  // Scale bars relative to the max weight (so differences are visible)
  const maxWeight = Math.max(...top_holdings_by_weight.map((h) => h.weight), 0.01)

  // Max visible weight for threshold positioning
  // The chart x-axis goes from 0 to max(maxWeight, 40) so thresholds at 20/35 always show
  const axisMax = Math.max(maxWeight, 40)

  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-100">
        <h3 className="text-sm font-semibold text-slate-800">Position Concentration</h3>
        <TooltipHelp metric="concentration" />
        <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
          % of portfolio
        </span>
      </div>

      {loading ? (
        <Skeleton rows={top_holdings_by_weight.length || 6} />
      ) : top_holdings_by_weight.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-slate-400">No holdings data.</p>
      ) : (
        <div className="px-5 pt-5 pb-4">
          {/* Bar chart area */}
          <div className="relative">
            {/* Threshold lines (positioned proportionally to axisMax) */}
            {THRESHOLDS.map((t) => {
              if (t.pct > axisMax) return null
              const leftPct = (t.pct / axisMax) * 100
              return (
                <div
                  key={t.pct}
                  className={cn(
                    'absolute top-0 bottom-0 border-l border-dashed',
                    t.colorClass
                  )}
                  style={{ left: `${leftPct}%` }}
                >
                  <span
                    className={cn(
                      'absolute -top-4 -translate-x-1/2 text-[9px] font-bold',
                      t.textClass
                    )}
                  >
                    {t.label}
                  </span>
                </div>
              )
            })}

            {/* Threshold legend */}
            <div className="flex gap-4 mb-3 -mt-1">
              <div className="flex items-center gap-1">
                <div className="h-2.5 w-2.5 rounded-sm bg-indigo-500 opacity-80" />
                <span className="text-[10px] text-slate-400">Normal (&lt;20%)</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="h-2.5 w-2.5 rounded-sm bg-amber-400" />
                <span className="text-[10px] text-slate-400">Watch (20–35%)</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="h-2.5 w-2.5 rounded-sm bg-red-500" />
                <span className="text-[10px] text-slate-400">High (&gt;35%)</span>
              </div>
            </div>

            {/* Bars */}
            <ul className="space-y-3 mt-5">
              {top_holdings_by_weight.map((h) => {
                const status = holdingWeightStatus(h.weight)
                const barColor = BAR_COLOR[status]
                const sectorColor = SECTOR_COLORS[h.sector] ?? DEFAULT_SECTOR_COLOR
                const barWidthPct = (h.weight / axisMax) * 100

                return (
                  <li key={h.ticker}>
                    {/* Label row */}
                    <div className="flex items-center justify-between mb-1 gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {/* Sector colour dot */}
                        <div
                          className="h-2 w-2 rounded-full shrink-0"
                          style={{ backgroundColor: sectorColor }}
                        />
                        <span className="text-xs font-bold text-slate-700 tabular-nums">
                          {h.ticker.replace(/\.(NS|BSE|BO)$/i, '')}
                        </span>
                        <span className="text-[11px] text-slate-400 truncate">{h.name}</span>
                      </div>
                      <span
                        className={cn(
                          'text-xs font-bold tabular-nums shrink-0',
                          status === 'danger'  && 'text-red-600',
                          status === 'warning' && 'text-amber-700',
                          status === 'good'    && 'text-slate-700',
                        )}
                      >
                        {h.weight.toFixed(1)}%
                      </span>
                    </div>

                    {/* Bar */}
                    <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700 ease-out"
                        style={{
                          width: `${barWidthPct}%`,
                          backgroundColor: barColor,
                          opacity: 0.85,
                        }}
                      />
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>

          {/* Summary footer */}
          <div className="mt-5 flex flex-wrap gap-4 border-t border-slate-100 pt-4">
            <div className="text-center">
              <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-0.5">Largest</p>
              <p className="text-sm font-bold text-slate-800">
                {snapshot.max_holding_weight.toFixed(1)}%
              </p>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-0.5">Top 3</p>
              <p className="text-sm font-bold text-slate-800">{snapshot.top3_weight.toFixed(1)}%</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-0.5">Top 5</p>
              <p className="text-sm font-bold text-slate-800">{snapshot.top5_weight.toFixed(1)}%</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-0.5">Effective N</p>
              <p className="text-sm font-bold text-slate-800">{snapshot.effective_n.toFixed(1)}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
