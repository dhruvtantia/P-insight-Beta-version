/**
 * EvolutionInsights
 * ------------------
 * Auto-generates natural-language insights by comparing:
 *   - Oldest snapshot vs latest snapshot (long-run perspective)
 *   - N-1 vs N snapshot (most-recent change)
 *
 * Insight categories:
 *   • Value growth / decline
 *   • Holdings added / removed (net)
 *   • Sector concentration shifts
 *   • Diversification change
 */

'use client'

import React, { useMemo } from 'react'
import {
  TrendingUp, TrendingDown, Plus, Minus,
  PieChart, Layers, ArrowRight, Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SnapshotSummary, SnapshotDetail } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

type InsightKind = 'positive' | 'negative' | 'neutral' | 'info'

interface Insight {
  id:      string
  kind:    InsightKind
  icon:    React.ElementType
  label:   string
  detail:  string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtValue(v: number): string {
  if (v >= 1_00_00_000) return `₹${(v / 1_00_00_000).toFixed(1)}Cr`
  if (v >= 1_00_000)    return `₹${(v / 1_00_000).toFixed(1)}L`
  if (v >= 1_000)       return `₹${(v / 1_000).toFixed(1)}K`
  return `₹${v.toFixed(0)}`
}

function relDays(a: string, b: string): number {
  return Math.round(Math.abs(new Date(b).getTime() - new Date(a).getTime()) / 86_400_000)
}

// ─── Insight generator ───────────────────────────────────────────────────────

function generateInsights(
  summaries: SnapshotSummary[],
  details:   Map<number, SnapshotDetail>,
): Insight[] {
  if (summaries.length < 2) return []

  const oldest = summaries[0]
  const latest = summaries[summaries.length - 1]
  // prev exists only when there are 3+ snapshots; use optional chaining below
  const prev   = summaries.length >= 3 ? summaries[summaries.length - 2] : null

  const insights: Insight[] = []

  // ── 1. Long-run value change ──────────────────────────────────────────────
  if (oldest.total_value && latest.total_value) {
    const delta    = latest.total_value - oldest.total_value
    const deltaPct = (delta / oldest.total_value) * 100
    const days     = relDays(oldest.captured_at, latest.captured_at)
    const grew     = delta >= 0

    insights.push({
      id:     'value-change',
      kind:   grew ? 'positive' : 'negative',
      icon:   grew ? TrendingUp : TrendingDown,
      label:  grew
        ? `Portfolio grew ${deltaPct.toFixed(1)}% over ${days} days`
        : `Portfolio down ${Math.abs(deltaPct).toFixed(1)}% over ${days} days`,
      detail: `From ${fmtValue(oldest.total_value)} → ${fmtValue(latest.total_value)}`,
    })
  }

  // ── 2. Holdings count change (long-run) ───────────────────────────────────
  if (oldest.num_holdings != null && latest.num_holdings != null) {
    const diff = latest.num_holdings - oldest.num_holdings
    if (Math.abs(diff) >= 1) {
      insights.push({
        id:     'holdings-change',
        kind:   diff > 0 ? 'positive' : 'neutral',
        icon:   diff > 0 ? Plus : Minus,
        label:  diff > 0
          ? `Added ${diff} position${diff !== 1 ? 's' : ''} overall`
          : `Exited ${Math.abs(diff)} position${Math.abs(diff) !== 1 ? 's' : ''} overall`,
        detail: `${oldest.num_holdings} holdings → ${latest.num_holdings} holdings`,
      })
    }
  }

  // ── 3. Most-recent snapshot: value change ─────────────────────────────────
  if (prev && prev.total_value != null && latest.total_value != null) {
    const delta    = latest.total_value - prev.total_value
    const deltaPct = (delta / prev.total_value) * 100
    const days     = relDays(prev.captured_at, latest.captured_at)
    if (Math.abs(deltaPct) >= 0.5) {
      insights.push({
        id:     'recent-change',
        kind:   delta >= 0 ? 'positive' : 'negative',
        icon:   delta >= 0 ? TrendingUp : TrendingDown,
        label:  `${delta >= 0 ? '+' : ''}${deltaPct.toFixed(1)}% since last snapshot (${days}d ago)`,
        detail: `${fmtValue(prev.total_value)} → ${fmtValue(latest.total_value)}`,
      })
    }
  }

  // ── 4. Sector concentration shift (if details available) ─────────────────
  const oldDetail    = details.get(oldest.id)
  const latestDetail = details.get(latest.id)

  if (oldDetail && latestDetail) {
    const oldW  = oldDetail.sector_weights
    const newW  = latestDetail.sector_weights

    // Find largest sector shift
    const allSectors = new Set([...Object.keys(oldW), ...Object.keys(newW)])
    let maxShift = 0
    let maxSector = ''

    for (const sec of allSectors) {
      const shift = Math.abs((newW[sec] ?? 0) - (oldW[sec] ?? 0))
      if (shift > maxShift) { maxShift = shift; maxSector = sec }
    }

    if (maxShift >= 5 && maxSector) {
      const before = (oldW[maxSector] ?? 0).toFixed(1)
      const after  = (newW[maxSector] ?? 0).toFixed(1)
      const up     = (newW[maxSector] ?? 0) > (oldW[maxSector] ?? 0)

      insights.push({
        id:     'sector-shift',
        kind:   'info',
        icon:   PieChart,
        label:  `${maxSector} ${up ? 'grew' : 'shrank'} by ${maxShift.toFixed(1)}pp`,
        detail: `${before}% → ${after}% allocation`,
      })
    }

    // ── 5. Diversification direction ────────────────────────────────────────
    const oldTopHolding    = oldDetail.top_holdings?.[0]?.weight ?? 0
    const latestTopHolding = latestDetail.top_holdings?.[0]?.weight ?? 0
    const concentChange    = latestTopHolding - oldTopHolding

    if (Math.abs(concentChange) >= 0.03) {
      const better = concentChange < 0  // lower top-holding % = more diversified
      insights.push({
        id:     'diversification',
        kind:   better ? 'positive' : 'neutral',
        icon:   Layers,
        label:  better
          ? 'Portfolio is more diversified now'
          : 'Portfolio has become more concentrated',
        detail: `Top holding: ${(oldTopHolding * 100).toFixed(1)}% → ${(latestTopHolding * 100).toFixed(1)}%`,
      })
    }
  }

  return insights
}

// ─── Insight card ─────────────────────────────────────────────────────────────

const KIND_STYLES: Record<InsightKind, { border: string; bg: string; iconBg: string; text: string }> = {
  positive: {
    border:  'border-emerald-100',
    bg:      'bg-emerald-50',
    iconBg:  'bg-emerald-100 text-emerald-600',
    text:    'text-emerald-700',
  },
  negative: {
    border:  'border-red-100',
    bg:      'bg-red-50',
    iconBg:  'bg-red-100 text-red-600',
    text:    'text-red-700',
  },
  neutral: {
    border:  'border-slate-200',
    bg:      'bg-slate-50',
    iconBg:  'bg-slate-100 text-slate-600',
    text:    'text-slate-700',
  },
  info: {
    border:  'border-indigo-100',
    bg:      'bg-indigo-50',
    iconBg:  'bg-indigo-100 text-indigo-600',
    text:    'text-indigo-700',
  },
}

function InsightCard({ insight }: { insight: Insight }) {
  const s = KIND_STYLES[insight.kind]
  const { icon: Icon } = insight

  return (
    <div className={cn('rounded-xl border px-4 py-3 flex items-start gap-3', s.border, s.bg)}>
      <div className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full mt-0.5', s.iconBg)}>
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0">
        <p className={cn('text-sm font-semibold', s.text)}>{insight.label}</p>
        <p className="text-xs text-slate-500 mt-0.5">{insight.detail}</p>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface EvolutionInsightsProps {
  summaries:  SnapshotSummary[]
  details:    Map<number, SnapshotDetail>
  className?: string
}

export function EvolutionInsights({
  summaries,
  details,
  className,
}: EvolutionInsightsProps): React.ReactElement | null {
  const insights = useMemo(
    () => generateInsights(summaries, details),
    [summaries, details]
  )

  if (insights.length === 0) return null

  return (
    <div className={cn('space-y-3', className)}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-1">
        <Sparkles className="h-4 w-4 text-indigo-500" />
        <h3 className="text-sm font-semibold text-slate-800">Portfolio Evolution</h3>
        <span className="text-[10px] font-normal text-slate-400 ml-1">auto-generated</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {insights.map((ins) => (
          <InsightCard key={ins.id} insight={ins} />
        ))}
      </div>

      {summaries.length >= 2 && (
        <a
          href="/changes"
          className="inline-flex items-center gap-1 text-xs text-indigo-500 hover:text-indigo-700 font-medium transition-colors"
        >
          Full snapshot comparison <ArrowRight className="h-3 w-3" />
        </a>
      )}
    </div>
  )
}
