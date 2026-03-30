'use client'

/**
 * CompanyComparisonCard — compact at-a-glance card for one company.
 *
 * Shown in a header strip above the comparison table.
 * Highlights 6 key metrics: market cap, P/E, P/B, ROE, revenue growth, div yield.
 *
 * Props:
 *   stock      — PeerStock data for this company
 *   isSelected — true for the "anchor" stock (rendered with indigo border)
 */

import { SECTOR_COLORS, DEFAULT_SECTOR_COLOR } from '@/constants'
import { cn }                                   from '@/lib/utils'
import type { PeerStock }                       from '@/types'

interface Props {
  stock:      PeerStock
  isSelected?: boolean
}

function fmt(val: number | null, suffix = ''): string {
  if (val === null || val === undefined) return '—'
  return `${val.toLocaleString('en-IN', { maximumFractionDigits: 1 })}${suffix}`
}

function fmtMarketCap(val: number | null): string {
  if (!val) return '—'
  if (val >= 1_000_000_000_000) return `₹${(val / 1_000_000_000_000).toFixed(1)}T`
  if (val >= 10_000_000_000)    return `₹${(val / 10_000_000_000).toFixed(0)}K Cr`
  if (val >= 10_000_000)        return `₹${(val / 10_000_000).toFixed(0)} Cr`
  return `₹${val.toLocaleString('en-IN')}`
}

const STATS: Array<{ label: string; key: keyof PeerStock; suffix?: string }> = [
  { label: 'Mkt Cap',    key: 'market_cap' },
  { label: 'P/E',        key: 'pe_ratio' },
  { label: 'P/B',        key: 'pb_ratio' },
  { label: 'ROE',        key: 'roe',             suffix: '%' },
  { label: 'Rev Growth', key: 'revenue_growth',  suffix: '%' },
  { label: 'Div Yield',  key: 'dividend_yield',  suffix: '%' },
]

export function CompanyComparisonCard({ stock, isSelected }: Props) {
  const sectorColor = SECTOR_COLORS[stock.sector ?? ''] ?? DEFAULT_SECTOR_COLOR
  const base = stock.ticker.replace(/\.(NS|BSE|BO)$/i, '')

  return (
    <div
      className={cn(
        'rounded-xl border p-4 flex flex-col gap-3 min-w-[160px] flex-1',
        'transition-shadow',
        isSelected
          ? 'border-indigo-400 bg-indigo-50/60 shadow-sm shadow-indigo-100'
          : 'border-slate-200 bg-white'
      )}
    >
      {/* Header */}
      <div>
        <div className="flex items-center gap-1.5 mb-0.5">
          {isSelected && (
            <span className="text-[9px] font-bold uppercase tracking-wider text-indigo-600 bg-indigo-100 rounded px-1.5 py-0.5">
              Selected
            </span>
          )}
        </div>
        <p className="font-mono font-bold text-[15px] text-indigo-700">{base}</p>
        <p className="text-[11px] text-slate-500 truncate leading-tight mt-0.5">
          {stock.name ?? stock.ticker}
        </p>
        {stock.sector && (
          <span className="inline-flex items-center gap-1 mt-1">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: sectorColor }} />
            <span className="text-[10px] text-slate-400">{stock.sector}</span>
          </span>
        )}
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-2">
        {STATS.map(({ label, key, suffix }) => {
          const raw = stock[key] as number | null
          const display = key === 'market_cap' ? fmtMarketCap(raw) : fmt(raw, suffix)
          return (
            <div key={key}>
              <p className="text-[9px] uppercase tracking-wide text-slate-400 font-semibold">{label}</p>
              <p className={cn(
                'text-xs font-semibold tabular-nums',
                isSelected ? 'text-indigo-700' : 'text-slate-700',
                display === '—' && 'text-slate-300'
              )}>
                {display}
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
