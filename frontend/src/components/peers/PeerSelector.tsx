'use client'

/**
 * PeerSelector — lets the user pick which portfolio holding to analyse.
 *
 * Renders a horizontal scrollable chip-row of portfolio tickers.
 * The selected chip is highlighted in indigo.
 *
 * Props:
 *   tickers   — list of { ticker, name } from portfolio holdings
 *   selected  — currently selected ticker (null = none)
 *   onChange  — called when user clicks a chip
 */

import { cn } from '@/lib/utils'

interface TickerOption {
  ticker: string
  name:   string
}

interface Props {
  tickers:  TickerOption[]
  selected: string | null
  onChange: (ticker: string) => void
  loading?: boolean
}

export function PeerSelector({ tickers, selected, onChange, loading }: Props) {
  return (
    <div className="card px-5 py-4">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
        Select a holding to compare against peers
      </p>
      <div className="flex flex-wrap gap-2">
        {tickers.map(({ ticker, name }) => {
          const isActive = selected === ticker
          const base = ticker.replace(/\.(NS|BSE|BO)$/i, '')
          return (
            <button
              key={ticker}
              onClick={() => onChange(ticker)}
              disabled={loading}
              title={name}
              className={cn(
                'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium',
                'transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400',
                'disabled:opacity-40',
                isActive
                  ? 'border-indigo-500 bg-indigo-500 text-white shadow-sm shadow-indigo-200'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-300 hover:text-indigo-700 hover:bg-indigo-50'
              )}
            >
              <span className="font-mono font-bold">{base}</span>
              <span
                className={cn(
                  'hidden sm:inline text-[10px] font-normal truncate max-w-[90px]',
                  isActive ? 'text-indigo-100' : 'text-slate-400'
                )}
              >
                {name}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
