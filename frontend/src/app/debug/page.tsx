/**
 * Debug Page — /debug
 * --------------------
 * Developer diagnostics view. NOT linked in the production sidebar.
 * Access via: http://localhost:3000/debug
 *
 * Renders the SystemDiagnosticsPanel which shows:
 *   • API Health       — backend reachability + feature flags
 *   • Data Mode        — current mock/live/broker mode
 *   • Portfolio Data   — raw holdings, summary, sectors, risk snapshot
 *   • Fundamentals     — weightedMetrics + per-ticker ratios
 *   • News & Events    — latest articles + upcoming events
 */

'use client'

import { Bug, AlertTriangle, Filter, GitFork } from 'lucide-react'
import { SystemDiagnosticsPanel } from '@/components/debug/SystemDiagnosticsPanel'

export default function DebugPage() {
  return (
    <div className="space-y-5 max-w-[900px]">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2.5 mb-1">
          <Bug className="h-5 w-5 text-slate-500" />
          <h1 className="text-lg font-bold text-slate-900">System Diagnostics</h1>
        </div>
        <p className="text-xs text-slate-400">
          Inspect live app state: API health, active filters, simulation state, portfolio data, and derived metrics.
        </p>
      </div>

      {/* ── What's new in v2 ────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        {[
          { icon: Filter, label: 'Active Filters section — shows filterStore state' },
          { icon: GitFork, label: 'Simulation State section — shows simHoldings & deltas' },
        ].map(({ icon: Icon, label }) => (
          <div key={label} className="flex items-center gap-1.5 rounded-md bg-slate-100 px-3 py-1.5">
            <Icon className="h-3 w-3 text-slate-500" />
            <span className="text-[10px] text-slate-600">{label}</span>
          </div>
        ))}
      </div>

      {/* ── Warning banner ──────────────────────────────────────────────────── */}
      <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
        <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-700">
          <span className="font-semibold">Development only.</span>{' '}
          This page exposes raw portfolio data and internal state.
        </p>
      </div>

      {/* ── Diagnostics panel ───────────────────────────────────────────────── */}
      <SystemDiagnosticsPanel />

    </div>
  )
}
