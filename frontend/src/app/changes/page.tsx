/**
 * What Changed Page  (/changes)
 * --------------------------------
 * Full-page view for portfolio history intelligence and snapshot comparison.
 *
 * Layout (tabs):
 *   [History] — 3 charts (value, sectors, diversification) + evolution insights
 *   [Compare] — SnapshotComparisonPanel (existing per-holding delta table)
 *
 * Top area always shows:
 *   - Active portfolio name and snapshot count
 *   - Take Snapshot button
 */

'use client'

import React, { useState } from 'react'
import {
  GitCompare, Loader2, AlertTriangle,
  MessageCircle, ArrowRight, Camera,
  BarChart2, TrendingUp,
} from 'lucide-react'
import Link from 'next/link'
import { usePortfolioStore }              from '@/store/portfolioStore'
import { usePortfolios }                  from '@/hooks/usePortfolios'
import { useSnapshots }                   from '@/hooks/useSnapshots'
import { useSnapshotHistory }             from '@/hooks/useSnapshotHistory'
import { SnapshotComparisonPanel }        from '@/components/portfolio/SnapshotComparisonPanel'
import { PortfolioHistoryChart }          from '@/components/portfolio/PortfolioHistoryChart'
import { SectorHistoryChart }             from '@/components/portfolio/SectorHistoryChart'
import { DiversificationHistoryChart }    from '@/components/portfolio/DiversificationHistoryChart'
import { EvolutionInsights }              from '@/components/portfolio/EvolutionInsights'
import { cn }                             from '@/lib/utils'

// ─── Advisor suggestion strip ─────────────────────────────────────────────────

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
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active:   boolean
  icon:     React.ElementType
  label:    string
  onClick:  () => void
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

  // For comparison panel — uses snapshots hook (newest-first order for selector)
  const {
    snapshots,
    loading: snapsLoading,
    error:   snapsError,
    createSnapshot,
  } = useSnapshots(activePortfolioId)

  // For history charts — uses history hook (oldest-first order + details)
  const {
    summaries,
    details,
    loading:        histLoading,
    detailsLoading,
  } = useSnapshotHistory(activePortfolioId)

  const [creating,     setCreating]     = useState(false)
  const [createError,  setCreateError]  = useState<string | null>(null)

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

  const isLoading = portfolioLoading || snapsLoading || histLoading

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
            <p className="text-sm text-slate-500 mt-1">
              <span className="font-semibold text-slate-700">{activePortfolio.name}</span>
              {' '}· {snapshots.length} snapshot{snapshots.length !== 1 ? 's' : ''}
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
          <TabBtn
            active={tab === 'history'}
            icon={TrendingUp}
            label="History"
            onClick={() => setTab('history')}
          />
          <TabBtn
            active={tab === 'compare'}
            icon={BarChart2}
            label="Compare Snapshots"
            onClick={() => setTab('compare')}
          />
        </div>
      )}

      {/* ── Loading ───────────────────────────────────────────────────────── */}
      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-slate-400 justify-center py-8">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading snapshot data…
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
          <p className="text-xs text-slate-400 mt-1 mb-4">
            Activate a portfolio to view its history.
          </p>
          <Link
            href="/portfolios"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:underline"
          >
            Go to Portfolios <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          TAB: HISTORY
      ════════════════════════════════════════════════════════════════════ */}
      {!isLoading && activePortfolioId !== null && tab === 'history' && (
        <div className="space-y-6">

          {summaries.length === 0 && (
            <div className="rounded-xl border-2 border-dashed border-slate-200 py-16 text-center">
              <Camera className="h-10 w-10 text-slate-300 mx-auto mb-3" />
              <p className="text-sm font-semibold text-slate-600 mb-1">No snapshots yet</p>
              <p className="text-xs text-slate-400 max-w-xs mx-auto mb-5">
                Snapshots capture your portfolio state at a point in time. Take your first snapshot now, then come back after making changes to track what evolved.
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

          {summaries.length === 1 && (
            <div className="rounded-xl border-2 border-dashed border-slate-200 py-12 text-center">
              <TrendingUp className="h-8 w-8 text-slate-300 mx-auto mb-3" />
              <p className="text-sm font-medium text-slate-500">Need at least 2 snapshots for history charts</p>
              <p className="text-xs text-slate-400 mt-1">
                You have 1 snapshot. Make some portfolio changes, then take another snapshot.
              </p>
            </div>
          )}

          {summaries.length >= 2 && (
            <>
              {/* Evolution insights */}
              <EvolutionInsights summaries={summaries} details={details} />

              {/* Portfolio value chart */}
              <PortfolioHistoryChart snapshots={summaries} />

              {/* Sector + diversification side by side */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                <SectorHistoryChart
                  summaries={summaries}
                  details={details}
                  detailsLoading={detailsLoading}
                />
                <DiversificationHistoryChart
                  summaries={summaries}
                  details={details}
                />
              </div>

              {/* Advisor hints */}
              <AdvisorHintCard />
            </>
          )}
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
