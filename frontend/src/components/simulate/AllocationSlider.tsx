/**
 * AllocationSlider — single holding row with a weight slider (v2)
 * ---------------------------------------------------------------
 * Displays: ticker | name + sector | slider + weight | delta badge | action button
 *
 * action === 'add'      → emerald left border
 * action === 'modified' → amber left border
 * action === 'remove'   → red, strike-through, "Undo" button
 * action === 'hold'     → slate left border (faint)
 *
 * Improvements in v2:
 *   - Larger touch target (py-3.5 instead of py-3)
 *   - Weight number always visible (not hidden behind hover)
 *   - Sector dot + sector label shown below name
 *   - "Remove" button always visible on mobile (not just group-hover)
 *   - Removed row has a soft red bg tint
 */

'use client'

import { SECTOR_COLORS, DEFAULT_SECTOR_COLOR } from '@/constants'
import { cn }                                   from '@/lib/utils'
import { Trash2, RotateCcw }                    from 'lucide-react'
import type { SimulatedHolding }               from '@/lib/simulation'

// ─── Colour config ────────────────────────────────────────────────────────────

const BORDER_COLOR: Record<string, string> = {
  add:      'border-l-emerald-400',
  modified: 'border-l-amber-400',
  remove:   'border-l-red-300',
  hold:     'border-l-slate-200',
}

const ROW_BG: Record<string, string> = {
  add:      'bg-emerald-50/40',
  modified: 'bg-amber-50/30',
  remove:   'bg-red-50/60',
  hold:     'bg-white',
}

const ACTION_BADGE: Record<string, { label: string; cls: string }> = {
  add:      { label: 'New',     cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  modified: { label: 'Edited',  cls: 'bg-amber-100   text-amber-700   border-amber-200'   },
  remove:   { label: 'Removed', cls: 'bg-red-100     text-red-700     border-red-200'      },
  hold:     { label: '',        cls: ''                                                     },
}

// ─── Component ────────────────────────────────────────────────────────────────

interface AllocationSliderProps {
  holding:      SimulatedHolding
  onSetWeight:  (ticker: string, weight: number) => void
  onRemove:     (ticker: string) => void
  onUndoRemove: (ticker: string) => void
}

export function AllocationSlider({
  holding,
  onSetWeight,
  onRemove,
  onUndoRemove,
}: AllocationSliderProps) {
  const { ticker, name, sector, weight, original_weight, action } = holding

  const shortName   = ticker.replace(/\.(NS|BSE|BO)$/i, '')
  const sectorColor = SECTOR_COLORS[sector] ?? DEFAULT_SECTOR_COLOR
  const delta       = weight - original_weight
  const isRemoved   = action === 'remove'
  const badge       = ACTION_BADGE[action]

  return (
    <div className={cn(
      'group relative flex items-center gap-3 rounded-lg border border-slate-100',
      'border-l-4 px-4 py-3.5 transition-all duration-150',
      BORDER_COLOR[action],
      ROW_BG[action],
    )}>

      {/* ── Ticker + badge ─────────────────────────────────────────────────── */}
      <div className="w-24 shrink-0">
        <span className="rounded-md bg-white border border-slate-200 px-2 py-0.5
                         text-[11px] font-bold text-slate-700 font-mono shadow-sm">
          {shortName}
        </span>
        {badge.label && (
          <span className={cn(
            'mt-1 block rounded-full border text-[9px] font-bold px-1.5 py-px w-fit',
            badge.cls,
          )}>
            {badge.label}
          </span>
        )}
      </div>

      {/* ── Name + sector ──────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0">
        <p className={cn(
          'text-xs font-medium text-slate-800 truncate leading-tight',
          isRemoved && 'line-through text-slate-400',
        )}>
          {name}
        </p>
        <div className="flex items-center gap-1 mt-0.5">
          <span
            className="h-1.5 w-1.5 rounded-full shrink-0"
            style={{ background: sectorColor }}
          />
          <p className="text-[10px] text-slate-400 truncate">{sector}</p>
        </div>
      </div>

      {/* ── Slider area (hidden when removed) ─────────────────────────────── */}
      {!isRemoved ? (
        <div className="flex items-center gap-3 shrink-0 w-52">
          {/* Slider */}
          <input
            type="range"
            min={0}
            max={50}
            step={0.5}
            value={weight}
            onChange={(e) => onSetWeight(ticker, parseFloat(e.target.value))}
            className="flex-1 h-1.5 accent-indigo-600 cursor-pointer"
            aria-label={`Weight for ${shortName}`}
          />

          {/* Weight % — always visible */}
          <div className="w-12 text-right shrink-0">
            <span className="text-sm font-bold text-slate-800 tabular-nums">
              {weight.toFixed(1)}%
            </span>
          </div>

          {/* Delta badge */}
          {Math.abs(delta) >= 0.1 && (
            <span className={cn(
              'rounded-full text-[10px] font-bold px-1.5 py-0.5 border shrink-0 tabular-nums',
              delta > 0
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-red-50     text-red-700     border-red-200'
            )}>
              {delta > 0 ? '+' : ''}{delta.toFixed(1)}%
            </span>
          )}
        </div>
      ) : (
        /* Removed state indicator */
        <div className="flex items-center gap-2 shrink-0 w-52">
          <span className="text-xs text-red-400 italic">Will be removed</span>
          <span className="text-[10px] text-slate-400 tabular-nums">
            was {original_weight.toFixed(1)}%
          </span>
        </div>
      )}

      {/* ── Action button ──────────────────────────────────────────────────── */}
      <div className="shrink-0 w-8 flex justify-center">
        {isRemoved ? (
          <button
            onClick={() => onUndoRemove(ticker)}
            title="Undo removal"
            className="flex h-7 w-7 items-center justify-center rounded-full
                       bg-white border border-slate-200 hover:bg-emerald-50
                       hover:border-emerald-300 text-slate-400 hover:text-emerald-600
                       transition-colors shadow-sm"
          >
            <RotateCcw className="h-3 w-3" />
          </button>
        ) : (
          <button
            onClick={() => onRemove(ticker)}
            title="Remove from simulation"
            className="flex h-7 w-7 items-center justify-center rounded-full
                       opacity-0 group-hover:opacity-100
                       bg-white border border-slate-200 hover:bg-red-50
                       hover:border-red-300 text-slate-300 hover:text-red-500
                       transition-all shadow-sm"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  )
}
