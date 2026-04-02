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
import {
  RefreshCw, AlertCircle,
  Activity, Brain, Briefcase, PieChart,
  TrendingUp, TrendingDown,
} from 'lucide-react'
import { usePortfolio }                    from '@/hooks/usePortfolio'
import { useDataMode }                     from '@/hooks/useDataMode'
import { useQuantAnalytics }               from '@/hooks/useQuantAnalytics'
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

  // Quant metrics for risk section
  const { data: quantData, loading: quantLoading } = useQuantAnalytics()
  const qm = quantData?.metrics?.portfolio

  // Risk status helpers
  const volStatus  = (v: number | null | undefined) =>
    v == null ? 'neutral' : v < 15 ? 'good' : v < 25 ? 'warn' : 'bad'
  const sharpeStatus = (s: number | null | undefined) =>
    s == null ? 'neutral' : s >= 1.5 ? 'good' : s >= 0.8 ? 'warn' : 'bad'
  const ddStatus   = (d: number | null | undefined) =>
    d == null ? 'neutral' : Math.abs(d) < 10 ? 'good' : Math.abs(d) < 20 ? 'warn' : 'bad'
  const divStatus  = (d: number | null | undefined) =>
    d == null ? 'neutral' : d >= 7 ? 'good' : d >= 4 ? 'warn' : 'bad'

  return (
    <div className="space-y-8 max-w-[1400px]">

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

      {!error && (
        <div className="space-y-0">

          {/* ══════════════════════════════════════════════════════════════════
              SECTION 1 — PORTFOLIO SUMMARY
              Capital invested · current value · total return · daily change
              Primary focal point — kept at top with extra bottom spacing.
          ══════════════════════════════════════════════════════════════════ */}
          <section className="pb-8">
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
          <section className="border-t border-slate-100 pt-8 pb-8">
            <SectionHeading
              icon={PieChart}
              title="Allocation Overview"
              subtitle="Sector weights and largest positions"
              action={{ label: 'Full holdings', href: '/holdings' }}
            />

            {/* Charts row — sector donut left, top holdings bar right */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 mb-6">
              <div className="lg:col-span-5">
                <SectorAllocationChart
                  sectors={sectors}
                  loading={loading}
                  selectedSector={selectedSector}
                  onSectorClick={toggleSector}
                />
              </div>
              <div className="lg:col-span-7">
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
          <section className="border-t border-slate-100 pt-8 pb-8">
            <SectionHeading
              icon={Activity}
              title="Risk Summary"
              subtitle="Key risk metrics for your portfolio"
              action={{ label: 'Full risk analysis', href: '/risk' }}
            />

            {/* 4-tile metric grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
              <RiskTile
                label="Volatility"
                value={qm?.annualized_volatility}
                unit="%"
                status={volStatus(qm?.annualized_volatility)}
                loading={quantLoading}
              />
              <RiskTile
                label="Sharpe"
                value={qm?.sharpe_ratio}
                unit="x"
                status={sharpeStatus(qm?.sharpe_ratio)}
                loading={quantLoading}
              />
              <RiskTile
                label="Max Drawdown"
                value={qm?.max_drawdown != null ? -Math.abs(qm.max_drawdown) : null}
                unit="%"
                status={ddStatus(qm?.max_drawdown)}
                loading={quantLoading}
              />
              <RiskTile
                label="Diversification"
                value={riskSnapshot?.diversification_score}
                unit="/10"
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
          <section className="border-t border-slate-100 pt-8">
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
