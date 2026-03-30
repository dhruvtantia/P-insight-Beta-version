/**
 * Peer Comparison Page — Phase 1
 * --------------------------------
 * Layout:
 *   1. Page header (title + description + data-mode note)
 *   2. PeerSelector     — pick a portfolio holding to analyse
 *   3. RelativeValuationSummary — insight pills (rank vs peers)
 *   4. Company cards strip — CompanyComparisonCard × (1 selected + N peers)
 *   5. PeerComparisonTable — full 13-metric side-by-side table
 *
 * Data flow:
 *   usePortfolio()       → holdings[] → PeerSelector (ticker options)
 *   usePeerComparison()  → data { selected, peers } → all display components
 *
 * Architecture notes for Phase 2:
 *   - Add a live data toggle; swap MockDataProvider with yfinance/FMP provider.
 *   - "Add to Portfolio" CTA in CompanyComparisonCard for what-if analysis.
 *   - Persist selectedTicker in URL query params for shareable links.
 */

'use client'

import { useState, useMemo, useEffect }   from 'react'
import { useSearchParams }                from 'next/navigation'
import { GitCompareArrows, AlertCircle,
         RefreshCw, Info }                from 'lucide-react'
import { usePortfolio }                   from '@/hooks/usePortfolio'
import { usePeerComparison }              from '@/hooks/usePeerComparison'
import { PeerSelector }                   from '@/components/peers/PeerSelector'
import { CompanyComparisonCard }          from '@/components/peers/CompanyComparisonCard'
import { PeerComparisonTable }            from '@/components/peers/PeerComparisonTable'
import { RelativeValuationSummary }       from '@/components/peers/RelativeValuationSummary'
import { cn }                             from '@/lib/utils'

export default function PeersPage() {
  // ── Portfolio holdings (for PeerSelector options) ─────────────────────────
  const { holdings, loading: holdingsLoading } = usePortfolio()

  // ── URL query param pre-selection ────────────────────────────────────────
  const searchParams  = useSearchParams()
  const tickerParam   = searchParams.get('ticker')?.toUpperCase() ?? null

  // ── Selected ticker state ─────────────────────────────────────────────────
  const [selectedTicker, setSelectedTicker] = useState<string | null>(tickerParam)

  // When URL param changes (e.g. navigating from HoldingsTable), update state
  useEffect(() => {
    if (tickerParam) setSelectedTicker(tickerParam)
  }, [tickerParam])

  // Auto-select first holding once portfolio loads (only if nothing pre-selected)
  const autoSelected = useMemo(() => {
    if (selectedTicker) return selectedTicker
    return holdings.length > 0 ? holdings[0].ticker : null
  }, [selectedTicker, holdings])

  // ── Peer comparison data ──────────────────────────────────────────────────
  const { data, loading, error, refetch } = usePeerComparison(autoSelected)

  // Ticker options for selector
  const tickerOptions = useMemo(
    () => holdings.map((h) => ({ ticker: h.ticker, name: h.name })),
    [holdings]
  )

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 max-w-[1400px]">

      {/* ── 1. Page header ──────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <GitCompareArrows className="h-5 w-5 text-violet-500" />
            <h1 className="text-lg font-bold text-slate-900">Peer Comparison</h1>
          </div>
          <p className="text-sm text-slate-500">
            Compare any holding against its industry peers across valuation, quality,
            growth, and leverage metrics.
          </p>
        </div>

        <button
          onClick={refetch}
          disabled={loading || !autoSelected}
          className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white
                     px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50
                     disabled:opacity-40 transition-colors shrink-0"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {/* ── Data mode note ───────────────────────────────────────────────── */}
      <div className="flex items-start gap-2 rounded-lg border border-slate-100 bg-slate-50 px-4 py-3">
        <Info className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
        <p className="text-xs text-slate-500">
          <span className="font-semibold text-slate-600">Mock data mode.</span>{' '}
          Peer fundamentals are static reference values for development and demo.
          Live data via yfinance / FMP will be added in Phase 2.
        </p>
      </div>

      {/* ── Error ────────────────────────────────────────────────────────── */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-red-700">Failed to load peer data</p>
              <p className="text-xs text-red-600 mt-0.5">{error}</p>
              <button
                onClick={refetch}
                className="mt-2 text-xs font-medium text-red-700 hover:text-red-900 underline"
              >
                Retry
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 2. Stock selector ───────────────────────────────────────────── */}
      {holdingsLoading ? (
        <div className="card px-5 py-4">
          <div className="h-3 w-48 rounded bg-slate-200 animate-pulse mb-3" />
          <div className="flex gap-2">
            {[1,2,3,4].map((i) => (
              <div key={i} className="h-7 w-24 rounded-full bg-slate-200 animate-pulse" />
            ))}
          </div>
        </div>
      ) : (
        <PeerSelector
          tickers={tickerOptions}
          selected={autoSelected}
          onChange={setSelectedTicker}
          loading={loading}
        />
      )}

      {/* ── Content: show once we have data ─────────────────────────────── */}
      {loading && !data ? (
        <TableSkeleton />
      ) : data ? (
        <>
          {/* ── 3. Relative valuation summary (insight pills) ─────────── */}
          {data.peers.length > 0 && (
            <RelativeValuationSummary
              selected={data.selected}
              peers={data.peers}
            />
          )}

          {/* ── 4. Company comparison cards ───────────────────────────── */}
          {data.peers.length > 0 ? (
            <div className="flex gap-3 overflow-x-auto pb-1">
              <CompanyComparisonCard stock={data.selected} isSelected />
              {data.peers.map((peer) => (
                <CompanyComparisonCard key={peer.ticker} stock={peer} />
              ))}
            </div>
          ) : (
            <NoPeersState ticker={autoSelected ?? ''} />
          )}

          {/* ── 5. Full comparison table ──────────────────────────────── */}
          {data.peers.length > 0 && (
            <PeerComparisonTable
              selected={data.selected}
              peers={data.peers}
            />
          )}
        </>
      ) : !autoSelected ? (
        <EmptySelectState />
      ) : null}

    </div>
  )
}

// ─── Empty / placeholder states ───────────────────────────────────────────────

function EmptySelectState() {
  return (
    <div className="card px-6 py-12 text-center">
      <GitCompareArrows className="mx-auto h-10 w-10 text-slate-200 mb-3" />
      <p className="text-sm font-semibold text-slate-500">Select a holding above</p>
      <p className="text-xs text-slate-400 mt-1">
        Choose any stock from your portfolio to see how it compares against industry peers.
      </p>
    </div>
  )
}

function NoPeersState({ ticker }: { ticker: string }) {
  const base = ticker.replace(/\.(NS|BSE|BO)$/i, '')
  return (
    <div className="card px-6 py-10 text-center">
      <p className="text-sm font-semibold text-slate-500">No peers configured for {base}</p>
      <p className="text-xs text-slate-400 mt-1">
        Add entries to the <code className="bg-slate-100 px-1 rounded">peer_map</code> in{' '}
        <code className="bg-slate-100 px-1 rounded">mock_provider.py</code> to enable comparison.
      </p>
    </div>
  )
}

function TableSkeleton() {
  return (
    <div className="space-y-4">
      {/* Card strip skeleton */}
      <div className="flex gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="card flex-1 min-w-[160px] p-4 animate-pulse">
            <div className="h-3 w-16 rounded bg-slate-200 mb-2" />
            <div className="h-4 w-24 rounded bg-slate-200 mb-4" />
            <div className="grid grid-cols-2 gap-2">
              {[1,2,3,4].map((j) => (
                <div key={j} className="h-3 rounded bg-slate-100" />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Table skeleton */}
      <div className="card overflow-hidden animate-pulse">
        <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
          <div className="h-3 w-32 rounded bg-slate-200" />
        </div>
        {[1,2,3,4,5,6].map((i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-3 border-b border-slate-50">
            <div className="h-3 w-32 rounded bg-slate-200 shrink-0" />
            {[1,2,3,4].map((j) => (
              <div key={j} className="h-3 flex-1 rounded bg-slate-100" />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
