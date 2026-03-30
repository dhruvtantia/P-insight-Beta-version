/**
 * Delta Formatting Helpers (client-side)
 * ----------------------------------------
 * Pure formatting utilities for the PortfolioDelta and HoldingDelta types.
 * No API calls, no state — safe to use anywhere.
 */

import type { HoldingDelta, PortfolioDelta } from '@/types'

// ─── Status helpers ───────────────────────────────────────────────────────────

export type DeltaStatus = HoldingDelta['status']

/** Map a delta status to a human-readable label */
export function statusLabel(status: DeltaStatus): string {
  switch (status) {
    case 'added':     return 'New'
    case 'removed':   return 'Removed'
    case 'increased': return 'Increased'
    case 'decreased': return 'Decreased'
    case 'unchanged': return 'Unchanged'
  }
}

/** Tailwind text-color classes for each delta status */
export function statusColor(status: DeltaStatus): string {
  switch (status) {
    case 'added':     return 'text-emerald-600 dark:text-emerald-400'
    case 'removed':   return 'text-rose-500   dark:text-rose-400'
    case 'increased': return 'text-blue-600   dark:text-blue-400'
    case 'decreased': return 'text-amber-500  dark:text-amber-400'
    case 'unchanged': return 'text-slate-400'
  }
}

/** Tailwind bg classes for a status badge */
export function statusBg(status: DeltaStatus): string {
  switch (status) {
    case 'added':     return 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
    case 'removed':   return 'bg-rose-50    dark:bg-rose-900/30    text-rose-700    dark:text-rose-300'
    case 'increased': return 'bg-blue-50    dark:bg-blue-900/30    text-blue-700    dark:text-blue-300'
    case 'decreased': return 'bg-amber-50   dark:bg-amber-900/30   text-amber-700   dark:text-amber-300'
    case 'unchanged': return 'bg-slate-100  dark:bg-slate-800      text-slate-500   dark:text-slate-400'
  }
}

// ─── Number formatters ────────────────────────────────────────────────────────

/**
 * Format a signed delta percentage change.
 * E.g. 2.3 → "+2.3 pp", -1.1 → "−1.1 pp"
 */
export function formatWeightDelta(delta: number | null | undefined): string {
  if (delta == null) return '—'
  const sign   = delta > 0 ? '+' : delta < 0 ? '−' : ''
  const absVal = Math.abs(delta).toFixed(1)
  return `${sign}${absVal} pp`
}

/**
 * Format a signed value change.
 * E.g. 50000 → "+₹50,000", -12345 → "−₹12,345"
 */
export function formatValueDelta(delta: number | null | undefined, currency = '₹'): string {
  if (delta == null) return '—'
  const sign = delta > 0 ? '+' : delta < 0 ? '−' : ''
  const formatted = Math.abs(delta).toLocaleString('en-IN', {
    maximumFractionDigits: 0,
  })
  return `${sign}${currency}${formatted}`
}

/** Format a percentage (already as a number 0–100). E.g. 23.4 → "23.4%" */
export function formatPct(value: number | null | undefined, decimals = 1): string {
  if (value == null) return '—'
  return `${value.toFixed(decimals)}%`
}

// ─── Summary helpers ──────────────────────────────────────────────────────────

/** How many changes (non-unchanged) are in a delta response? */
export function countChanges(delta: PortfolioDelta): number {
  return delta.holding_deltas.filter((h) => h.status !== 'unchanged').length
}

/** Return only the holdings that changed */
export function changedHoldings(delta: PortfolioDelta): HoldingDelta[] {
  return delta.holding_deltas.filter((h) => h.status !== 'unchanged')
}

/** Return added tickers */
export function addedTickers(delta: PortfolioDelta): string[] {
  return delta.added_tickers
}

/** Return removed tickers */
export function removedTickers(delta: PortfolioDelta): string[] {
  return delta.removed_tickers
}
