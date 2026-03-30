/**
 * SectorBreakdown
 * ----------------
 * Displays sector-level portfolio allocation.
 *
 * Phase 1: horizontal bar rows + table stats.
 * Phase 2: replace or augment with Recharts PieChart/DonutChart.
 *          The `sectors` data prop is already shaped correctly for Recharts:
 *          [{ sector, value, weight_pct, num_holdings }]
 *
 * Extension points:
 *   - Pass onSectorClick to filter holdings table by sector
 *   - Pass selectedSector to highlight active sector
 *   - Wire recharts: <PieChart><Pie data={sectors} dataKey="value" nameKey="sector" /></PieChart>
 */

'use client'

import { TooltipHelp } from '@/components/common/TooltipHelp'
import { formatCurrency, SECTOR_COLORS, DEFAULT_SECTOR_COLOR } from '@/constants'
import { cn } from '@/lib/utils'
import type { SectorAllocation } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SectorBreakdownProps {
  sectors: SectorAllocation[]
  loading?: boolean
  /** If provided, shows a highlight on this sector */
  selectedSector?: string | null
  /** Called when a sector row is clicked */
  onSectorClick?: (sector: string) => void
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SectorSkeleton() {
  return (
    <div className="space-y-4 animate-pulse p-5">
      {[90, 70, 55, 40, 30].map((w, i) => (
        <div key={i}>
          <div className="flex justify-between mb-1.5">
            <div className="h-3 rounded bg-slate-200" style={{ width: `${w}px` }} />
            <div className="h-3 w-8 rounded bg-slate-100" />
          </div>
          <div className="h-2 w-full rounded-full bg-slate-100" />
        </div>
      ))}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function SectorBreakdown({
  sectors,
  loading = false,
  selectedSector,
  onSectorClick,
}: SectorBreakdownProps) {
  const totalValue = sectors.reduce((s, sec) => s + sec.value, 0)

  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-100">
        <h3 className="text-sm font-semibold text-slate-800">Sector Allocation</h3>
        <TooltipHelp metric="sector_concentration" />
        {!loading && sectors.length > 0 && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500 ml-auto">
            {sectors.length} sectors
          </span>
        )}
      </div>

      {/* Phase 2 chart slot ─────────────────────────────────────────────────
          Uncomment and replace the placeholder below when adding Recharts:

          import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
          <div className="px-5 pt-4">
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={sectors} dataKey="value" nameKey="sector" innerRadius={60} outerRadius={90}>
                  {sectors.map((s) => (
                    <Cell key={s.sector} fill={SECTOR_COLORS[s.sector] ?? DEFAULT_SECTOR_COLOR} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
      ──────────────────────────────────────────────────────────────────────── */}

      {loading ? (
        <SectorSkeleton />
      ) : sectors.length === 0 ? (
        <div className="px-5 py-10 text-center text-sm text-slate-400">
          No sector data available.
        </div>
      ) : (
        <>
          {/* Bar chart rows */}
          <ul className="px-5 pt-4 pb-2 space-y-3">
            {sectors.map((s) => {
              const color = SECTOR_COLORS[s.sector] ?? DEFAULT_SECTOR_COLOR
              const isSelected = selectedSector === s.sector
              const isClickable = !!onSectorClick

              return (
                <li
                  key={s.sector}
                  onClick={isClickable ? () => onSectorClick(s.sector) : undefined}
                  className={cn(
                    'rounded-lg transition-all',
                    isClickable && 'cursor-pointer hover:bg-slate-50 -mx-2 px-2 py-1',
                    isSelected && 'bg-slate-50 -mx-2 px-2 py-1'
                  )}
                >
                  {/* Label row */}
                  <div className="flex items-center justify-between mb-1.5 gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className="h-2.5 w-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: color }}
                      />
                      <span className={cn(
                        'text-xs font-medium truncate',
                        isSelected ? 'text-slate-900' : 'text-slate-700'
                      )}>
                        {s.sector}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-[11px] text-slate-400">
                        {s.num_holdings} {s.num_holdings === 1 ? 'stock' : 'stocks'}
                      </span>
                      <span className="text-xs font-bold text-slate-800 tabular-nums w-10 text-right">
                        {s.weight_pct.toFixed(1)}%
                      </span>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700 ease-out"
                      style={{
                        width: `${s.weight_pct}%`,
                        backgroundColor: color,
                        opacity: isSelected || !selectedSector ? 1 : 0.45,
                      }}
                    />
                  </div>
                </li>
              )
            })}
          </ul>

          {/* Stats table */}
          <div className="border-t border-slate-100 mt-3">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50/80">
                  {['Sector', 'Value', 'Weight'].map((h) => (
                    <th key={h} className={cn(
                      'px-5 py-2 text-[11px] font-semibold text-slate-400',
                      h !== 'Sector' ? 'text-right' : 'text-left'
                    )}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {sectors.map((s) => (
                  <tr key={s.sector} className={cn(
                    'hover:bg-slate-50 transition-colors',
                    selectedSector === s.sector && 'bg-indigo-50/50'
                  )}>
                    <td className="px-5 py-2">
                      <div className="flex items-center gap-1.5">
                        <div
                          className="h-2 w-2 rounded-full shrink-0"
                          style={{ backgroundColor: SECTOR_COLORS[s.sector] ?? DEFAULT_SECTOR_COLOR }}
                        />
                        <span className="font-medium text-slate-700">{s.sector}</span>
                      </div>
                    </td>
                    <td className="px-5 py-2 text-right text-slate-600 tabular-nums">
                      {formatCurrency(s.value)}
                    </td>
                    <td className="px-5 py-2 text-right font-bold text-slate-800 tabular-nums">
                      {s.weight_pct.toFixed(1)}%
                    </td>
                  </tr>
                ))}
                {/* Total row */}
                <tr className="border-t border-slate-200 bg-slate-50">
                  <td className="px-5 py-2 text-xs font-bold text-slate-700">Total</td>
                  <td className="px-5 py-2 text-right text-xs font-bold text-slate-800 tabular-nums">
                    {formatCurrency(totalValue)}
                  </td>
                  <td className="px-5 py-2 text-right text-xs font-bold text-slate-800">100%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
