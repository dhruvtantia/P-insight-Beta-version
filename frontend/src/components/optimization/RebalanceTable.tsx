/**
 * RebalanceTable
 * --------------
 * Recommended buy/sell actions to move from the current portfolio
 * to the Max Sharpe (tangency) portfolio.
 *
 * Shows: Ticker | Current % | Target % | Δ pp | Action badge
 *
 * Only shows deltas > 0.3% (threshold set server-side).
 * Sorted by |delta| descending.
 */

'use client'

import { ArrowUpRight, ArrowDownRight, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSortable } from '@/hooks/useSortable'
import { SortableHeader } from '@/components/common/SortableHeader'
import type { RebalanceDelta } from '@/types'

type RebalanceSortKey = 'ticker' | 'current' | 'target' | 'delta' | 'action'

// ─── Loading skeleton ──────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="p-5 space-y-2 animate-pulse">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="flex items-center gap-4">
          <div className="h-4 w-16 rounded bg-slate-100" />
          <div className="h-4 w-12 rounded bg-slate-100" />
          <div className="h-4 w-12 rounded bg-slate-100" />
          <div className="h-5 w-10 rounded-full bg-slate-100" />
        </div>
      ))}
    </div>
  )
}

// ─── Action badge ──────────────────────────────────────────────────────────────

function ActionBadge({ action, delta }: { action: 'buy' | 'sell'; delta: number }) {
  const isBuy = action === 'buy'
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold',
        isBuy
          ? 'bg-emerald-100 text-emerald-700'
          : 'bg-red-100 text-red-700'
      )}
    >
      {isBuy ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
      {isBuy ? '+' : ''}{delta.toFixed(1)}pp
    </span>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────

interface RebalanceTableProps {
  rebalance: RebalanceDelta[]
  loading:   boolean
}

export function RebalanceTable({ rebalance, loading }: RebalanceTableProps) {
  const shortTicker = (t: string) => t.replace(/\.(NS|BO|BSE)$/i, '')
  const { sortKey, sortDir, toggleSort } = useSortable<RebalanceSortKey>('delta', 'desc')

  const sorted = [...rebalance].sort((a, b) => {
    const sign = sortDir === 'asc' ? 1 : -1
    switch (sortKey) {
      case 'ticker':  return sign * shortTicker(a.ticker).localeCompare(shortTicker(b.ticker))
      case 'current': return sign * (a.current_weight - b.current_weight)
      case 'target':  return sign * (a.target_weight - b.target_weight)
      case 'delta':   return sign * (Math.abs(a.delta_pct) - Math.abs(b.delta_pct))
      case 'action':  return sign * a.action.localeCompare(b.action)
      default:        return 0
    }
  })

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
        <h3 className="text-sm font-semibold text-slate-800">Rebalance Recommendations</h3>
        <span className="text-[11px] text-slate-400 ml-1">
          — to reach Max Sharpe portfolio
        </span>
        {!loading && rebalance.length === 0 && (
          <span className="ml-auto rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold px-2 py-0.5">
            Already optimal
          </span>
        )}
      </div>

      {loading ? (
        <Skeleton />
      ) : rebalance.length === 0 ? (
        <div className="px-5 py-8 text-center">
          <p className="text-sm text-slate-500">
            No significant changes recommended. Your portfolio is close to the Max Sharpe allocation.
          </p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60">
                  <SortableHeader label="Ticker"  col="ticker"  sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="left"  className="px-5" />
                  <SortableHeader label="Current" col="current" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" />
                  <SortableHeader label="Target"  col="target"  sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" />
                  <SortableHeader label="Change"  col="delta"   sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" />
                  <SortableHeader label="Action"  col="action"  sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" className="px-5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {sorted.map((row) => (
                  <tr key={row.ticker} className="hover:bg-slate-50/50">
                    <td className="px-5 py-2.5 font-semibold text-slate-800">
                      {shortTicker(row.ticker)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">
                      {row.current_weight.toFixed(1)}%
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-amber-700">
                      {row.target_weight.toFixed(1)}%
                    </td>
                    <td className={cn(
                      'px-4 py-2.5 text-right tabular-nums font-bold',
                      row.action === 'buy' ? 'text-emerald-700' : 'text-red-700',
                    )}>
                      {row.delta_pct > 0 ? '+' : ''}{row.delta_pct.toFixed(1)}pp
                    </td>
                    <td className="px-5 py-2.5 text-right">
                      <ActionBadge action={row.action} delta={row.delta_pct} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-start gap-2 px-5 py-2.5 bg-amber-50/40 border-t border-amber-100">
            <Info className="h-3 w-3 text-amber-500 mt-0.5 shrink-0" />
            <p className="text-[10px] text-amber-700 leading-relaxed">
              These are model suggestions based on historical data only. They do not account for
              taxes, transaction costs, liquidity, or your personal investment constraints.
              Always consult a qualified financial advisor before rebalancing.
            </p>
          </div>
        </>
      )}
    </div>
  )
}
