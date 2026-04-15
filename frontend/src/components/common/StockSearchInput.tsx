'use client'

/**
 * StockSearchInput — shared autocomplete ticker search
 * -----------------------------------------------------
 * Used by: WatchlistForm (add to watchlist), SimulationControls (add to sim).
 *
 * Behaviour:
 *   - Filters STOCK_LIST client-side as the user types (ticker prefix → exact →
 *     ticker contains → name substring — scored, best match first)
 *   - Shows a dropdown of up to 8 suggestions
 *   - On selection, calls onSelect(ticker, name, sector)
 *   - If the user types a ticker not in the list and presses Enter,
 *     raw value is passed as-is — allows arbitrary tickers e.g. SMALLCAP.NS
 *   - Keyboard nav: ArrowUp/Down, Enter to commit, Escape to dismiss
 *   - Clear (×) button when value is non-empty
 */

import { useState, useRef, useEffect, useId } from 'react'
import { Search, X }                          from 'lucide-react'
import { STOCK_LIST }                         from '@/data/stockList'
import type { StockSuggestion }               from '@/data/stockList'
import { cn }                                 from '@/lib/utils'

// ─── Props ────────────────────────────────────────────────────────────────────

interface StockSearchInputProps {
  /** Controlled raw input value (usually the ticker string being typed) */
  value:        string
  /** Called on every keystroke — update the controlled value in parent */
  onChange:     (raw: string) => void
  /** Called when a suggestion is selected or raw input is committed (Enter/blur) */
  onSelect:     (ticker: string, name?: string, sector?: string) => void
  placeholder?: string
  disabled?:    boolean
  className?:   string
  autoFocus?:   boolean
}

// ─── Scoring + filtering ──────────────────────────────────────────────────────

const MAX_RESULTS = 8

function filterStocks(query: string): StockSuggestion[] {
  const q = query.trim().toLowerCase()
  if (q.length < 1) return []

  const scored: { s: StockSuggestion; score: number }[] = []

  for (const s of STOCK_LIST) {
    const tickerFull  = s.ticker.toLowerCase()
    const tickerShort = tickerFull.replace(/\.(ns|bo|bse)$/i, '')
    const name        = s.name.toLowerCase()

    let score = 0
    if (tickerFull === q || tickerShort === q) score = 5
    else if (tickerShort.startsWith(q))        score = 4
    else if (tickerFull.startsWith(q))         score = 3
    else if (tickerFull.includes(q))           score = 2
    else if (name.startsWith(q))               score = 2
    else if (name.includes(q))                 score = 1

    if (score > 0) scored.push({ s, score })
  }

  return scored
    .sort((a, b) => b.score - a.score || a.s.ticker.localeCompare(b.s.ticker))
    .slice(0, MAX_RESULTS)
    .map(({ s }) => s)
}

// ─── Component ────────────────────────────────────────────────────────────────

export function StockSearchInput({
  value,
  onChange,
  onSelect,
  placeholder = 'Search ticker or company…',
  disabled    = false,
  className,
  autoFocus   = false,
}: StockSearchInputProps) {
  const [open,      setOpen]      = useState(false)
  const [activeIdx, setActiveIdx] = useState(-1)
  const inputRef  = useRef<HTMLInputElement>(null)
  const listRef   = useRef<HTMLUListElement>(null)
  const id        = useId()

  const suggestions = filterStocks(value)

  // Reset active index whenever suggestions change
  useEffect(() => { setActiveIdx(-1) }, [value])

  // Scroll active item into view
  useEffect(() => {
    if (activeIdx >= 0 && listRef.current) {
      const el = listRef.current.children[activeIdx] as HTMLElement | undefined
      el?.scrollIntoView({ block: 'nearest' })
    }
  }, [activeIdx])

  function commit(s: StockSuggestion) {
    onSelect(s.ticker, s.name, s.sector)
    onChange(s.ticker)
    setOpen(false)
    setActiveIdx(-1)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    const showingDropdown = open && suggestions.length > 0

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!showingDropdown) { setOpen(true); return }
      setActiveIdx((i) => Math.min(i + 1, suggestions.length - 1))
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx((i) => Math.max(i - 1, -1))
      return
    }
    if (e.key === 'Escape') {
      setOpen(false)
      setActiveIdx(-1)
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      if (showingDropdown && activeIdx >= 0 && suggestions[activeIdx]) {
        commit(suggestions[activeIdx])
      } else if (value.trim()) {
        // Raw entry — commit as-is (uppercase)
        onSelect(value.trim().toUpperCase())
        setOpen(false)
      }
    }
  }

  function handleClear(e: React.MouseEvent) {
    e.preventDefault()
    onChange('')
    setOpen(false)
    inputRef.current?.focus()
  }

  const showDropdown = open && suggestions.length > 0

  return (
    <div className={cn('relative', className)}>

      {/* ── Input ── */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />

        <input
          ref={inputRef}
          id={id}
          value={value}
          onChange={(e) => { onChange(e.target.value); setOpen(true) }}
          onFocus={() => { if (value.trim()) setOpen(true) }}
          onBlur={() => setTimeout(() => setOpen(false), 160)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          autoFocus={autoFocus}
          autoComplete="off"
          spellCheck={false}
          className={cn(
            'w-full rounded-md border border-slate-200 bg-white',
            'pl-8 py-2 text-sm text-slate-800 font-mono uppercase',
            'placeholder:normal-case placeholder:text-slate-400 placeholder:font-sans placeholder:text-sm',
            'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500',
            'disabled:bg-slate-50 disabled:text-slate-400',
            'transition-colors',
            value ? 'pr-8' : 'pr-3',
          )}
          aria-autocomplete="list"
          aria-haspopup="listbox"
          aria-expanded={showDropdown}
          aria-controls={showDropdown ? `${id}-listbox` : undefined}
          aria-activedescendant={activeIdx >= 0 ? `${id}-opt-${activeIdx}` : undefined}
        />

        {value && !disabled && (
          <button
            type="button"
            onMouseDown={handleClear}
            tabIndex={-1}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:text-slate-600 transition-colors"
            aria-label="Clear"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* ── Dropdown ── */}
      {showDropdown && (
        <div
          role="listbox"
          id={`${id}-listbox`}
          className="absolute left-0 right-0 top-full z-50 mt-1 rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden"
        >
          <ul ref={listRef} className="max-h-56 overflow-y-auto py-1">
            {suggestions.map((s, idx) => {
              const suffix = s.ticker.match(/\.(NS|BO|BSE)$/i)?.[0] ?? ''
              const short  = s.ticker.replace(/\.(NS|BO|BSE)$/i, '')
              return (
                <li
                  key={s.ticker}
                  id={`${id}-opt-${idx}`}
                  role="option"
                  aria-selected={idx === activeIdx}
                  onMouseDown={(e) => { e.preventDefault(); commit(s) }}
                  onMouseEnter={() => setActiveIdx(idx)}
                  className={cn(
                    'flex items-center gap-2.5 px-3 py-2.5 cursor-pointer transition-colors select-none',
                    idx === activeIdx ? 'bg-indigo-50' : 'hover:bg-slate-50',
                  )}
                >
                  {/* Ticker badge */}
                  <span className="shrink-0 min-w-[56px] rounded bg-slate-100 px-1.5 py-0.5 text-center text-[10px] font-bold font-mono text-slate-700">
                    {short}
                    {suffix && (
                      <span className="ml-px text-slate-400 font-normal">{suffix}</span>
                    )}
                  </span>

                  {/* Name + sector */}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-slate-800 truncate normal-case">{s.name}</p>
                    <p className="text-[10px] text-slate-400 truncate normal-case">{s.sector}</p>
                  </div>
                </li>
              )
            })}
          </ul>

          <div className="border-t border-slate-100 px-3 py-1.5 bg-slate-50/60">
            <p className="text-[10px] text-slate-400">
              Not listed? Type the full ticker and press Enter.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
