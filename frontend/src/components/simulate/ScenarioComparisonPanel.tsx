/**
 * ScenarioComparisonPanel — before/after metric comparison grid
 * -------------------------------------------------------------
 * Shows Current vs Simulated values for each tracked metric.
 * Improved metrics get a green arrow, deteriorated ones get red.
 *
 * Metrics shown:
 *   Risk: HHI | Diversification Score | Risk Profile | Max Holding | Max Sector
 *   Structure: Holdings | Sectors
 *   Fundamentals: Wtd P/E | Wtd ROE | Div Yield
 */

'use client'

import { ArrowUp, ArrowDown, Minus, TrendingUp, PieChart, BarChart2 } from 'lucide-react'
import { cn }           from '@/lib/utils'
import type { PortfolioScenario, ScenarioDelta } from '@/lib/simulation'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt1 = (v: number | null, suffix = '') =>
  v !== null ? `${v.toFixed(1)}${suffix}` : '—'

const fmtPct = (v: number | null) => fmt1(v, '%')
const fmtMul = (v: number | null) => v !== null ? `${v.toFixed(1)}×` : '—'

function profileLabel(profile: string): string {
  return profile.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

// ─── Delta arrow ──────────────────────────────────────────────────────────────

function DeltaArrow({
  delta,
  improved,
  suffix = '',
}: {
  delta: number | null
  improved: boolean
  suffix?: string
}) {
  if (delta === null || Math.abs(delta) < 0.005) {
    return <Minus className="h-3 w-3 text-slate-300" />
  }
  const Icon = delta > 0 ? ArrowUp : ArrowDown
  return (
    <span className={cn(
      'flex items-center gap-0.5 text-[10px] font-bold',
      improved ? 'text-emerald-600' : 'text-red-500'
    )}>
      <Icon className="h-3 w-3 shrink-0" />
      {Math.abs(delta) < 0.001
        ? `${(delta * 1000).toFixed(1)}m`  // milli
        : `${Math.abs(delta).toFixed(1)}${suffix}`
      }
    </span>
  )
}

// ─── Metric row ───────────────────────────────────────────────────────────────

function MetricRow({
  label,
  current,
  simulated,
  delta,
  improved,
  suffix = '',
  invert = false,
}: {
  label:    string
  current:  string
  simulated: string
  delta:    number | null
  improved: boolean
  suffix?:  string
  invert?:  boolean
}) {
  const hasChange = delta !== null && Math.abs(delta) >= 0.005

  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 py-2.5 border-b border-slate-50 last:border-0">
      {/* Label */}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
        <p className="text-sm font-bold text-slate-800 mt-0.5">{current}</p>
      </div>

      {/* Delta */}
      <div className="flex flex-col items-center gap-0.5 px-2">
        <span className="text-[9px] text-slate-300 uppercase tracking-wider">→</span>
        {hasChange && <DeltaArrow delta={delta} improved={improved} suffix={suffix} />}
      </div>

      {/* Simulated */}
      <div className="text-right">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 invisible">
          {label}
        </p>
        <p className={cn(
          'text-sm font-bold mt-0.5',
          !hasChange               ? 'text-slate-800' :
          improved                 ? 'text-emerald-700' :
                                     'text-red-600'
        )}>
          {simulated}
        </p>
      </div>
    </div>
  )
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex items-center gap-2 pt-3 pb-1 first:pt-0">
      <Icon className="h-3.5 w-3.5 text-slate-400" />
      <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">{label}</p>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface ScenarioComparisonPanelProps {
  base:  PortfolioScenario
  sim:   PortfolioScenario
  delta: ScenarioDelta
}

export function ScenarioComparisonPanel({
  base,
  sim,
  delta,
}: ScenarioComparisonPanelProps) {
  const isModified = sim.holdings.some((h) => h.action !== 'hold')

  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <div className="border-b border-slate-100 bg-slate-50/60">
        {/* Title row */}
        <div className="flex items-center gap-2 px-5 pt-3.5 pb-2">
          <TrendingUp className="h-4 w-4 text-indigo-500 shrink-0" />
          <h3 className="text-sm font-semibold text-slate-800">Scenario Comparison</h3>
          {isModified && (
            <span className="ml-auto rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200
                             text-[10px] font-bold px-2 py-0.5">
              Modified
            </span>
          )}
        </div>
        {/* Column label row — visually anchored */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-5 pb-2.5">
          <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Current</span>
          <span className="px-2" />
          <span className={cn(
            'text-right text-[11px] font-bold uppercase tracking-wide',
            isModified ? 'text-indigo-600' : 'text-slate-300',
          )}>
            Simulated
          </span>
        </div>
      </div>

      {/* Metrics */}
      <div className="px-5 pb-3">
        {/* Risk section */}
        <SectionHeader icon={PieChart} label="Risk & Concentration" />

        <MetricRow
          label="HHI"
          current={base.riskSnapshot?.hhi.toFixed(3) ?? '—'}
          simulated={sim.riskSnapshot?.hhi.toFixed(3) ?? '—'}
          delta={delta.hhi.delta}
          improved={delta.hhi.improved}
        />
        <MetricRow
          label="Div. Score"
          current={`${base.riskSnapshot?.diversification_score ?? '—'}/100`}
          simulated={`${sim.riskSnapshot?.diversification_score ?? '—'}/100`}
          delta={delta.diversification_score.delta}
          improved={delta.diversification_score.improved}
        />
        <MetricRow
          label="Risk Profile"
          current={profileLabel(base.riskSnapshot?.risk_profile ?? '—')}
          simulated={profileLabel(sim.riskSnapshot?.risk_profile ?? '—')}
          delta={null}
          improved={delta.risk_profile.improved}
        />
        <MetricRow
          label="Max Holding"
          current={fmtPct(base.riskSnapshot?.max_holding_weight ?? null)}
          simulated={fmtPct(sim.riskSnapshot?.max_holding_weight ?? null)}
          delta={delta.max_holding_weight.delta}
          improved={delta.max_holding_weight.improved}
          suffix="%"
        />
        <MetricRow
          label="Max Sector"
          current={fmtPct(base.riskSnapshot?.max_sector_weight ?? null)}
          simulated={fmtPct(sim.riskSnapshot?.max_sector_weight ?? null)}
          delta={delta.max_sector_weight.delta}
          improved={delta.max_sector_weight.improved}
          suffix="%"
        />

        {/* Structure */}
        <SectionHeader icon={PieChart} label="Portfolio Structure" />
        <MetricRow
          label="Holdings"
          current={String(base.riskSnapshot?.num_holdings ?? '—')}
          simulated={String(sim.riskSnapshot?.num_holdings ?? '—')}
          delta={delta.num_holdings.delta}
          improved={delta.num_holdings.delta > 0}
        />
        <MetricRow
          label="Sectors"
          current={String(base.riskSnapshot?.num_sectors ?? '—')}
          simulated={String(sim.riskSnapshot?.num_sectors ?? '—')}
          delta={delta.num_sectors.delta}
          improved={delta.num_sectors.improved}
        />

        {/* Fundamentals */}
        <SectionHeader icon={BarChart2} label="Fundamentals" />
        <MetricRow
          label="Wtd P/E"
          current={fmtMul(base.weightedMetrics?.wtd_pe ?? null)}
          simulated={fmtMul(sim.weightedMetrics?.wtd_pe ?? null)}
          delta={delta.wtd_pe.delta}
          improved={false}   // P/E direction is ambiguous
        />
        <MetricRow
          label="Wtd ROE"
          current={fmtPct(base.weightedMetrics?.wtd_roe ?? null)}
          simulated={fmtPct(sim.weightedMetrics?.wtd_roe ?? null)}
          delta={delta.wtd_roe.delta}
          improved={delta.wtd_roe.improved}
          suffix="%"
        />
        <MetricRow
          label="Div Yield"
          current={fmtPct(base.weightedMetrics?.wtd_div_yield ?? null)}
          simulated={fmtPct(sim.weightedMetrics?.wtd_div_yield ?? null)}
          delta={delta.wtd_div_yield.delta}
          improved={delta.wtd_div_yield.improved}
          suffix="%"
        />
      </div>

      {/* Summary footer */}
      {isModified && delta && (
        <div className="border-t border-slate-100 bg-slate-50/60 px-5 py-3">
          <p className="text-[11px] text-slate-500">
            {delta.hhi.improved
              ? `✓ HHI ${delta.hhi.delta > 0 ? '+' : ''}${(delta.hhi.delta * 1000).toFixed(1)}m points — concentration ${delta.hhi.improved ? 'improved' : 'worsened'}`
              : `HHI ${delta.hhi.delta > 0 ? 'increased' : 'decreased'} — concentration ${delta.hhi.improved ? 'improved' : 'worsened'}`
            }
            {delta.diversification_score.delta !== 0
              ? `. Diversification score ${delta.diversification_score.delta > 0 ? '+' : ''}${delta.diversification_score.delta.toFixed(0)} pts.`
              : '.'
            }
          </p>
        </div>
      )}
    </div>
  )
}
