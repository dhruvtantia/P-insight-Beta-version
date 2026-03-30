/**
 * AllocationTable
 * ---------------
 * Side-by-side allocation comparison:
 *   Ticker | Current % | Min Variance % | Max Sharpe %
 *
 * Weight bars show relative allocations visually.
 * Colour-coded: increase (green), decrease (red), unchanged (slate).
 */

'use client'

import { cn } from '@/lib/utils'
import { useSortable } from '@/hooks/useSortable'
import { SortableHeader } from '@/components/common/SortableHeader'
import type { PortfolioPoint } from '@/types'

type AllocationSortKey = 'ticker' | 'current' | 'minVar' | 'maxSharpe' | 'delta'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const shortTicker = (t: string) => t.replace(/\.(NS|BO|BSE)$/i, '')

const fmt = (v: number) => `${(v * 100).toFixed(1)}%`

function DeltaBadge({ delta }: { delta: number }) {
  const pct = delta * 100
  if (Math.abs(pct) < 0.1) {
    return <span className="text-[9px] text-slate-300">—</span>
  }
  return (
    <span
      className={cn(
        'text-[9px] font-semibold',
        pct > 0 ? 'text-emerald-600' : 'text-red-600'
      )}
    >
      {pct > 0 ? '+' : ''}{pct.toFixed(1)}pp
    </span>
  )
}

function WeightBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? (value / max) * 100 : 0
  return (
    <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
      <div
        className="h-full rounded-full bg-indigo-400"
        style={{ width: `${Math.min(pct, 100)}%` }}
      />
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────

interface AllocationTableProps {
  current:     PortfolioPoint | null
  minVariance: PortfolioPoint | null
  maxSharpe:   PortfolioPoint | null
  loading:     boolean
}

export function AllocationTable({
  current,
  minVariance,
  maxSharpe,
  loading,
}: AllocationTableProps) {
  const { sortKey, sortDir, toggleSort } = useSortable<AllocationSortKey>('ticker', 'asc')

  if (loading) {
    return (
      <div className="card p-5 space-y-2 animate-pulse">
        <div className="h-4 w-48 rounded bg-slate-200 mb-3" />
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex gap-4">
            <div className="h-4 w-16 rounded bg-slate-100" />
            <div className="h-4 w-12 rounded bg-slate-100" />
            <div className="h-4 w-12 rounded bg-slate-100" />
            <div className="h-4 w-12 rounded bg-slate-100" />
          </div>
        ))}
      </div>
    )
  }

  if (!current) {
    return (
      <div className="card px-5 py-10 text-center text-sm text-slate-400">
        No allocation data available
      </div>
    )
  }

  // Build unified ticker list from all three portfolios
  const rawTickers = Array.from(new Set([
    ...Object.keys(current.weights),
    ...(minVariance ? Object.keys(minVariance.weights) : []),
    ...(maxSharpe   ? Object.keys(maxSharpe.weights)   : []),
  ]))

  // Sort by selected column
  const tickers = [...rawTickers].sort((a, b) => {
    const sign = sortDir === 'asc' ? 1 : -1
    const cw_a = current.weights[a] ?? 0
    const cw_b = current.weights[b] ?? 0
    const mv_a = minVariance?.weights[a] ?? 0
    const mv_b = minVariance?.weights[b] ?? 0
    const ms_a = maxSharpe?.weights[a]   ?? 0
    const ms_b = maxSharpe?.weights[b]   ?? 0

    switch (sortKey) {
      case 'ticker':    return sign * shortTicker(a).localeCompare(shortTicker(b))
      case 'current':   return sign * (cw_a - cw_b)
      case 'minVar':    return sign * (mv_a - mv_b)
      case 'maxSharpe': return sign * (ms_a - ms_b)
      case 'delta':     return sign * ((ms_a - cw_a) - (ms_b - cw_b))
      default:          return 0
    }
  })

  const maxW = Math.max(
    ...rawTickers.map((t) => Math.max(
      current.weights[t]    ?? 0,
      minVariance?.weights[t] ?? 0,
      maxSharpe?.weights[t]   ?? 0,
    ))
  )

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
        <h3 className="text-sm font-semibold text-slate-800">Allocation Comparison</h3>
        <span className="text-[11px] text-slate-400 ml-1">
          — all three portfolios side-by-side
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/60 text-xs">
              <SortableHeader label="Ticker"     col="ticker"    sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="left"  className="px-5 w-28" />
              <SortableHeader label="Current"    col="current"   sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" />
              <SortableHeader label="Min Var"    col="minVar"    sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" />
              <SortableHeader label="Max Sharpe" col="maxSharpe" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" className="text-amber-600" />
              <SortableHeader label="Δ Current"  col="delta"     sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" />
              <th className="px-5 py-2.5 text-left font-semibold text-slate-400 w-24">Weight</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {tickers.map((ticker) => {
              const cw = current.weights[ticker]    ?? 0
              const mv = minVariance?.weights[ticker] ?? 0
              const ms = maxSharpe?.weights[ticker]   ?? 0
              const delta = ms - cw

              return (
                <tr key={ticker} className="hover:bg-slate-50/50">
                  <td className="px-5 py-2.5 font-semibold text-slate-800">
                    {shortTicker(ticker)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">
                    {fmt(cw)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">
                    {fmt(mv)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-amber-700">
                    {fmt(ms)}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <DeltaBadge delta={delta} />
                  </td>
                  <td className="px-5 py-2.5">
                    <WeightBar value={ms} max={maxW} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="px-5 py-2.5 bg-slate-50/40 border-t border-slate-100">
        <p className="text-[10px] text-slate-400">
          Δ = Max Sharpe minus Current. Weights normalised to sum to 100%.
          Min weight: 0%, Max weight: 40%.
        </p>
      </div>
    </div>
  )
}
