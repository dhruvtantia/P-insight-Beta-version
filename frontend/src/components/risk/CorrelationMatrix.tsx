/**
 * CorrelationMatrix
 * -----------------
 * Renders a colour-coded heatmap of pairwise correlations between holdings.
 *
 * Data shape (from QuantFullResponse.correlation):
 *   tickers:          string[]
 *   matrix:           number[][]   (NxN, diagonal = 1.0)
 *   average_pairwise: number | null
 *   min_pair:         { tickers: [string, string], value: number } | null
 *   max_pair:         { tickers: [string, string], value: number } | null
 *   interpretation:   'low' | 'moderate' | 'high' | 'very_high' | null
 */

'use client'

import { cn } from '@/lib/utils'
import type { CorrelationResult } from '@/types'

// ─── Colour scale ──────────────────────────────────────────────────────────────
// Maps correlation value [-1, 1] → a Tailwind bg colour class.
// We use a diverging red–white–blue scale:
//   -1.0 → deep blue
//    0.0 → white
//   +1.0 → deep red (diagonal)

function corrToStyle(value: number, isDiagonal: boolean): React.CSSProperties {
  if (isDiagonal) {
    return { background: '#6366f1', color: '#fff' }  // indigo for diagonal
  }

  // Clamp to [-1, 1]
  const v = Math.max(-1, Math.min(1, value))

  if (v >= 0) {
    // White → red
    const intensity = v                            // 0 = white, 1 = deep red
    const r = Math.round(255)
    const g = Math.round(255 - intensity * 180)
    const b = Math.round(255 - intensity * 180)
    const textColor = intensity > 0.5 ? '#fff' : '#1e293b'
    return { background: `rgb(${r},${g},${b})`, color: textColor }
  } else {
    // White → blue
    const intensity = -v
    const r = Math.round(255 - intensity * 150)
    const g = Math.round(255 - intensity * 120)
    const b = Math.round(255)
    const textColor = intensity > 0.5 ? '#fff' : '#1e293b'
    return { background: `rgb(${r},${g},${b})`, color: textColor }
  }
}

// ─── Interpretation badge ──────────────────────────────────────────────────────

function InterpretationBadge({ level }: { level: string | null }) {
  if (!level) return null

  const map: Record<string, { label: string; className: string }> = {
    low:       { label: 'Low correlation',       className: 'bg-emerald-100 text-emerald-700' },
    moderate:  { label: 'Moderate correlation',  className: 'bg-amber-100 text-amber-700'    },
    high:      { label: 'High correlation',      className: 'bg-orange-100 text-orange-700'  },
    very_high: { label: 'Very high correlation', className: 'bg-red-100 text-red-700'        },
  }
  const info = map[level]
  if (!info) return null

  return (
    <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-semibold', info.className)}>
      {info.label}
    </span>
  )
}

// ─── Loading skeleton ──────────────────────────────────────────────────────────

function Skeleton({ n }: { n: number }) {
  const size = Math.max(3, Math.min(n, 10))
  return (
    <div className="animate-pulse space-y-1.5">
      {Array.from({ length: size }).map((_, i) => (
        <div key={i} className="flex gap-1.5">
          {Array.from({ length: size }).map((_, j) => (
            <div key={j} className="h-10 flex-1 rounded bg-slate-100" />
          ))}
        </div>
      ))}
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────

interface CorrelationMatrixProps {
  correlation: CorrelationResult | null
  loading:     boolean
  error?:      string | null
}

export function CorrelationMatrix({ correlation, loading, error }: CorrelationMatrixProps) {
  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4">
        <p className="text-sm font-semibold text-red-700">Could not compute correlation matrix</p>
        <p className="text-xs text-red-600 mt-1">{error}</p>
      </div>
    )
  }

  const tickers = correlation?.tickers ?? []
  const matrix  = correlation?.matrix ?? []
  const n       = tickers.length

  // Short ticker labels (strip ".NS", ".BO" suffixes)
  const shortTicker = (t: string) => t.replace(/\.(NS|BO|BSE)$/i, '')

  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
        <div className="h-4 w-4 rounded bg-gradient-to-br from-indigo-400 to-red-300 shrink-0" />
        <h3 className="text-sm font-semibold text-slate-800">Correlation Matrix</h3>
        {!loading && correlation?.interpretation && (
          <div className="ml-auto">
            <InterpretationBadge level={correlation.interpretation} />
          </div>
        )}
      </div>

      <div className="p-5">
        {loading ? (
          <Skeleton n={6} />
        ) : n === 0 ? (
          <div className="py-10 text-center text-sm text-slate-400">
            No correlation data available
          </div>
        ) : (
          <>
            {/* Heatmap grid */}
            <div className="overflow-x-auto">
              <table className="text-[10px] font-mono border-separate border-spacing-0.5 min-w-full">
                <thead>
                  <tr>
                    {/* Empty corner */}
                    <th className="w-14" />
                    {tickers.map((t) => (
                      <th
                        key={t}
                        className="text-center text-[9px] font-semibold text-slate-400 pb-1 whitespace-nowrap px-1"
                      >
                        {shortTicker(t)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tickers.map((rowTicker, i) => (
                    <tr key={rowTicker}>
                      {/* Row label */}
                      <td className="text-[9px] font-semibold text-slate-400 pr-1.5 whitespace-nowrap text-right">
                        {shortTicker(rowTicker)}
                      </td>
                      {/* Cells */}
                      {tickers.map((_, j) => {
                        const val = matrix[i]?.[j] ?? 0
                        const isDiag = i === j
                        const style = corrToStyle(val, isDiag)
                        return (
                          <td key={j} className="p-0">
                            <div
                              title={`${shortTicker(rowTicker)} × ${shortTicker(tickers[j])}: ${val.toFixed(2)}`}
                              className="h-9 w-9 flex items-center justify-center rounded text-[9px] font-bold tabular-nums cursor-default transition-transform hover:scale-110"
                              style={style}
                            >
                              {isDiag ? '1.0' : val.toFixed(2)}
                            </div>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Summary stats */}
            {(correlation?.average_pairwise !== null || correlation?.min_pair || correlation?.max_pair) && (
              <div className="mt-4 grid grid-cols-3 gap-3">
                {correlation?.average_pairwise !== null && correlation?.average_pairwise !== undefined && (
                  <div className="rounded-lg bg-slate-50 px-3 py-2">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">Avg pairwise</p>
                    <p className="text-sm font-bold text-slate-700 tabular-nums">
                      {correlation.average_pairwise.toFixed(2)}
                    </p>
                  </div>
                )}
                {correlation?.min_pair && (
                  <div className="rounded-lg bg-blue-50 px-3 py-2">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-blue-400 mb-0.5">Lowest pair</p>
                    <p className="text-[10px] font-semibold text-blue-700">
                      {correlation.min_pair.tickers.map(shortTicker).join(' × ')}
                    </p>
                    <p className="text-sm font-bold text-blue-800 tabular-nums">
                      {correlation.min_pair.value.toFixed(2)}
                    </p>
                  </div>
                )}
                {correlation?.max_pair && (
                  <div className="rounded-lg bg-red-50 px-3 py-2">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-red-400 mb-0.5">Highest pair</p>
                    <p className="text-[10px] font-semibold text-red-700">
                      {correlation.max_pair.tickers.map(shortTicker).join(' × ')}
                    </p>
                    <p className="text-sm font-bold text-red-800 tabular-nums">
                      {correlation.max_pair.value.toFixed(2)}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Colour scale legend */}
            <div className="mt-4 flex items-center gap-2">
              <span className="text-[9px] text-blue-600 font-semibold">−1.0</span>
              <div
                className="h-2.5 flex-1 rounded-full"
                style={{
                  background: 'linear-gradient(to right, rgb(105,135,255), #fff, rgb(255,75,75))',
                }}
              />
              <span className="text-[9px] text-red-600 font-semibold">+1.0</span>
            </div>
            <p className="text-[10px] text-slate-400 mt-1.5">
              Based on daily returns. Higher correlation = less diversification benefit.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
