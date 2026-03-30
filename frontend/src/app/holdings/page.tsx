'use client'

import { usePortfolio }         from '@/hooks/usePortfolio'
import { PageLoader }           from '@/components/common/LoadingSpinner'
import { TooltipHelp }          from '@/components/common/TooltipHelp'
import { QuickActionBar }       from '@/components/ui/QuickActionBar'
import { InlineHelperText }     from '@/components/ui/InlineHelperText'
import { formatCurrency, formatPct, SECTOR_COLORS, DEFAULT_SECTOR_COLOR } from '@/constants'
import { cn }                   from '@/lib/utils'
import { Users, GitFork }       from 'lucide-react'

export default function HoldingsPage() {
  const { holdings, summary, loading, error } = usePortfolio()

  if (loading) return <PageLoader />
  if (error) return <p className="text-red-500 text-sm">{error}</p>

  return (
    <div className="space-y-6">
      {/* Summary strip */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Total Value', value: formatCurrency(summary.total_value) },
            { label: 'Total Cost',  value: formatCurrency(summary.total_cost) },
            { label: 'Total P&L',   value: formatCurrency(summary.total_pnl), colored: true, positive: summary.total_pnl >= 0 },
            { label: 'P&L %',       value: formatPct(summary.total_pnl_pct), colored: true, positive: summary.total_pnl_pct >= 0 },
          ].map(({ label, value, colored, positive }) => (
            <div key={label} className="card p-4">
              <p className="text-xs text-slate-500 mb-1">{label}</p>
              <p className={cn('text-lg font-bold', colored ? (positive ? 'text-gain' : 'text-loss') : 'text-slate-900')}>
                {value}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Workflow CTAs */}
      <QuickActionBar
        actions={[
          {
            icon: Users,
            label: 'Compare Peers',
            description: 'Select a holding to benchmark',
            href: '/peers',
            color: 'emerald',
          },
          {
            icon: GitFork,
            label: 'Simulate Rebalancing',
            description: 'Try weight changes in sandbox',
            href: '/simulate',
            color: 'violet',
          },
        ]}
      />

      {/* Holdings table */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-800">
            All Holdings · {holdings.length} stocks
          </h3>
          <InlineHelperText text="Click Peer Compare to benchmark any stock" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                {[
                  { label: 'Ticker' },
                  { label: 'Name' },
                  { label: 'Sector' },
                  { label: 'Qty' },
                  { label: 'Avg Cost' },
                  { label: 'CMP' },
                  { label: 'Market Value' },
                  { label: 'P&L' },
                  { label: 'P&L %' },
                  { label: 'Weight %', tooltip: 'The percentage of total portfolio value this holding represents.' },
                ].map(({ label, tooltip }) => (
                  <th key={label} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">
                    <span className="flex items-center gap-1">
                      {label}
                      {tooltip && <TooltipHelp text={tooltip} />}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {holdings.map((h) => (
                <tr key={h.ticker} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs font-bold text-indigo-700 whitespace-nowrap">{h.ticker}</td>
                  <td className="px-4 py-3 text-xs text-slate-700 max-w-[160px] truncate">{h.name}</td>
                  <td className="px-4 py-3">
                    <span
                      className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium text-white"
                      style={{ backgroundColor: SECTOR_COLORS[h.sector ?? ''] ?? DEFAULT_SECTOR_COLOR }}
                    >
                      {h.sector ?? 'Unknown'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600 text-right">{h.quantity}</td>
                  <td className="px-4 py-3 text-xs text-slate-600 text-right">{formatCurrency(h.average_cost)}</td>
                  <td className="px-4 py-3 text-xs font-medium text-slate-700 text-right">
                    {h.current_price ? formatCurrency(h.current_price) : '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-700 text-right font-medium">
                    {h.market_value ? formatCurrency(h.market_value) : '—'}
                  </td>
                  <td className={cn('px-4 py-3 text-xs font-semibold text-right', (h.pnl ?? 0) >= 0 ? 'text-gain' : 'text-loss')}>
                    {h.pnl != null ? formatCurrency(h.pnl) : '—'}
                  </td>
                  <td className={cn('px-4 py-3 text-xs font-bold text-right', (h.pnl_pct ?? 0) >= 0 ? 'text-gain' : 'text-loss')}>
                    {h.pnl_pct != null ? formatPct(h.pnl_pct) : '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500 text-right">
                    {h.weight != null ? `${h.weight.toFixed(1)}%` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
