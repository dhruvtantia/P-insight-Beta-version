/**
 * SectorAllocationChart
 * ----------------------
 * Donut chart showing portfolio allocation across sectors.
 *
 * Data: SectorAllocation[] — already shaped correctly from usePortfolio().sectors.
 *   Each entry: { sector, value, weight_pct, num_holdings }
 *
 * Layout:
 *   Left: Recharts PieChart (donut) with custom tooltip
 *   Right: Colour-coded legend with name + weight%
 *   Centre: Total portfolio value label
 *
 * Extension points:
 *   - Pass onSectorClick to cross-filter the HoldingsTable
 *   - Pass selectedSector to highlight the active slice
 */

'use client'

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Sector } from 'recharts'
import { useState } from 'react'
import { TooltipHelp } from '@/components/common/TooltipHelp'
import { SECTOR_COLORS, DEFAULT_SECTOR_COLOR, formatCurrency } from '@/constants'
import { cn } from '@/lib/utils'
import type { SectorAllocation } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SectorAllocationChartProps {
  sectors: SectorAllocation[]
  loading?: boolean
  selectedSector?: string | null
  onSectorClick?: (sector: string) => void
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

interface TooltipPayloadEntry {
  fill: string
  payload: SectorAllocation
  value: number
}

interface CustomTooltipProps {
  active?: boolean
  payload?: TooltipPayloadEntry[]
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload?.length) return null
  const entry = payload[0]
  const d = entry.payload

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-xl text-xs ring-1 ring-black/5">
      <div className="flex items-center gap-2 mb-1.5">
        <div
          className="h-2.5 w-2.5 rounded-sm shrink-0"
          style={{ backgroundColor: entry.fill }}
        />
        <span className="font-semibold text-slate-800">{d.sector}</span>
      </div>
      <div className="space-y-0.5 text-slate-500">
        <p>{formatCurrency(d.value)}</p>
        <p className="font-semibold text-slate-700">{d.weight_pct.toFixed(1)}% of portfolio</p>
        <p>{d.num_holdings} {d.num_holdings === 1 ? 'holding' : 'holdings'}</p>
      </div>
    </div>
  )
}

// ─── Active slice renderer (subtle scale on hover) ────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ActiveSlice(props: any) {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props
  return (
    <Sector
      cx={cx}
      cy={cy}
      innerRadius={innerRadius - 2}
      outerRadius={outerRadius + 5}
      startAngle={startAngle}
      endAngle={endAngle}
      fill={fill}
    />
  )
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function ChartSkeleton() {
  return (
    <div className="flex items-center gap-6 px-5 pb-5 pt-4 animate-pulse">
      {/* Donut placeholder */}
      <div className="relative shrink-0 flex items-center justify-center" style={{ width: 180, height: 180 }}>
        <div className="h-[160px] w-[160px] rounded-full bg-slate-100" />
        <div className="absolute h-[90px] w-[90px] rounded-full bg-white" />
      </div>
      {/* Legend placeholder */}
      <div className="flex-1 space-y-3">
        {[80, 65, 70, 55, 50].map((w, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="h-2.5 w-2.5 rounded-sm bg-slate-200 shrink-0" />
            <div className="h-2.5 rounded bg-slate-100" style={{ width: `${w}%` }} />
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function SectorAllocationChart({
  sectors,
  loading = false,
  selectedSector,
  onSectorClick,
}: SectorAllocationChartProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const totalValue = sectors.reduce((sum, s) => sum + s.value, 0)

  return (
    <div className="card overflow-hidden flex flex-col">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-100 shrink-0">
        <h3 className="text-sm font-semibold text-slate-800">Sector Allocation</h3>
        <TooltipHelp metric="sector_concentration" />
        {!loading && sectors.length > 0 && (
          <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
            {sectors.length} sectors
          </span>
        )}
      </div>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      {loading ? (
        <ChartSkeleton />
      ) : sectors.length === 0 ? (
        <div className="flex flex-1 items-center justify-center py-12 text-sm text-slate-400">
          No sector data available
        </div>
      ) : (
        <div className="flex items-center gap-5 px-5 pt-4 pb-5 flex-1">

          {/* ── Donut chart ──────────────────────────────────────────────── */}
          <div
            className="relative shrink-0 flex items-center justify-center w-36 h-36 sm:w-44 sm:h-44"
          >
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={sectors}
                  dataKey="value"
                  nameKey="sector"
                  cx="50%"
                  cy="50%"
                  innerRadius="58%"
                  outerRadius="78%"
                  paddingAngle={2}
                  strokeWidth={0}
                  startAngle={90}
                  endAngle={-270}
                  isAnimationActive={true}
                  animationBegin={150}
                  animationDuration={700}
                  animationEasing="ease-out"
                  activeIndex={activeIndex ?? undefined}
                  activeShape={ActiveSlice}
                  onMouseEnter={(_, index) => setActiveIndex(index)}
                  onMouseLeave={() => setActiveIndex(null)}
                  onClick={(_, index) => onSectorClick?.(sectors[index].sector)}
                  style={{ cursor: onSectorClick ? 'pointer' : 'default' }}
                >
                  {sectors.map((s) => (
                    <Cell
                      key={s.sector}
                      fill={SECTOR_COLORS[s.sector] ?? DEFAULT_SECTOR_COLOR}
                      opacity={
                        selectedSector && selectedSector !== s.sector ? 0.35 : 1
                      }
                    />
                  ))}
                </Pie>
                <Tooltip
                  content={<CustomTooltip />}
                  wrapperStyle={{ zIndex: 50 }}
                />
              </PieChart>
            </ResponsiveContainer>

            {/* Centre label: total portfolio value */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-[9px] font-medium text-slate-400 uppercase tracking-widest leading-none">
                Total
              </span>
              <span className="text-[11px] font-bold text-slate-800 mt-1 leading-none tabular-nums">
                {formatCurrency(totalValue)}
              </span>
            </div>
          </div>

          {/* ── Legend ──────────────────────────────────────────────────── */}
          <ul className="flex-1 space-y-2 min-w-0">
            {[...sectors]
              .sort((a, b) => b.weight_pct - a.weight_pct)
              .map((s, i) => {
                const color = SECTOR_COLORS[s.sector] ?? DEFAULT_SECTOR_COLOR
                const isSelected = selectedSector === s.sector
                const isFaded = !!selectedSector && !isSelected
                const isActive = activeIndex !== null &&
                  sectors.findIndex((x) => x.sector === s.sector) === activeIndex

                return (
                  <li
                    key={s.sector}
                    className={cn(
                      'flex items-center gap-2.5 rounded-md px-1.5 py-1 -mx-1.5 min-w-0 transition-all duration-150',
                      onSectorClick && 'cursor-pointer hover:bg-slate-50',
                      isActive && 'bg-slate-50',
                      isFaded && 'opacity-40'
                    )}
                    onClick={() => onSectorClick?.(s.sector)}
                    onMouseEnter={() => {
                      const idx = sectors.findIndex((x) => x.sector === s.sector)
                      setActiveIndex(idx)
                    }}
                    onMouseLeave={() => setActiveIndex(null)}
                  >
                    {/* Colour swatch */}
                    <div
                      className="h-2.5 w-2.5 rounded-sm shrink-0"
                      style={{ backgroundColor: color }}
                    />

                    {/* Name */}
                    <span className={cn(
                      'text-xs truncate flex-1 transition-colors',
                      isActive || isSelected
                        ? 'text-slate-900 font-semibold'
                        : 'text-slate-600 font-medium'
                    )}>
                      {s.sector}
                    </span>

                    {/* Weight */}
                    <span className={cn(
                      'text-xs tabular-nums shrink-0 transition-colors',
                      isActive || isSelected ? 'text-slate-900 font-bold' : 'text-slate-500'
                    )}>
                      {s.weight_pct.toFixed(1)}%
                    </span>
                  </li>
                )
              })}
          </ul>
        </div>
      )}
    </div>
  )
}
