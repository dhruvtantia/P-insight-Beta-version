'use client'

/**
 * FundamentalsTable — sortable per-stock fundamentals grid
 * ----------------------------------------------------------
 * Columns grouped into: Valuation / Quality / Growth / Income / Leverage
 * Tooltip help icon on every column header.
 * Null displayed as "—". Color coding via status helpers.
 * Click any column header to sort ascending/descending.
 */

import { useState, useMemo } from 'react'
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TooltipHelp } from '@/components/common/TooltipHelp'
import { SECTOR_COLORS, DEFAULT_SECTOR_COLOR } from '@/constants'
import {
  peStatus, pegStatus, pbStatus, roeStatus, roaStatus,
  marginStatus, growthStatus, dteStatus, divYieldStatus,
  fmtRatio, fmtPct, fmtX, fmtMarketCap,
  STATUS_TEXT,
} from '@/lib/fundamentals'
import type { HoldingWithFundamentals } from '@/types'

// ─── Column definitions ───────────────────────────────────────────────────────

type SortKey = 'ticker' | 'weight' | 'pe' | 'fwd_pe' | 'pb' | 'ev_ebitda' | 'peg'
  | 'roe' | 'roa' | 'op_margin' | 'pr_margin'
  | 'rev_growth' | 'ear_growth'
  | 'div_yield' | 'dte' | 'market_cap'

interface ColDef {
  key: SortKey
  label: string
  tooltip: string
  group: 'identity' | 'valuation' | 'quality' | 'growth' | 'income' | 'leverage'
  getValue: (h: HoldingWithFundamentals) => number | null
  format: (v: number | null) => string
  getStatus: (v: number | null) => { status: string; label: string }
}

const NA = (_v: number | null) => ({ status: 'neutral' as const, label: '' })

const COLUMNS: ColDef[] = [
  // Identity
  {
    key: 'weight', label: 'Weight', tooltip: 'portfolio_weight', group: 'identity',
    getValue: (h) => h.weight ?? null,
    format: (v) => v !== null ? v.toFixed(1) + '%' : '—',
    getStatus: NA,
  },
  // Valuation
  {
    key: 'pe', label: 'P/E', tooltip: 'pe_ratio', group: 'valuation',
    getValue: (h) => h.fundamentals?.pe_ratio ?? null,
    format: fmtX,
    getStatus: peStatus,
  },
  {
    key: 'fwd_pe', label: 'Fwd P/E', tooltip: 'forward_pe', group: 'valuation',
    getValue: (h) => h.fundamentals?.forward_pe ?? null,
    format: fmtX,
    getStatus: peStatus,
  },
  {
    key: 'pb', label: 'P/B', tooltip: 'pb_ratio', group: 'valuation',
    getValue: (h) => h.fundamentals?.pb_ratio ?? null,
    format: fmtX,
    getStatus: pbStatus,
  },
  {
    key: 'ev_ebitda', label: 'EV/EBITDA', tooltip: 'ev_ebitda', group: 'valuation',
    getValue: (h) => h.fundamentals?.ev_ebitda ?? null,
    format: fmtX,
    getStatus: NA,
  },
  {
    key: 'peg', label: 'PEG', tooltip: 'peg_ratio', group: 'valuation',
    getValue: (h) => h.fundamentals?.peg_ratio ?? null,
    format: fmtRatio,
    getStatus: pegStatus,
  },
  // Quality
  {
    key: 'roe', label: 'ROE', tooltip: 'roe', group: 'quality',
    getValue: (h) => h.fundamentals?.roe ?? null,
    format: fmtPct,
    getStatus: roeStatus,
  },
  {
    key: 'roa', label: 'ROA', tooltip: 'roa', group: 'quality',
    getValue: (h) => h.fundamentals?.roa ?? null,
    format: fmtPct,
    getStatus: roaStatus,
  },
  {
    key: 'op_margin', label: 'Op. Margin', tooltip: 'operating_margin', group: 'quality',
    getValue: (h) => h.fundamentals?.operating_margin ?? null,
    format: fmtPct,
    getStatus: marginStatus,
  },
  {
    key: 'pr_margin', label: 'Net Margin', tooltip: 'profit_margin', group: 'quality',
    getValue: (h) => h.fundamentals?.profit_margin ?? null,
    format: fmtPct,
    getStatus: marginStatus,
  },
  // Growth
  {
    key: 'rev_growth', label: 'Rev. Growth', tooltip: 'revenue_growth', group: 'growth',
    getValue: (h) => h.fundamentals?.revenue_growth ?? null,
    format: fmtPct,
    getStatus: growthStatus,
  },
  {
    key: 'ear_growth', label: 'EPS Growth', tooltip: 'earnings_growth', group: 'growth',
    getValue: (h) => h.fundamentals?.earnings_growth ?? null,
    format: fmtPct,
    getStatus: growthStatus,
  },
  // Income
  {
    key: 'div_yield', label: 'Div. Yield', tooltip: 'dividend_yield', group: 'income',
    getValue: (h) => h.fundamentals?.dividend_yield ?? null,
    format: fmtPct,
    getStatus: divYieldStatus,
  },
  // Leverage
  {
    key: 'dte', label: 'D/E', tooltip: 'debt_to_equity', group: 'leverage',
    getValue: (h) => h.fundamentals?.debt_to_equity ?? null,
    format: fmtRatio,
    getStatus: dteStatus,
  },
  {
    key: 'market_cap', label: 'Mkt Cap', tooltip: 'market_cap', group: 'leverage',
    getValue: (h) => h.fundamentals?.market_cap ?? null,
    format: fmtMarketCap,
    getStatus: NA,
  },
]

const GROUP_HEADERS: { key: string; label: string; cols: SortKey[] }[] = [
  { key: 'identity',  label: '',          cols: ['weight']                           },
  { key: 'valuation', label: 'Valuation', cols: ['pe','fwd_pe','pb','ev_ebitda','peg'] },
  { key: 'quality',   label: 'Quality',   cols: ['roe','roa','op_margin','pr_margin'] },
  { key: 'growth',    label: 'Growth',    cols: ['rev_growth','ear_growth']           },
  { key: 'income',    label: 'Income',    cols: ['div_yield']                         },
  { key: 'leverage',  label: 'Leverage',  cols: ['dte','market_cap']                  },
]

// Group header background stripe colors
const GROUP_BG: Record<string, string> = {
  identity:  'bg-white',
  valuation: 'bg-indigo-50/60',
  quality:   'bg-teal-50/60',
  growth:    'bg-emerald-50/60',
  income:    'bg-amber-50/60',
  leverage:  'bg-slate-50/60',
}

const GROUP_TEXT: Record<string, string> = {
  valuation: 'text-indigo-700',
  quality:   'text-teal-700',
  growth:    'text-emerald-700',
  income:    'text-amber-700',
  leverage:  'text-slate-600',
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  holdings: HoldingWithFundamentals[]
  loading?: boolean
}

// ─── Staleness helpers ────────────────────────────────────────────────────────

function formatCacheAge(seconds: number): string {
  if (seconds < 60)  return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m ago`
}

const SOURCE_BADGE: Record<string, { label: string; cls: string }> = {
  yfinance: { label: 'Yahoo Finance', cls: 'bg-indigo-50 text-indigo-600 border-indigo-100' },
  fmp:      { label: 'FMP',           cls: 'bg-amber-50  text-amber-600  border-amber-100'  },
  static:   { label: 'Static',        cls: 'bg-slate-50  text-slate-500  border-slate-200'  },
  unavailable: { label: 'Unavailable', cls: 'bg-red-50 text-red-500 border-red-100'         },
}

export function FundamentalsTable({ holdings, loading = false }: Props) {
  const [sortKey, setSortKey]   = useState<SortKey>('weight')
  const [sortAsc, setSortAsc]   = useState(false)

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc((p) => !p)
    } else {
      setSortKey(key)
      setSortAsc(key === 'ticker')
    }
  }

  const sorted = useMemo(() => {
    if (loading || holdings.length === 0) return []
    const col = COLUMNS.find((c) => c.key === sortKey)
    return [...holdings].sort((a, b) => {
      if (sortKey === 'ticker') {
        const cmp = a.ticker.localeCompare(b.ticker)
        return sortAsc ? cmp : -cmp
      }
      const va = col?.getValue(a) ?? null
      const vb = col?.getValue(b) ?? null
      if (va === null && vb === null) return 0
      if (va === null) return 1
      if (vb === null) return -1
      return sortAsc ? va - vb : vb - va
    })
  }, [holdings, sortKey, sortAsc, loading])

  // ── Loading skeleton ─────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <div className="h-4 w-48 rounded bg-slate-200 animate-pulse" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <tbody>
              {[1,2,3,4,5].map((i) => (
                <tr key={i} className="border-b border-slate-100">
                  {Array.from({ length: 16 }).map((_, j) => (
                    <td key={j} className="px-3 py-3">
                      <div className="h-3 rounded bg-slate-100 animate-pulse" style={{ width: `${40 + (j * 7) % 40}%` }} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  if (sorted.length === 0) return null

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Per-Stock Fundamentals</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Click any column header to sort. Null values (—) indicate metric is not applicable for that business type.
          </p>
        </div>
        <span className="text-[11px] text-slate-400">{sorted.length} holdings</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          {/* ── Group header row ─────────────────────────────────────────── */}
          <thead>
            <tr>
              {/* Sticky ticker column */}
              <th className="sticky left-0 z-10 bg-white px-3 py-2 text-left border-b border-slate-200 min-w-[160px]" />
              {GROUP_HEADERS.map((g) => {
                if (!g.label) return (
                  <th key={g.key} className={cn('px-3 py-2 text-left border-b border-slate-200', GROUP_BG[g.key])} />
                )
                return (
                  <th
                    key={g.key}
                    colSpan={g.cols.length}
                    className={cn(
                      'px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-wide border-b border-slate-200',
                      GROUP_BG[g.key],
                      GROUP_TEXT[g.key] ?? 'text-slate-500'
                    )}
                  >
                    {g.label}
                  </th>
                )
              })}
            </tr>

            {/* ── Column header row ─────────────────────────────────────── */}
            <tr className="bg-slate-50/80">
              {/* Ticker column */}
              <th
                className="sticky left-0 z-10 bg-slate-50 px-3 py-2.5 text-left font-semibold text-slate-600 cursor-pointer
                           whitespace-nowrap border-b border-slate-200 hover:bg-slate-100 transition-colors"
                onClick={() => handleSort('ticker')}
              >
                <span className="flex items-center gap-1">
                  Stock
                  <SortIcon current={sortKey} col="ticker" asc={sortAsc} />
                </span>
              </th>

              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    'px-3 py-2.5 text-right font-semibold text-slate-600 cursor-pointer whitespace-nowrap',
                    'border-b border-slate-200 hover:bg-slate-100 transition-colors',
                    GROUP_BG[col.group]
                  )}
                  onClick={() => handleSort(col.key)}
                >
                  <span className="flex items-center justify-end gap-1">
                    {col.label}
                    <TooltipHelp metric={col.tooltip} position="bottom" />
                    <SortIcon current={sortKey} col={col.key} asc={sortAsc} />
                  </span>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {sorted.map((h, idx) => {
              const sectorColor = SECTOR_COLORS[h.sector ?? ''] ?? DEFAULT_SECTOR_COLOR
              return (
                <tr
                  key={h.ticker}
                  className={cn(
                    'border-b border-slate-100 transition-colors hover:bg-slate-50/80',
                    idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'
                  )}
                >
                  {/* Ticker + name (sticky) */}
                  <td
                    className="sticky left-0 z-10 px-3 py-3 min-w-[160px] bg-inherit whitespace-nowrap"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ background: sectorColor }}
                      />
                      <div>
                        <p className="font-semibold text-slate-800 text-[11px]">
                          {h.ticker.replace(/\.(NS|BSE|BO)$/i, '')}
                        </p>
                        <p className="text-[10px] text-slate-400 truncate max-w-[120px]">{h.name}</p>
                      </div>
                    </div>
                  </td>

                  {/* Metric columns — show "unavailable" row when yfinance has no data */}
                  {(() => {
                    const fundSource = h.fundamentals?.source
                    const isUnavailable = fundSource === 'unavailable'
                    const allNull = !isUnavailable && COLUMNS.filter(c => c.group !== 'identity')
                      .every(c => c.getValue(h) === null)

                    if (isUnavailable || allNull) {
                      return (
                        <>
                          {/* Weight column */}
                          <td className={cn('px-3 py-3 text-right tabular-nums', GROUP_BG['identity'])}>
                            {h.weight != null ? `${h.weight.toFixed(1)}%` : '—'}
                          </td>
                          {/* Span remaining columns with unavailable message */}
                          <td
                            colSpan={COLUMNS.length - 1}
                            className="px-4 py-3 text-[10px] text-slate-400 italic"
                          >
                            Data unavailable from provider
                          </td>
                        </>
                      )
                    }

                    return COLUMNS.map((col) => {
                      const val = col.getValue(h)
                      const { status } = col.getStatus(val)
                      const text = col.format(val)
                      const isNull = val === null

                      return (
                        <td
                          key={col.key}
                          className={cn(
                            'px-3 py-3 text-right tabular-nums',
                            GROUP_BG[col.group],
                            isNull
                              ? 'text-slate-300'
                              : status !== 'neutral'
                                ? STATUS_TEXT[status as keyof typeof STATUS_TEXT]
                                : 'text-slate-700'
                          )}
                        >
                          {text}
                        </td>
                      )
                    })
                  })()}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ── Footer — source transparency ─────────────────────────────────── */}
      <FundamentalsFooter holdings={sorted} />
    </div>
  )
}

function FundamentalsFooter({ holdings }: { holdings: HoldingWithFundamentals[] }) {
  // Collect distinct sources and oldest fetch time across all holdings
  const sources = new Set<string>()
  let oldestAgeSeconds: number | null = null

  for (const h of holdings) {
    const f = h.fundamentals
    if (!f) continue
    const src = f.source ?? 'unknown'
    sources.add(src)
    if (f.cache_age_seconds != null) {
      oldestAgeSeconds = oldestAgeSeconds === null
        ? f.cache_age_seconds
        : Math.max(oldestAgeSeconds, f.cache_age_seconds)
    }
  }

  return (
    <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50 flex flex-wrap items-center gap-3">
      {/* Source badges */}
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-slate-400 shrink-0">Sources:</span>
        {[...sources].map((src) => {
          const badge = SOURCE_BADGE[src] ?? { label: src, cls: 'bg-slate-50 text-slate-500 border-slate-200' }
          return (
            <span
              key={src}
              className={`inline-flex rounded border px-1.5 py-0.5 text-[10px] font-medium ${badge.cls}`}
            >
              {badge.label}
            </span>
          )
        })}
      </div>

      {/* Cache age */}
      {oldestAgeSeconds !== null && (
        <span className={`text-[10px] ${oldestAgeSeconds > 1500 ? 'text-amber-500' : 'text-slate-400'}`}>
          Oldest data: {formatCacheAge(oldestAgeSeconds)}
          {oldestAgeSeconds > 1500 && ' · refreshing soon'}
        </span>
      )}

      <span className="ml-auto text-[10px] text-slate-400">
        Null (—) = metric not applicable for this business type.
        Switch to <strong>Uploaded</strong> or <strong>Live</strong> mode for real data.
      </span>
    </div>
  )
}

// ─── Sort icon ────────────────────────────────────────────────────────────────

function SortIcon({ current, col, asc }: { current: SortKey; col: SortKey; asc: boolean }) {
  if (current !== col) return <ChevronsUpDown className="h-3 w-3 text-slate-300 shrink-0" />
  return asc
    ? <ChevronUp className="h-3 w-3 text-indigo-500 shrink-0" />
    : <ChevronDown className="h-3 w-3 text-indigo-500 shrink-0" />
}
