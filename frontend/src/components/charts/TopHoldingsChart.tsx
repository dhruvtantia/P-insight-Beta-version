/**
 * TopHoldingsChart
 * -----------------
 * Horizontal bar chart showing top N holdings by current market value.
 *
 * Data: Holding[] — already enriched by usePortfolio with:
 *   market_value, pnl, pnl_pct, weight
 *
 * Design decisions:
 *   - Layout: "vertical" in Recharts = horizontal bars (Y-axis is category)
 *   - Bars coloured by sector using the shared SECTOR_COLORS map
 *   - P&L indicated with a subtle emerald/red value label inside the tooltip
 *   - Ticker suffix (.NS) stripped for cleaner Y-axis labels
 *   - Sector legend shown as colour chips below the chart
 *   - Skeleton matches bar count and width distribution for smooth loading
 */

'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
} from 'recharts'
import { TooltipHelp } from '@/components/common/TooltipHelp'
import { SECTOR_COLORS, DEFAULT_SECTOR_COLOR, formatCurrency, formatPct } from '@/constants'
import { cn } from '@/lib/utils'
import type { Holding } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface TopHoldingsChartProps {
  holdings: Holding[]
  loading?: boolean
  /** Max bars to show. Default: 8 */
  limit?: number
}

interface ChartEntry {
  ticker: string
  fullTicker: string
  name: string
  market_value: number
  weight: number
  pnl: number
  pnl_pct: number
  sector: string
  color: string
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

interface TooltipPayloadEntry {
  payload: ChartEntry
}

interface CustomTooltipProps {
  active?: boolean
  payload?: TooltipPayloadEntry[]
  label?: string
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  const pnlPositive = d.pnl >= 0

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-xl text-xs ring-1 ring-black/5 min-w-[180px]">
      {/* Holding name & ticker */}
      <div className="flex items-center gap-2 mb-2">
        <div
          className="h-2.5 w-2.5 rounded-sm shrink-0"
          style={{ backgroundColor: d.color }}
        />
        <div className="min-w-0">
          <p className="font-semibold text-slate-800 truncate">{d.ticker}</p>
          <p className="text-slate-400 truncate leading-none mt-0.5" style={{ fontSize: 10 }}>{d.name}</p>
        </div>
      </div>

      {/* Stats */}
      <div className="space-y-1">
        <div className="flex justify-between gap-4">
          <span className="text-slate-500">Market Value</span>
          <span className="font-semibold text-slate-800 tabular-nums">{formatCurrency(d.market_value)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-slate-500">Weight</span>
          <span className="font-semibold text-slate-800 tabular-nums">{d.weight.toFixed(1)}%</span>
        </div>
        <div className="flex justify-between gap-4 border-t border-slate-100 pt-1 mt-1">
          <span className="text-slate-500">P&amp;L</span>
          <span className={cn(
            'font-semibold tabular-nums',
            pnlPositive ? 'text-emerald-600' : 'text-red-500'
          )}>
            {pnlPositive ? '+' : ''}{formatCurrency(d.pnl)}
          </span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-slate-500">Return</span>
          <span className={cn(
            'font-semibold tabular-nums',
            pnlPositive ? 'text-emerald-600' : 'text-red-500'
          )}>
            {formatPct(d.pnl_pct)}
          </span>
        </div>
        <div className="flex justify-between gap-4 border-t border-slate-100 pt-1 mt-1">
          <span className="text-slate-500">Sector</span>
          <span className="text-slate-600 font-medium text-right" style={{ maxWidth: 100 }}>{d.sector}</span>
        </div>
      </div>
    </div>
  )
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function ChartSkeleton({ rows }: { rows: number }) {
  // Decreasing widths for visual realism
  const widths = [88, 76, 68, 58, 50, 42, 36, 30].slice(0, rows)

  return (
    <div className="px-5 pt-4 pb-5 animate-pulse">
      <div className="space-y-[14px]">
        {widths.map((w, i) => (
          <div key={i} className="flex items-center gap-3">
            {/* Y-axis label placeholder */}
            <div className="h-3 w-[52px] rounded bg-slate-100 shrink-0" />
            {/* Bar placeholder */}
            <div
              className="h-[22px] rounded-r-[4px] bg-slate-100"
              style={{ width: `${w}%` }}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function TopHoldingsChart({
  holdings,
  loading = false,
  limit = 8,
}: TopHoldingsChartProps) {
  // Prepare & sort data
  const data: ChartEntry[] = [...holdings]
    .filter((h) => (h.market_value ?? 0) > 0)
    .sort((a, b) => (b.market_value ?? 0) - (a.market_value ?? 0))
    .slice(0, limit)
    .map((h) => ({
      ticker: h.ticker.replace(/\.(NS|BSE|BO)$/i, ''),   // strip exchange suffix
      fullTicker: h.ticker,
      name: h.name,
      market_value: h.market_value ?? 0,
      weight: h.weight ?? 0,
      pnl: h.pnl ?? 0,
      pnl_pct: h.pnl_pct ?? 0,
      sector: h.sector ?? 'Unknown',
      color: SECTOR_COLORS[h.sector ?? ''] ?? DEFAULT_SECTOR_COLOR,
    }))

  // Unique sectors appearing in this chart (for the mini-legend)
  const chartSectors = Array.from(new Set(data.map((d) => d.sector)))

  // Dynamic YAxis width based on longest ticker label (7px per char, min 52, max 96)
  const maxTickerLen  = data.reduce((max, d) => Math.max(max, d.ticker.length), 4)
  const yAxisWidth    = Math.min(96, Math.max(52, maxTickerLen * 7 + 4))

  // Chart height: each bar needs ~38px, plus axes
  const chartHeight = data.length * 38 + 16

  return (
    <div className="card overflow-hidden flex flex-col">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-100 shrink-0">
        <h3 className="text-sm font-semibold text-slate-800">Top Holdings</h3>
        <TooltipHelp metric="top_holdings" />
        {!loading && data.length > 0 && (
          <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
            by market value
          </span>
        )}
      </div>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      {loading ? (
        <ChartSkeleton rows={limit} />
      ) : data.length === 0 ? (
        <div className="flex flex-1 items-center justify-center py-12 text-sm text-slate-400">
          No holdings data available
        </div>
      ) : (
        <div className="pt-4 pb-3 flex-1">
          {/* Bar chart */}
          <ResponsiveContainer width="100%" height={chartHeight}>
            <BarChart
              data={data}
              layout="vertical"
              margin={{ top: 0, right: 64, bottom: 0, left: 4 }}
            >
              {/* Hidden numeric X-axis (bars encode the value) */}
              <XAxis type="number" dataKey="market_value" hide />

              {/* Y-axis: ticker labels */}
              <YAxis
                type="category"
                dataKey="ticker"
                width={yAxisWidth}
                tick={{ fontSize: 11, fill: '#475569', fontFamily: 'inherit', fontWeight: 600 }}
                tickLine={false}
                axisLine={false}
              />

              <Tooltip
                content={<CustomTooltip />}
                cursor={{ fill: '#f8fafc', radius: 4 }}
              />

              <Bar
                dataKey="market_value"
                radius={[0, 4, 4, 0]}
                maxBarSize={26}
              >
                {data.map((d) => (
                  <Cell
                    key={d.fullTicker}
                    fill={d.color}
                    fillOpacity={0.82}
                  />
                ))}
                {/* Inline value label to the right of each bar */}
                <LabelList
                  dataKey="market_value"
                  position="right"
                  formatter={(v: number) => formatCurrency(v)}
                  style={{ fontSize: 10, fill: '#64748b', fontWeight: 500 }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          {/* Sector colour legend */}
          {chartSectors.length > 1 && (
            <div className="mt-3 px-5 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-slate-50 pt-3">
              {chartSectors.map((sector) => (
                <div key={sector} className="flex items-center gap-1.5">
                  <div
                    className="h-2 w-2 rounded-sm shrink-0"
                    style={{
                      backgroundColor: SECTOR_COLORS[sector] ?? DEFAULT_SECTOR_COLOR,
                      opacity: 0.82,
                    }}
                  />
                  <span className="text-[10px] text-slate-500 leading-none">{sector}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
