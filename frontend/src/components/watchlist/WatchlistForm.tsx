'use client'

/**
 * WatchlistForm — rich add-item form
 * ------------------------------------
 * Fields: ticker (required), name, tag (select), sector (text), target price, notes
 *
 * Design choices:
 *   - Two-row layout: primary fields (ticker + name + tag) on row 1, secondary on row 2
 *   - Tag shown as a scrollable button group rather than a dropdown — quick selection
 *   - Target price prefixed with ₹ symbol
 *   - Error displayed inline below the submit button (not as a toast)
 *   - Submission is disabled while ticker is empty OR while parent is processing
 */

import { useState, useRef, useId }          from 'react'
import { Plus, Loader2, X }                  from 'lucide-react'
import { TooltipHelp }                       from '@/components/common/TooltipHelp'
import { WatchlistTagBadge }                 from './WatchlistTagBadge'
import { WATCHLIST_TAGS, SECTOR_COLORS }     from '@/constants'
import type { WatchlistItemInput, WatchlistTag } from '@/types'
import { cn }                                from '@/lib/utils'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SECTOR_OPTIONS = [
  'Information Technology',
  'Financials',
  'Energy',
  'Consumer Staples',
  'Consumer Discretionary',
  'Healthcare',
  'Communication Services',
  'Industrials',
  'Materials',
  'Real Estate',
  'Utilities',
]

const FIELD_BASE =
  'rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 ' +
  'placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 ' +
  'focus:border-indigo-500 disabled:bg-slate-50 disabled:text-slate-400 transition-colors'

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  onAdd:      (payload: WatchlistItemInput) => Promise<void>
  submitting?: boolean
  error?:     string | null
  onClearError?: () => void
}

interface FormState {
  ticker:       string
  name:         string
  tag:          WatchlistTag
  sector:       string
  target_price: string   // keep as string while editing; parse on submit
  notes:        string
}

const DEFAULTS: FormState = {
  ticker:       '',
  name:         '',
  tag:          'General',
  sector:       '',
  target_price: '',
  notes:        '',
}

export function WatchlistForm({ onAdd, submitting = false, error, onClearError }: Props) {
  const [form, setForm]           = useState<FormState>(DEFAULTS)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const tickerRef                 = useRef<HTMLInputElement>(null)
  const formId                    = useId()

  function field<K extends keyof FormState>(key: K) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      onClearError?.()
      setForm((prev) => ({ ...prev, [key]: e.target.value }))
    }
  }

  function selectTag(tag: WatchlistTag) {
    onClearError?.()
    setForm((prev) => ({ ...prev, tag }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.ticker.trim()) return

    const payload: WatchlistItemInput = {
      ticker:       form.ticker.trim().toUpperCase(),
      name:         form.name.trim() || undefined,
      tag:          form.tag,
      sector:       form.sector || undefined,
      target_price: form.target_price ? parseFloat(form.target_price) : undefined,
      notes:        form.notes.trim() || undefined,
    }

    await onAdd(payload)

    // On success the hook throws on error, so reaching here = success
    setForm(DEFAULTS)
    setShowAdvanced(false)
    tickerRef.current?.focus()
  }

  const canSubmit = form.ticker.trim().length > 0 && !submitting

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-4">
        <h3 className="text-sm font-semibold text-slate-800">Add to Watchlist</h3>
      </div>

      <form id={formId} onSubmit={handleSubmit} className="space-y-4">
        {/* ── Row 1: Ticker + Name ─────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
          <div className="sm:col-span-2">
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">
              Ticker <span className="text-red-400">*</span>
            </label>
            <input
              ref={tickerRef}
              value={form.ticker}
              onChange={field('ticker')}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleSubmit(e as any))}
              placeholder="e.g. INFY.NS"
              autoComplete="off"
              spellCheck={false}
              disabled={submitting}
              className={cn(FIELD_BASE, 'w-full font-mono uppercase')}
            />
          </div>

          <div className="sm:col-span-3">
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">
              Company Name <span className="text-slate-300 font-normal normal-case">(optional)</span>
            </label>
            <input
              value={form.name}
              onChange={field('name')}
              placeholder="e.g. Infosys Limited"
              disabled={submitting}
              className={cn(FIELD_BASE, 'w-full')}
            />
          </div>
        </div>

        {/* ── Tag row ──────────────────────────────────────────────────────── */}
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
              Conviction Tag
            </label>
            <TooltipHelp metric="watchlist_tag" position="right" />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {WATCHLIST_TAGS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => selectTag(t as WatchlistTag)}
                className={cn(
                  'rounded-full border px-2.5 py-1 text-xs font-medium transition-all',
                  form.tag === t
                    ? 'ring-2 ring-indigo-500 ring-offset-1 scale-105'
                    : 'opacity-70 hover:opacity-100'
                )}
              >
                <WatchlistTagBadge tag={t as WatchlistTag} size="md" showDot={form.tag === t} />
              </button>
            ))}
          </div>
        </div>

        {/* ── Advanced fields (collapsible) ────────────────────────────────── */}
        <div>
          <button
            type="button"
            onClick={() => setShowAdvanced((p) => !p)}
            className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400 hover:text-slate-600 transition-colors"
          >
            <span
              className={cn(
                'h-3.5 w-3.5 rounded-full border border-slate-300 flex items-center justify-center transition-transform',
                showAdvanced ? 'rotate-45 border-indigo-400 text-indigo-500' : 'text-slate-400'
              )}
            >
              <Plus className="h-2.5 w-2.5" />
            </span>
            {showAdvanced ? 'Hide' : 'Add'} sector, target price & notes
          </button>

          {showAdvanced && (
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Sector */}
              <div>
                <div className="flex items-center gap-1 mb-1">
                  <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Sector</label>
                  <TooltipHelp metric="watchlist_sector" position="top" />
                </div>
                <select
                  value={form.sector}
                  onChange={field('sector')}
                  disabled={submitting}
                  className={cn(FIELD_BASE, 'w-full')}
                >
                  <option value="">Select sector…</option>
                  {SECTOR_OPTIONS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              {/* Target Price */}
              <div>
                <div className="flex items-center gap-1 mb-1">
                  <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Target Price</label>
                  <TooltipHelp metric="target_price" position="top" />
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm select-none">₹</span>
                  <input
                    value={form.target_price}
                    onChange={field('target_price')}
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    disabled={submitting}
                    className={cn(FIELD_BASE, 'w-full pl-7 tabular-nums')}
                  />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={field('notes')}
                  rows={3}
                  placeholder="Why are you watching this stock?"
                  disabled={submitting}
                  className={cn(FIELD_BASE, 'w-full resize-none')}
                />
              </div>
            </div>
          )}
        </div>

        {/* ── Submit row ───────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={!canSubmit}
            className="flex items-center gap-2 rounded-md bg-indigo-600 px-5 py-2
                       text-sm font-medium text-white hover:bg-indigo-700
                       disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
          >
            {submitting
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Plus className="h-4 w-4" />
            }
            {submitting ? 'Adding…' : 'Add to Watchlist'}
          </button>

          {error && (
            <div className="flex items-center gap-2 rounded-md bg-red-50 border border-red-200 px-3 py-1.5">
              <p className="text-xs text-red-600">{error}</p>
              {onClearError && (
                <button type="button" onClick={onClearError} className="text-red-400 hover:text-red-600">
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          )}
        </div>
      </form>
    </div>
  )
}
