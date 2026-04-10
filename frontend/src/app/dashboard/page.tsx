/**
 * Dashboard — Clean 4-Section Layout
 * ------------------------------------
 *
 *  ┌─ SECTION 1 — PORTFOLIO SUMMARY ────────────────────────────────────┐
 *  │  Status bar · 4 KPI cards (capital, value, return, daily change)    │
 *  └─────────────────────────────────────────────────────────────────────┘
 *
 *  ┌─ SECTION 2 — ALLOCATION OVERVIEW ──────────────────────────────────┐
 *  │  Sector donut  ·  Top holdings bar  ·  Holdings preview table       │
 *  └─────────────────────────────────────────────────────────────────────┘
 *
 *  ┌─ SECTION 3 — RISK SUMMARY ─────────────────────────────────────────┐
 *  │  Volatility · Sharpe · Beta · Max drawdown · Diversification card   │
 *  └─────────────────────────────────────────────────────────────────────┘
 *
 *  ┌─ SECTION 4 — INSIGHTS ─────────────────────────────────────────────┐
 *  │  Action Center · What Changed strip · Advisor panel                 │
 *  └─────────────────────────────────────────────────────────────────────┘
 */

'use client'

import { useMemo }                         from 'react'
import { useRouter }                       from 'next/navigation'
import {
  RefreshCw, AlertCircle,
  Activity, Brain, PieChart,
  TrendingUp, Upload,
} from 'lucide-react'
import { usePortfolio }                    from '@/hooks/usePortfolio'
import { useDataMode }                     from '@/hooks/useDataMode'
import { useFilterStore }                  from '@/store/filterStore'
import { PortfolioSummaryCards }           from '@/components/modules/PortfolioSummaryCards'
import { HoldingsTable }                   from '@/components/modules/HoldingsTable'
import { SectorAllocationChart }           from '@/components/charts/SectorAllocationChart'
import { TopHoldingsChart }                from '@/components/charts/TopHoldingsChart'
import { RiskSnapshotCard }                from '@/components/risk/RiskSnapshotCard'
import { PortfolioAdvisorPanel }           from '@/components/advisor/PortfolioAdvisorPanel'
import { ActionCenter }                    from '@/components/action/ActionCenter'
import { computeRiskSnapshot }             from '@/lib/risk'
import { cn }                              from '@/lib/utils'

// ─── Error banner ─────────────────────────────────────────────────────────────

function ErrorBanner({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-5">
      <div className="flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-red-700 text-sm">Failed to load portfolio data</p>
          <p className="text-sm text-red-600 mt-1 break-words">{message}</p>
          <p className="mt-2 text-xs text-red-500">
            Please check that the backend service is running and reachable, then try again.
          </p>
        </div>
        <button
          onClick={onRetry}
          className="shrink-0 flex items-center gap-1.5 rounded-md bg-red-100
                     hover:bg-red-200 text-red-700 px-3 py-1.5 text-xs font-medium transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Retry
        </button>
      </div>
    </div>
  )
}

// ─── Section heading ──────────────────────────────────────────────────────────

function SectionHeading({
  icon: Icon,
  title,
  subtitle,
  action,
}: {
  icon: React.ElementType
  title: string
  subtitle?: string
  action?: { label: string; href: string }
}) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 border border-indigo-100">
          <Icon className="h-3.5 w-3.5 text-indigo-600" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
          {subtitle && <p className="text-[11px] text-slate-400 leading-none mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {action && (
        <a
          href={action.href}
          className="text-xs text-indigo-500 hover:text-indigo-700 font-medium transition-colors"
        >
          {action.label} →
        </a>
      )}
    </div>
  )
}

// ─── Risk metric tile ─────────────────────────────────────────────────────────

function RiskTile({
  label, value, unit, status, loading,
}: {
  label:   string
  value:   number | null | undefined
  unit:    string
  status?: 'good' | 'warn' | 'bad' | 'neutral'
  loading: boolean
}) {
  const colour =
    status === 'good'    ? 'text-emerald-600'
    : status === 'warn'  ? 'text-amber-600'
    : status === 'bad'   ? 'text-red-600'
    :                       'text-slate-700'

  const bg =
    status === 'good'    ? 'bg-emerald-50 border-emerald-100'
    : status === 'warn'  ? 'bg-amber-50 border-amber-100'
    : status === 'bad'   ? 'bg-red-50 border-red-100'
    :                       'bg-slate-50 border-slate-100'

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 animate-pulse">
        <div className="h-3 w-16 rounded bg-slate-200 mb-2" />
        <div className="h-7 w-12 rounded bg-slate-200" />
      </div>
    )
  }

  return (
    <div className={cn('rounded-xl border p-4', bg)}>
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">{label}</p>
      <p className={cn('text-xl font-bold tabular-nums', colour)}>
        {value === null || value === undefined ? '—' : `${value.toFixed(2)}${unit}`}
      </p>
    </div>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyPortfolioState() {
  const router = useRouter()
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center gap-6">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50 border border-indigo-100">
        <Upload className="h-7 w-7 text-indigo-500" />
      </div>
      <div className="max-w-sm">
        <h2 className="text-lg font-bold text-slate-800">No portfolio uploaded yet</h2>
        <p className="mt-2 text-sm text-slate-500">
          Upload a CSV or Excel file with your holdings to see your portfolio analytics, risk metrics, and sector breakdown.
        </p>
      </div>
      <div className="flex gap-3">
        <button
          onClick={() => router.push('/upload')}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors shadow-sm"
        >
          <Upload className="h-4 w-4" />
          Upload Portfolio
        </button>
        <button
          onClick={() => router.push('/market')}
          className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
        >
          View Market Overview
        </button>
      </div>
    </div>
  )
}

// ─── Dashboard page ───────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { holdings, summary, sectors, loading, error, refetch } = usePortfolio()
  const { currentConfig }  = useDataMode()

  // Cross-filter store
  const selectedSector  = useFilterStore((s) => s.selectedSector)
  const toggleSector    = useFilterStore((s) => s.toggleSector)
  const clearFilters    = useFilterStore((s) => s.clearFilters)

  // Derived data
  const riskSnapshot = useMemo(
    () => computeRiskSnapshot(holdings, sectors, summary),
    [holdings, sectors, summary]
  )

  // Concentration status helpers (derived from riskSnapshot — zero extra API calls)
  const maxHoldingStatus = (w: number | null | undefined): 'good' | 'warn' | 'bad' | 'neutral' =>
    w == null ? 'neutral' : w >= 35 ? 'bad' : w >= 20 ? 'warn' : 'good'
  const top3Status = (w: number | null | undefined): 'good' | 'warn' | 'bad' | 'neutral' =>
    w == null ? 'neutral' : w >= 60 ? 'bad' : w >= 45 ? 'warn' : 'good'
  const hhiStatus = (h: number | null | undefined): 'good' | 'warn' | 'bad' | 'neutral' =>
    h == null ? 'neutral' : h >= 0.25 ? 'bad' : h >= 0.12 ? 'warn' : 'good'
  const divStatus  = (d: number | null | undefined): 'good' | 'warn' | 'bad' | 'neutral' =>
    d == null ? 'neutral' : d >= 65 ? 'good' : d >= 40 ? 'warn' : 'bad'

  return (
    <div className="space-y-6 max-w-[1400px]">

      {/* ── Status bar ───────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className={cn(
            'h-2 w-2 rounded-full shrink-0',
            loading  ? 'bg-amber-400 animate-pulse'
            : error  ? 'bg-red-400'
            :           'bg-emerald-500'
          )} />
          <p className="text-xs text-slate-500">
            {loading
              ? 'Loading portfolio data…'
              : error
              ? 'Data unavailable'
              : <>Showing <span className="font-semibold text-slate-700">{currentConfig?.label}</span></>
            }
          </p>

          {selectedSector && (
            <span className="flex items-center gap-1 rounded-full bg-indigo-100 text-indigo-700
                             text-[10px] font-semibold px-2.5 py-0.5 border border-indigo-200">
              Filtered: {selectedSector}
              <button
                onClick={clearFilters}
                className="ml-0.5 text-indigo-400 hover:text-indigo-700 transition-colors leading-none"
                aria-label="Clear sector filter"
              >
                ×
              </button>
            </span>
          )}
        </div>

        <button
          onClick={refetch}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white
                     px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50
                     disabled:opacity-40 transition-colors"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {/* ── Error ────────────────────────────────────────────────────────── */}
      {error && <ErrorBanner message={error} onRetry={refetch} />}

      {/* ── Empty state — no portfolio uploaded ──────────────────────────── */}
      {!error && !loading && holdings.length === 0 && (
        <EmptyPortfolioState />
      )}

      {!error && (loading || holdings.length > 0) && (
        <div className="space-y-0">

          {/* ══════════════════════════════════════════════════════════════════
              SECTION 1 — PORTFOLIO SUMMARY
              Capital invested · current value · total return · daily change
              Primary focal point — kept at top with extra bottom spacing.
          ══════════════════════════════════════════════════════════════════ */}
          <section className="pb-6">
            <SectionHeading
              icon={TrendingUp}
              title="Portfolio Summary"
              subtitle="Capital, value, and returns at a glance"
            />
            <PortfolioSummaryCards summary={summary} loading={loading} />
          </section>

          {/* ══════════════════════════════════════════════════════════════════
              SECTION 2 — ALLOCATION OVERVIEW
              Sector breakdown · top holdings · holdings preview
          ══════════════════════════════════════════════════════════════════ */}
          <section className="border-t border-slate-100 pt-6 pb-6">
            <SectionHeading
              icon={PieChart}
              title="Allocation Overview"
              subtitle="Sector weights and largest positions"
              action={{ label: 'Full holdings', href: '/holdings' }}
            />

            {/* Charts row — sector donut left, top holdings bar right */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-5 mb-6">
              <div className="xl:col-span-2">
                <SectorAllocationChart
                  sectors={sectors}
                  loading={loading}
                  selectedSector={selectedSector}
                  onSectorClick={toggleSector}
                />
              </div>
              <div className="xl:col-span-3">
                <TopHoldingsChart holdings={holdings} loading={loading} limit={8} />
              </div>
            </div>

            {/* Holdings preview (cross-filtered by sector click) */}
            <HoldingsTable
              holdings={holdings}
              loading={loading}
              limit={5}
              showViewAll
              sectorFilter={selectedSector}
              onClearSectorFilter={clearFilters}
            />
          </section>

          {/* ══════════════════════════════════════════════════════════════════
              SECTION 3 — RISK SUMMARY
              Volatility · Sharpe · drawdown · diversification
          ══════════════════════════════════════════════════════════════════ */}
          <section className="border-t border-slate-100 pt-6 pb-6">
            <SectionHeading
              icon={Activity}
              title="Risk Summary"
              subtitle="Key risk metrics for your portfolio"
              action={{ label: 'Full risk analysis', href: '/risk' }}
            />

            {/* 4-tile metric grid — all sourced from riskSnapshot (no extra API calls) */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
              <RiskTile
                label="Top Position"
                value={riskSnapshot?.max_holding_weight}
                unit="%"
                status={maxHoldingStatus(riskSnapshot?.max_holding_weight)}
                loading={loading}
              />
              <RiskTile
                label="Top 3 Combined"
                value={riskSnapshot?.top3_weight}
                unit="%"
                status={top3Status(riskSnapshot?.top3_weight)}
                loading={loading}
              />
              <RiskTile
                label="HHI (Concentration)"
                value={riskSnapshot?.hhi}
                unit=""
                status={hhiStatus(riskSnapshot?.hhi)}
                loading={loading}
              />
              <RiskTile
                label="Diversification"
                value={riskSnapshot?.diversification_score}
                unit="/100"
                status={divStatus(riskSnapshot?.diversification_score)}
                loading={loading}
              />
            </div>

            {/* Full risk snapshot card */}
            <RiskSnapshotCard snapshot={riskSnapshot} loading={loading} compact />
          </section>

          {/* ══════════════════════════════════════════════════════════════════
              SECTION 4 — INSIGHTS
              Recommended actions · AI advisor snapshot
          ══════════════════════════════════════════════════════════════════ */}
          <section className="border-t border-slate-100 pt-6">
            <SectionHeading
              icon={Brain}
              title="Insights"
              subtitle="Recommended actions and portfolio advice"
              action={{ label: 'Open advisor', href: '/advisor' }}
            />

            {/* Action Center — recommended actions */}
            <div className="mb-5">
              <ActionCenter
                holdings={holdings}
                summary={summary}
                maxItems={3}
                compact
              />
            </div>

            {/* Advisor panel */}
            <PortfolioAdvisorPanel
              holdings={holdings}
              sectors={sectors}
              riskSnapshot={riskSnapshot}
              loading={loading}
            />
          </section>

        </div>
      )}
    </div>
  )
}
