/**
 * What Changed Page  (/changes)
 * --------------------------------
 * Full-page view for portfolio history intelligence and snapshot comparison.
 *
 * Central question: "What changed since I bought / started tracking?"
 *
 * Layout (tabs):
 *   [History] — value chart (daily if available, snapshot-based otherwise)
 *              + Since Purchase P&L panel
 *              + sector allocation drift + concentration summary
 *   [Compare] — SnapshotComparisonPanel (per-holding delta table)
 *
 * Data sources:
 *   - usePortfolioHistory → daily portfolio value (pre-computed at upload)
 *     With benchmark overlay (^NSEI normalised to portfolio start value).
 *     Falls back to snapshot-based chart when no daily data exists.
 *     Exposes buildStatus so we can show a "Building history…" banner.
 *   - useSincePurchase    → per-holding P&L vs average purchase price (DB only)
 *   - useSnapshotHistory  → snapshot-level detail for sector drift, concentration
 *   - useSnapshots        → snapshot list for comparison panel
 */

'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  GitCompare, Loader2, AlertTriangle,
  MessageCircle, ArrowRight, Camera,
  BarChart2, TrendingUp, ArrowUpRight, ArrowDownRight,
  Info, Clock, CheckCircle2, XCircle, ChevronDown,
} from 'lucide-react'
import Link from 'next/link'
import { usePortfolioStore }              from '@/store/portfolioStore'
import { usePortfolios }                  from '@/hooks/usePortfolios'
import { useSnapshots }                   from '@/hooks/useSnapshots'
import { useSnapshotHistory }             from '@/hooks/useSnapshotHistory'
import { usePortfolioHistory }            from '@/hooks/usePortfolioHistory'
import { SnapshotComparisonPanel }        from '@/components/portfolio/SnapshotComparisonPanel'
import { PortfolioHistoryChart }          from '@/components/portfolio/PortfolioHistoryChart'
import { SectorHistoryChart }             from '@/components/portfolio/SectorHistoryChart'
import { DiversificationHistoryChart }    from '@/components/portfolio/DiversificationHistoryChart'
import { EvolutionInsights }              from '@/components/portfolio/EvolutionInsights'
import { SECTOR_COLORS, DEFAULT_SECTOR_COLOR } from '@/constants'
import { historyApi }                     from '@/services/api'
import type { SnapshotSummary, SnapshotDetail, SincePurchaseResponse, SincePurchaseHolding } from '@/types'
import { cn }                             from '@/lib/utils'

// ─── useSincePurchase hook (inline) ──────────────────────────────────────────
// Fetches per-holding P&L since average purchase price.
// All data is already in the DB — no extra network calls beyond the API fetch.

function useSincePurchase(portfolioId: number | null) {
  const [data,    setData]    = useState<SincePurchaseResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    if (portfolioId == null) { setData(null); return }
    setLoading(true)
    setError(null)
    try {
      const res = await historyApi.getSincePurchase(portfolioId)
      setData(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load since-purchase data')
    } finally {
      setLoading(false)
    }
  }, [portfolioId])

  useEffect(() => { fetchData() }, [fetchData])
  return { data, loading, error, refetch: fetchData }
}

// ─── History Build Status Banner ─────────────────────────────────────────────
// Shows while the background history-build task is running after upload.
// Disappears once data arrives (hasData becomes true) or stays with an error
// explanation if the build failed.

function HistoryBuildBanner({
  buildStatus,
  buildNote,
}: {
  buildStatus: string | null
  buildNote:   string | null
}) {
  if (!buildStatus || buildStatus === 'done' || buildStatus === 'unknown') return null

  if (buildStatus === 'pending' || buildStatus === 'building') {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-700">
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-indigo-400" />
        <div className="flex-1 min-w-0">
          <span className="font-semibold">Building price history…</span>
          <span className="ml-2 text-indigo-500 text-xs">
            Fetching 1-year daily prices for your holdings. The chart will appear shortly.
          </span>
        </div>
      </div>
    )
  }

  if (buildStatus === 'failed') {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
        <XCircle className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
        <div className="flex-1 min-w-0">
          <span className="font-semibold">History build failed</span>
          {buildNote && (
            <p className="text-xs text-amber-600 mt-0.5">{buildNote}</p>
          )}
          <p className="text-xs text-amber-500 mt-0.5">
            The daily chart requires live price data from Yahoo Finance.
            Snapshot-based comparison is still available.
          </p>
        </div>
      </div>
    )
  }

  return null
}

// ─── Since Purchase Panel ─────────────────────────────────────────────────────
// Per-holding P&L vs average purchase price.
// Uses data already in the DB (no extra fetches at request time).
// Works even with 1 snapshot — answers "how am I doing vs what I paid?"

function fmtCurrency(v: number): string {
  const abs = Math.abs(v)
  if (abs >= 1_00_00_000) return `₹${(v / 1_00_00_000).toFixed(1)}Cr`
  if (abs >= 1_00_000)    return `₹${(v / 1_00_000).toFixed(1)}L`
  if (abs >= 1_000)       return `₹${(v / 1_000).toFixed(1)}K`
  return `₹${v.toFixed(0)}`
}

function SincePurchasePanel({ data }: { data: SincePurchaseResponse }) {
  const [expanded, setExpanded] = useState(false)
  const { summary, holdings } = data

  const hasPnl        = summary.total_pnl !== null
  const totalPnl      = summary.total_pnl ?? 0
  const totalPnlPct   = summary.total_pnl_pct ?? 0
  const isPositive    = totalPnl >= 0

  return (
    <div className="card overflow-hidden">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Since Purchase</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            P&amp;L vs average cost · prices from upload
          </p>
        </div>
        {hasPnl && (
          <div className={cn(
            'text-right',
            isPositive ? 'text-emerald-600' : 'text-red-500',
          )}>
            <p className="text-base font-bold tabular-nums">
              {isPositive ? '+' : ''}{fmtCurrency(totalPnl)}
            </p>
            <p className="text-xs font-medium tabular-nums">
              {isPositive ? '+' : ''}{totalPnlPct.toFixed(1)}%
            </p>
          </div>
        )}
      </div>

      {/* ── Summary strip ── */}
      <div className="grid grid-cols-3 divide-x divide-slate-100 border-b border-slate-100">
        <div className="px-4 py-3 text-center">
          <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-0.5">Invested</p>
          <p className="text-sm font-semibold text-slate-800 tabular-nums">
            {fmtCurrency(summary.total_invested)}
          </p>
        </div>
        <div className="px-4 py-3 text-center">
          <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-0.5">Current value</p>
          <p className="text-sm font-semibold text-slate-800 tabular-nums">
            {summary.total_current_value != null ? fmtCurrency(summary.total_current_value) : '—'}
          </p>
        </div>
        <div className="px-4 py-3 text-center">
          <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-0.5">Winners / Losers</p>
          <p className="text-sm font-semibold tabular-nums">
            <span className="text-emerald-600">{summary.winners}↑</span>
            {' / '}
            <span className="text-red-500">{summary.losers}↓</span>
            {summary.flat > 0 && (
              <span className="text-slate-400 ml-1">·{summary.flat}—</span>
            )}
          </p>
        </div>
      </div>

      {/* ── Per-holding table (top 5 + expand) ── */}
      <div>
        {holdings.slice(0, expanded ? holdings.length : 5).map((h: SincePurchaseHolding) => {
          const positive = (h.pnl ?? 0) >= 0
          const hasPrice = h.pnl !== null
          return (
            <div
              key={h.ticker}
              className="flex items-center gap-3 px-5 py-2.5 border-b border-slate-50 last:border-0 hover:bg-slate-50/50"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-800 font-mono">{h.ticker}</span>
                  {h.sector && (
                    <span className="text-[10px] text-slate-400 truncate max-w-[80px]">{h.sector}</span>
                  )}
                </div>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  {h.quantity.toLocaleString('en-IN')} × ₹{h.average_cost.toLocaleString('en-IN')}
                  {h.current_price != null && (
                    <span> → ₹{h.current_price.toLocaleString('en-IN')}</span>
                  )}
                </p>
              </div>

              <div className="shrink-0 text-right">
                {hasPrice ? (
                  <>
                    <p className={cn(
                      'text-xs font-semibold tabular-nums',
                      positive ? 'text-emerald-600' : 'text-red-500',
                    )}>
                      {positive ? '+' : ''}{fmtCurrency(h.pnl!)}
                    </p>
                    <p className={cn(
                      'text-[10px] tabular-nums',
                      positive ? 'text-emerald-500' : 'text-red-400',
                    )}>
                      {positive ? '+' : ''}{(h.pnl_pct ?? 0).toFixed(1)}%
                    </p>
                  </>
                ) : (
                  <p className="text-[10px] text-slate-400">No price</p>
                )}
              </div>
            </div>
          )
        })}

        {/* Expand / collapse */}
        {holdings.length > 5 && (
          <button
            onClick={() => setExpanded(e => !e)}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 text-xs text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50/50 transition-colors"
          >
            <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', expanded ? 'rotate-180' : '')} />
            {expanded ? 'Show less' : `Show all ${holdings.length} holdings`}
          </button>
        )}
      </div>

      {/* ── Price freshness note ── */}
      <div className="px-5 py-2.5 border-t border-slate-100 bg-slate-50/50 flex items-start gap-1.5">
        <Info className="h-3 w-3 shrink-0 text-slate-400 mt-0.5" />
        <p className="text-[10px] text-slate-400">{summary.price_freshness_note}</p>
      </div>
    </div>
  )
}

// ─── Allocation Drift Panel ───────────────────────────────────────────────────

interface DriftRow {
  sector:  string
  before:  number
  after:   number
  delta:   number
}

function AllocationDriftPanel({
  summaries,
  details,
}: {
  summaries: SnapshotSummary[]
  details:   Map<number, SnapshotDetail>
}) {
  const first  = summaries[0]
  const latest = summaries[summaries.length - 1]

  const driftRows = useMemo<DriftRow[]>(() => {
    if (!first || !latest) return []
    const firstDetail  = details.get(first.id)
    const latestDetail = details.get(latest.id)
    if (!firstDetail?.sector_weights || !latestDetail?.sector_weights) return []

    const allSectors = new Set([
      ...Object.keys(firstDetail.sector_weights),
      ...Object.keys(latestDetail.sector_weights),
    ])
    return [...allSectors]
      .map((s): DriftRow => ({
        sector: s,
        before: firstDetail.sector_weights[s]  ?? 0,
        after:  latestDetail.sector_weights[s] ?? 0,
        delta:  (latestDetail.sector_weights[s] ?? 0) - (firstDetail.sector_weights[s] ?? 0),
      }))
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
  }, [first, latest, details])

  if (driftRows.length === 0) return null

  const firstLabel  = first.label  ?? new Date(first.captured_at).toLocaleDateString('en-IN',  { day: 'numeric', month: 'short', year: 'numeric' })
  const latestLabel = latest.label ?? new Date(latest.captured_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Allocation Drift</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Sector weight change from first to latest snapshot
          </p>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-slate-400">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-slate-300 inline-block" />
            {firstLabel}
          </span>
          <span className="text-slate-300">→</span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-indigo-400 inline-block" />
            {latestLabel}
          </span>
        </div>
      </div>

      <div className="divide-y divide-slate-100">
        {driftRows.map((row) => {
          const color   = SECTOR_COLORS[row.sector] ?? DEFAULT_SECTOR_COLOR
          const maxPct  = Math.max(row.before, row.after, 1)
          const isUp    = row.delta > 0.5
          const isDown  = row.delta < -0.5
          return (
            <div key={row.sector} className="px-5 py-3 flex items-center gap-4">
              <div className="flex items-center gap-2 w-40 shrink-0">
                <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: color }} />
                <span className="text-xs text-slate-700 truncate font-medium">{row.sector}</span>
              </div>

              <div className="flex-1 space-y-1.5">
                <div className="flex items-center gap-2">
                  <div className="h-2 rounded-full bg-slate-200 flex-1 overflow-hidden">
                    <div className="h-full rounded-full bg-slate-400 transition-all" style={{ width: `${(row.before / maxPct) * 100}%` }} />
                  </div>
                  <span className="text-[10px] text-slate-400 w-9 text-right tabular-nums">{row.before.toFixed(1)}%</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-2 rounded-full bg-slate-100 flex-1 overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${(row.after / maxPct) * 100}%`, background: color }} />
                  </div>
                  <span className="text-[10px] text-slate-600 w-9 text-right tabular-nums font-semibold">{row.after.toFixed(1)}%</span>
                </div>
              </div>

              <div className={cn(
                'w-16 text-right flex items-center justify-end gap-0.5 text-xs font-semibold tabular-nums',
                isUp   ? 'text-emerald-600' :
                isDown ? 'text-red-500'     : 'text-slate-400',
              )}>
                {isUp   && <ArrowUpRight   className="h-3 w-3 shrink-0" />}
                {isDown && <ArrowDownRight className="h-3 w-3 shrink-0" />}
                {row.delta > 0 ? '+' : ''}{row.delta.toFixed(1)}pp
              </div>
            </div>
          )
        })}
      </div>

      <div className="px-5 py-2.5 border-t border-slate-100 bg-slate-50/50">
        <p className="text-[10px] text-slate-400">
          pp = percentage points. Values show share of total portfolio market value.
          {first.id === latest.id && ' (Only one snapshot — need at least 2 for drift.)'}
        </p>
      </div>
    </div>
  )
}

// ─── Concentration Drift Summary ──────────────────────────────────────────────

function ConcentrationDriftSummary({
  summaries,
  details,
}: {
  summaries: SnapshotSummary[]
  details:   Map<number, SnapshotDetail>
}) {
  const first  = summaries[0]
  const latest = summaries[summaries.length - 1]
  if (!first || !latest || first.id === latest.id) return null

  const firstDetail  = details.get(first.id)
  const latestDetail = details.get(latest.id)
  if (!firstDetail || !latestDetail) return null

  // HHI from risk_metrics (if available) or null
  const firstHHI  = (firstDetail as SnapshotDetail & { risk_metrics?: { hhi?: number } }).risk_metrics?.hhi ?? null
  const latestHHI = (latestDetail as SnapshotDetail & { risk_metrics?: { hhi?: number } }).risk_metrics?.hhi ?? null

  // Top holding weight delta
  const firstTopWeight  = firstDetail.top_holdings?.[0]?.weight  ?? null
  const latestTopWeight = latestDetail.top_holdings?.[0]?.weight ?? null
  const firstTopTicker  = firstDetail.top_holdings?.[0]?.ticker  ?? null
  const latestTopTicker = latestDetail.top_holdings?.[0]?.ticker ?? null

  // Holdings count delta
  const holdingsDelta = (latestDetail.holdings?.length ?? latest.num_holdings) -
                        (firstDetail.holdings?.length  ?? first.num_holdings)

  const hasAny = firstHHI != null || latestHHI != null || firstTopWeight != null

  if (!hasAny && holdingsDelta === 0) return null

  return (
    <div className="card px-5 py-4 space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-slate-800">Concentration Summary</h3>
        <p className="text-xs text-slate-500 mt-0.5">
          How concentrated vs. diversified is the portfolio now vs. then?
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs">
        {/* Holdings count */}
        <div className="space-y-0.5">
          <p className="text-slate-400 text-[10px] uppercase tracking-wide">Holdings</p>
          <p className="font-semibold text-slate-800">
            {first.num_holdings} → {latest.num_holdings}
            {holdingsDelta !== 0 && (
              <span className={cn('ml-1 text-[10px]', holdingsDelta > 0 ? 'text-emerald-600' : 'text-red-500')}>
                ({holdingsDelta > 0 ? '+' : ''}{holdingsDelta})
              </span>
            )}
          </p>
        </div>

        {/* HHI */}
        {firstHHI != null && latestHHI != null && (
          <div className="space-y-0.5">
            <p className="text-slate-400 text-[10px] uppercase tracking-wide">HHI (concentration)</p>
            <p className="font-semibold text-slate-800">
              {firstHHI.toFixed(3)} → {latestHHI.toFixed(3)}
              {Math.abs(latestHHI - firstHHI) > 0.01 && (
                <span className={cn('ml-1 text-[10px]', latestHHI < firstHHI ? 'text-emerald-600' : 'text-amber-600')}>
                  {latestHHI < firstHHI ? '↓ more diversified' : '↑ more concentrated'}
                </span>
              )}
            </p>
          </div>
        )}

        {/* Top holding */}
        {firstTopWeight != null && latestTopWeight != null && (
          <div className="space-y-0.5">
            <p className="text-slate-400 text-[10px] uppercase tracking-wide">Top position</p>
            <p className="font-semibold text-slate-800 text-[11px]">
              {firstTopTicker} {firstTopWeight.toFixed(1)}% → {latestTopTicker} {latestTopWeight.toFixed(1)}%
            </p>
          </div>
        )}
      </div>

      <div className="flex items-start gap-1.5 text-[10px] text-slate-400">
        <Info className="h-3 w-3 shrink-0 mt-0.5" />
        <span>HHI: lower = more diversified (0 = perfectly distributed, 1 = single stock)</span>
      </div>
    </div>
  )
}

// ─── Advisor hint card ────────────────────────────────────────────────────────

function AdvisorHintCard() {
  const questions = [
    'What changed in my portfolio?',
    'Has my diversification improved?',
    'Which holdings increased the most?',
    'How has my portfolio evolved?',
  ]

  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-4">
      <div className="flex items-start gap-3">
        <MessageCircle className="h-5 w-5 text-indigo-500 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-indigo-700 mb-2">
            Ask the advisor about your changes
          </p>
          <div className="flex flex-wrap gap-2">
            {questions.map((q) => (
              <Link
                key={q}
                href={`/advisor?q=${encodeURIComponent(q)}`}
                className="rounded-full border border-indigo-200 bg-white px-3 py-1 text-xs text-indigo-700 hover:bg-indigo-100 transition-colors flex items-center gap-1"
              >
                {q}
                <ArrowRight className="h-3 w-3 shrink-0" />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Tab button ───────────────────────────────────────────────────────────────

function TabBtn({
  active, icon: Icon, label, onClick,
}: {
  active: boolean; icon: React.ElementType; label: string; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors',
        active
          ? 'bg-indigo-600 text-white shadow-sm'
          : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50',
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Tab = 'history' | 'compare'

export default function ChangesPage(): React.ReactElement {
  const [tab, setTab] = useState<Tab>('history')

  const { activePortfolioId } = usePortfolioStore()
  const { portfolios, loading: portfolioLoading } = usePortfolios()
  const activePortfolio = portfolios.find((p) => p.id === activePortfolioId)

  // Snapshot-based data (comparison panel + sector drift charts)
  const {
    snapshots,
    loading: snapsLoading,
    error:   snapsError,
    createSnapshot,
  } = useSnapshots(activePortfolioId)

  const {
    summaries,
    details,
    loading:        histLoading,
    detailsLoading,
  } = useSnapshotHistory(activePortfolioId)

  // Daily portfolio history (pre-computed at upload) + build status
  const {
    points:      dailyPoints,
    benchmark:   benchmarkPoints,
    hasData:     hasDailyData,
    note:        dailyNote,
    loading:     dailyLoading,
    buildStatus,
    buildNote,
  } = usePortfolioHistory(activePortfolioId)

  // Since-purchase P&L (uses DB avg_cost + current_price — no extra fetches)
  const {
    data:    sincePurchaseData,
    loading: sincePurchaseLoading,
  } = useSincePurchase(activePortfolioId)

  const [creating,    setCreating]    = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const handleCreate = async () => {
    setCreating(true)
    setCreateError(null)
    try {
      await createSnapshot()
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Failed to create snapshot')
    } finally {
      setCreating(false)
    }
  }

  const isLoading = portfolioLoading || snapsLoading || histLoading || dailyLoading

  return (
    <div className="max-w-5xl space-y-6">

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <GitCompare className="h-5 w-5 text-indigo-500" />
            What Changed
          </h1>
          {activePortfolio ? (
            <p className="text-sm text-slate-500 mt-1 flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-slate-700">{activePortfolio.name}</span>
              <span>· {snapshots.length} snapshot{snapshots.length !== 1 ? 's' : ''}</span>
              {hasDailyData && (
                <span className="text-[11px] text-teal-600 font-medium flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  {dailyPoints.length} days of price history
                </span>
              )}
              {!hasDailyData && (buildStatus === 'pending' || buildStatus === 'building') && (
                <span className="text-[11px] text-indigo-500 font-medium flex items-center gap-1">
                  <Clock className="h-3 w-3 animate-pulse" />
                  Building history…
                </span>
              )}
              {!hasDailyData && buildStatus === 'failed' && (
                <span className="text-[11px] text-amber-600 font-medium flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  History unavailable
                </span>
              )}
            </p>
          ) : (
            <p className="text-sm text-slate-500 mt-1">
              No active portfolio.{' '}
              <Link href="/portfolios" className="text-indigo-600 hover:underline">Manage portfolios →</Link>
            </p>
          )}
        </div>

        {activePortfolioId !== null && (
          <button
            onClick={handleCreate}
            disabled={creating}
            className="shrink-0 inline-flex items-center gap-2 rounded-lg bg-indigo-600 text-white text-sm font-medium px-3 py-2 hover:bg-indigo-700 transition-colors disabled:opacity-60"
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
            Take Snapshot
          </button>
        )}
      </div>

      {createError && <p className="text-sm text-rose-500">{createError}</p>}

      {/* ── Tabs ─────────────────────────────────────────────────────────── */}
      {activePortfolioId !== null && (
        <div className="flex items-center gap-2">
          <TabBtn active={tab === 'history'} icon={TrendingUp} label="History" onClick={() => setTab('history')} />
          <TabBtn active={tab === 'compare'} icon={BarChart2} label="Compare Snapshots" onClick={() => setTab('compare')} />
        </div>
      )}

      {/* ── Loading ───────────────────────────────────────────────────────── */}
      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-slate-400 justify-center py-8">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading portfolio data…
        </div>
      )}

      {/* ── Error ────────────────────────────────────────────────────────── */}
      {snapsError && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {snapsError}
        </div>
      )}

      {/* ── No portfolio ──────────────────────────────────────────────────── */}
      {!portfolioLoading && activePortfolioId === null && (
        <div className="rounded-xl border-2 border-dashed border-slate-200 py-16 text-center">
          <GitCompare className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-500">No portfolio selected</p>
          <p className="text-xs text-slate-400 mt-1 mb-4">Activate a portfolio to view its history.</p>
          <Link href="/portfolios" className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:underline">
            Go to Portfolios <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          TAB: HISTORY
      ════════════════════════════════════════════════════════════════════ */}
      {!isLoading && activePortfolioId !== null && tab === 'history' && (
        <div className="space-y-6">

          {/* ── History build status banner ─────────────────────────────────
              Shown while the background task is still running after upload.
              Disappears once data arrives or after a definitive fail.          */}
          {!hasDailyData && (
            <HistoryBuildBanner buildStatus={buildStatus} buildNote={buildNote} />
          )}

          {/* ── No snapshots + no history ────────────────────────────────── */}
          {summaries.length === 0 && !hasDailyData &&
            buildStatus !== 'pending' && buildStatus !== 'building' && (
            <div className="rounded-xl border-2 border-dashed border-slate-200 py-16 text-center">
              <Camera className="h-10 w-10 text-slate-300 mx-auto mb-3" />
              <p className="text-sm font-semibold text-slate-600 mb-1">No snapshots yet</p>
              <p className="text-xs text-slate-400 max-w-xs mx-auto mb-5">
                Snapshots capture your portfolio state at a point in time.
                Take your first snapshot now, then return to track what changed.
              </p>
              <button
                onClick={handleCreate}
                disabled={creating}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 text-white text-sm font-medium px-4 py-2 hover:bg-indigo-700 transition-colors disabled:opacity-60"
              >
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                Take First Snapshot
              </button>
            </div>
          )}

          {/* ── Since Purchase P&L ─────────────────────────────────────────
              Shown as soon as portfolio data is available — no snapshots
              required. Answers "how am I doing vs what I paid?" using
              avg_cost and current_price already stored in the DB.            */}
          {!sincePurchaseLoading && sincePurchaseData && sincePurchaseData.holdings.length > 0 && (
            <SincePurchasePanel data={sincePurchaseData} />
          )}

          {/* ── Daily history chart ─────────────────────────────────────── */}
          {hasDailyData && (
            <PortfolioHistoryChart
              snapshots={summaries}
              dailyPoints={dailyPoints}
              benchmarkPoints={benchmarkPoints}
              dailyNote={dailyNote}
            />
          )}

          {/* Snapshot-based chart fallback — only when no daily data but ≥2 snapshots */}
          {!hasDailyData && summaries.length >= 2 && (
            <PortfolioHistoryChart snapshots={summaries} />
          )}

          {/* Need more snapshots notice — only when no daily data, <2 snaps, and not building */}
          {!hasDailyData && summaries.length === 1 &&
            buildStatus !== 'pending' && buildStatus !== 'building' && (
            <div className="rounded-xl border-2 border-dashed border-slate-200 py-12 text-center">
              <TrendingUp className="h-8 w-8 text-slate-300 mx-auto mb-3" />
              <p className="text-sm font-medium text-slate-500">Need at least 2 snapshots for history charts</p>
              <p className="text-xs text-slate-400 mt-1">You have 1 snapshot. Make changes, then take another.</p>
            </div>
          )}

          {/* ── Snapshot-dependent panels — require ≥2 snapshots ─────────── */}
          {summaries.length >= 2 && (
            <>
              {/* Evolution insights */}
              <EvolutionInsights summaries={summaries} details={details} />

              {/* Sector + diversification charts */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                <SectorHistoryChart
                  summaries={summaries}
                  details={details}
                  detailsLoading={detailsLoading}
                />
                <DiversificationHistoryChart summaries={summaries} details={details} />
              </div>

              {/* Allocation drift */}
              <AllocationDriftPanel summaries={summaries} details={details} />

              {/* Concentration drift */}
              <ConcentrationDriftSummary summaries={summaries} details={details} />
            </>
          )}

          {/* Advisor hints — show when there's something to analyse */}
          {(summaries.length >= 1 || hasDailyData || sincePurchaseData) && <AdvisorHintCard />}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          TAB: COMPARE SNAPSHOTS
      ════════════════════════════════════════════════════════════════════ */}
      {!isLoading && activePortfolioId !== null && tab === 'compare' && (
        <div className="space-y-6">
          <SnapshotComparisonPanel snapshots={snapshots} />
          {snapshots.length >= 2 && <AdvisorHintCard />}
        </div>
      )}

    </div>
  )
}
