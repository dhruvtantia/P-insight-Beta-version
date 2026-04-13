/**
 * Portfolios Management Page  (/portfolios)
 * ------------------------------------------
 * Lets the user:
 *   - View all portfolios with metadata (Manage tab)
 *   - Inspect and refresh a portfolio's source (Sources tab)
 *   - Compare snapshots side by side (Compare tab)
 *   - Create / delete snapshots
 *
 * Architecture: all mutations go through usePortfolios / useSnapshots hooks.
 */

'use client'

import React, { useState } from 'react'
import {
  Briefcase,
  CheckCircle2,
  Pencil,
  Trash2,
  Camera,
  Loader2,
  RefreshCw,
  Upload,
  AlertTriangle,
  GitCompare,
  List,
  Database,
  Wifi,
  ChevronRight,
} from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { usePortfolios } from '@/hooks/usePortfolios'
import { useSnapshots } from '@/hooks/useSnapshots'
import { useBrokerConnections } from '@/hooks/useBrokerConnections'
import { SnapshotSummaryCard } from '@/components/portfolio/SnapshotSummaryCard'
import { SnapshotComparisonPanel } from '@/components/portfolio/SnapshotComparisonPanel'
import { SourceBadge } from '@/components/portfolio/SourceBadge'
import { PortfolioSourceCard } from '@/components/portfolio/PortfolioSourceCard'
import { PortfolioRefreshPanel } from '@/components/portfolio/PortfolioRefreshPanel'
import type { PortfolioMeta } from '@/types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtRelSynced(iso: string | null | undefined): string | null {
  if (!iso) return null
  try {
    const diff  = Date.now() - new Date(iso).getTime()
    const hours = Math.floor(diff / 3_600_000)
    const mins  = Math.floor(diff / 60_000)
    const days  = Math.floor(diff / 86_400_000)
    if (mins  < 2)  return 'synced just now'
    if (hours < 1)  return `synced ${mins}m ago`
    if (hours < 24) return `synced ${hours}h ago`
    return `synced ${days}d ago`
  } catch { return null }
}

// ─── Portfolio row ─────────────────────────────────────────────────────────────

interface PortfolioRowProps {
  portfolio:  PortfolioMeta
  isActive:   boolean
  isSelected: boolean
  onSelect:   () => void
  onActivate: () => Promise<void>
  onRename:   (name: string) => Promise<void>
  onDelete:   () => Promise<void>
}

function PortfolioRow({
  portfolio, isActive, isSelected,
  onSelect, onActivate, onRename, onDelete,
}: PortfolioRowProps) {
  const [editingName, setEditingName] = useState(false)
  const [nameInput,   setNameInput]   = useState(portfolio.name)
  const [busy,        setBusy]        = useState(false)
  const [confirmDel,  setConfirmDel]  = useState(false)

  const syncedLabel = fmtRelSynced(portfolio.last_synced_at)

  const handleRename = async () => {
    const trimmed = nameInput.trim()
    if (!trimmed || trimmed === portfolio.name) { setEditingName(false); return }
    setBusy(true)
    try {
      await onRename(trimmed)
    } finally {
      setBusy(false)
      setEditingName(false)
    }
  }

  const handleDelete = async () => {
    if (!confirmDel) { setConfirmDel(true); return }
    setBusy(true)
    try { await onDelete() } finally { setBusy(false) }
  }

  const handleActivate = async () => {
    if (isActive) return
    setBusy(true)
    try { await onActivate() } finally { setBusy(false) }
  }

  return (
    <div
      className={cn(
        'flex items-center gap-3 px-4 py-3 rounded-xl border transition-all cursor-pointer',
        isSelected
          ? 'border-indigo-300 bg-indigo-50/50'
          : 'border-slate-200 bg-white hover:border-slate-300',
      )}
      onClick={onSelect}
    >
      {/* Active indicator */}
      <div className="w-4 flex items-center justify-center shrink-0">
        {isActive
          ? <CheckCircle2 className="h-4 w-4 text-indigo-500" />
          : <div className="h-3 w-3 rounded-full border border-slate-300" />
        }
      </div>

      {/* Name / edit */}
      <div className="flex-1 min-w-0" onClick={(e) => e.stopPropagation()}>
        {editingName ? (
          <div className="flex items-center gap-2">
            <input
              autoFocus
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter')  handleRename()
                if (e.key === 'Escape') setEditingName(false)
              }}
              className="flex-1 text-sm border border-indigo-300 rounded px-2 py-0.5 bg-white focus:outline-none"
            />
            <button
              onClick={handleRename}
              disabled={busy}
              className="text-xs font-medium text-indigo-600 hover:underline"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Save'}
            </button>
            <button
              onClick={() => setEditingName(false)}
              className="text-xs text-slate-400 hover:text-slate-600"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div>
            <p className="text-sm font-semibold text-slate-700 truncate">{portfolio.name}</p>
            <p className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
              <span>{portfolio.num_holdings} holdings</span>
              {syncedLabel && (
                <>
                  <span className="text-slate-300">·</span>
                  <span className="flex items-center gap-0.5">
                    <RefreshCw className="h-2.5 w-2.5" />
                    {syncedLabel}
                  </span>
                </>
              )}
              {portfolio.upload_filename && (
                <>
                  <span className="text-slate-300">·</span>
                  <span className="font-mono text-[10px]">{portfolio.upload_filename}</span>
                </>
              )}
            </p>
          </div>
        )}
      </div>

      {/* Source badge */}
      <SourceBadge source={portfolio.source} size="xs" />

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
        {!isActive && (
          <button
            onClick={handleActivate}
            disabled={busy}
            title="Set as active"
            className="text-[11px] font-medium text-indigo-600 hover:underline px-1.5"
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Activate'}
          </button>
        )}
        <button
          onClick={() => { setEditingName(true); setNameInput(portfolio.name) }}
          title="Rename"
          className="p-1 text-slate-400 hover:text-slate-600"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={handleDelete}
          disabled={busy}
          title={confirmDel ? 'Click again to confirm delete' : 'Delete'}
          className={cn(
            'p-1 transition-colors',
            confirmDel
              ? 'text-rose-500 hover:text-rose-600'
              : 'text-slate-300 hover:text-rose-400',
          )}
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  )
}

// ─── Sources tab ──────────────────────────────────────────────────────────────

function SourcesTab({
  portfolios,
  activePortfolioId,
  onRefreshSuccess,
}: {
  portfolios:         PortfolioMeta[]
  activePortfolioId:  number | null
  onRefreshSuccess:   (updated: PortfolioMeta) => void
}) {
  const [selectedId,    setSelectedId]    = useState<number | null>(activePortfolioId)
  const [showRefresh,   setShowRefresh]   = useState(false)

  const displayId  = selectedId ?? activePortfolioId
  const portfolio  = portfolios.find((p) => p.id === displayId) ?? portfolios[0] ?? null

  // Broker connection state for selected portfolio
  const { connections } = useBrokerConnections(portfolio?.id ?? null)
  const brokerConnection = portfolio?.source === 'broker'
    ? (Object.values(connections)[0] ?? null)
    : null

  if (portfolios.length === 0) {
    return (
      <div className="rounded-xl border-2 border-dashed border-slate-200 py-12 text-center">
        <Database className="h-8 w-8 text-slate-300 mx-auto mb-3" />
        <p className="text-sm font-medium text-slate-500">No portfolios yet</p>
        <p className="text-xs text-slate-400 mt-1 mb-4">Upload a file to get started.</p>
        <Link href="/upload" className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:underline">
          <Upload className="h-4 w-4" /> Upload portfolio
        </Link>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

      {/* Portfolio selector */}
      <div className="lg:col-span-2 space-y-2">
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">
          Select Portfolio
        </h2>
        <div className="space-y-1.5">
          {portfolios.map((p) => (
            <button
              key={p.id}
              onClick={() => { setSelectedId(p.id); setShowRefresh(false) }}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-colors',
                p.id === displayId
                  ? 'border-indigo-300 bg-indigo-50'
                  : 'border-slate-200 bg-white hover:border-slate-300',
              )}
            >
              <div className="w-4 shrink-0 flex items-center justify-center">
                {p.id === activePortfolioId
                  ? <CheckCircle2 className="h-3.5 w-3.5 text-indigo-500" />
                  : <div className="h-3 w-3 rounded-full border border-slate-300" />
                }
              </div>
              <p className={cn(
                'flex-1 text-sm truncate',
                p.id === displayId ? 'font-semibold text-indigo-700' : 'font-medium text-slate-700',
              )}>
                {p.name}
              </p>
              <SourceBadge source={p.source} size="xs" />
            </button>
          ))}
        </div>
      </div>

      {/* Source card + refresh panel */}
      <div className="lg:col-span-3 space-y-4">
        {portfolio ? (
          <>
            <PortfolioSourceCard
              portfolio={portfolio}
              brokerConnection={brokerConnection}
              onRefresh={portfolio.is_refreshable ? () => setShowRefresh(true) : undefined}
            />

            {/* Broker portfolio → quick link to Brokers page */}
            {portfolio.source === 'broker' && (
              <Link
                href="/brokers"
                className="flex items-center justify-between gap-2 rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm font-medium text-indigo-700 hover:bg-indigo-100 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Wifi className="h-4 w-4" />
                  Manage broker connections
                </div>
                <ChevronRight className="h-4 w-4 text-indigo-400" />
              </Link>
            )}

            {showRefresh && portfolio.is_refreshable && (
              <PortfolioRefreshPanel
                portfolio={portfolio}
                onSuccess={(updated) => {
                  onRefreshSuccess(updated)
                  setShowRefresh(false)
                }}
                onCancel={() => setShowRefresh(false)}
              />
            )}
          </>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-200 py-10 text-center text-sm text-slate-400">
            Select a portfolio to see its source details.
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Tab = 'manage' | 'sources' | 'compare'

export default function PortfoliosPage(): React.ReactElement {
  const {
    portfolios, activePortfolioId, loading, error,
    activate, rename, remove, refetch, updatePortfolio,
  } = usePortfolios()

  const [tab, setTab] = useState<Tab>('manage')

  // Selected portfolio for snapshot panel (manage tab)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const displayId = selectedId ?? activePortfolioId
  const selectedPortfolio = portfolios.find((p) => p.id === displayId) ?? null

  const {
    snapshots, loading: snapsLoading, createSnapshot, deleteSnapshot,
  } = useSnapshots(displayId)

  const [snapLabel,    setSnapLabel]    = useState('')
  const [creatingSnap, setCreatingSnap] = useState(false)
  const [snapError,    setSnapError]    = useState<string | null>(null)

  const handleCreateSnapshot = async () => {
    setCreatingSnap(true)
    setSnapError(null)
    try {
      await createSnapshot(snapLabel.trim() || undefined)
      setSnapLabel('')
    } catch (e) {
      setSnapError(e instanceof Error ? e.message : 'Snapshot failed')
    } finally {
      setCreatingSnap(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">

        {/* Page header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              <Briefcase className="h-6 w-6 text-indigo-500" />
              My Portfolio
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Manage sources, switch active portfolios, and compare snapshots.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={refetch}
              disabled={loading}
              className="p-2 text-slate-400 hover:text-slate-600 transition-colors"
              title="Refresh"
            >
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            </button>
            <Link
              href="/upload"
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 text-white text-sm font-medium px-3 py-2 hover:bg-indigo-700 transition-colors"
            >
              <Upload className="h-4 w-4" />
              Upload portfolio
            </Link>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-slate-200">
          {([
            { key: 'manage',  label: 'Manage',           Icon: List       },
            { key: 'sources', label: 'Sources',           Icon: Database   },
            { key: 'compare', label: 'Compare Snapshots', Icon: GitCompare },
          ] as const).map(({ key, label, Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
                tab === key
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700',
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>

        {/* Compare tab */}
        {tab === 'compare' && (
          <SnapshotComparisonPanel snapshots={snapshots} />
        )}

        {/* Sources tab */}
        {tab === 'sources' && (
          <SourcesTab
            portfolios={portfolios}
            activePortfolioId={activePortfolioId}
            onRefreshSuccess={(updated) => updatePortfolio(updated)}
          />
        )}

        {/* Manage tab */}
        {tab === 'manage' && (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

            {/* ── Portfolio list ──────────────────────────────────────── */}
            <div className="lg:col-span-3 space-y-3">
              <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">
                Your Portfolios
              </h2>

              {loading && portfolios.length === 0 ? (
                <div className="flex items-center gap-2 text-sm text-slate-400 py-6 justify-center">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading…
                </div>
              ) : portfolios.length === 0 ? (
                <div className="rounded-xl border-2 border-dashed border-slate-200 py-12 text-center">
                  <Briefcase className="h-8 w-8 text-slate-300 mx-auto mb-3" />
                  <p className="text-sm font-medium text-slate-500">No portfolios yet</p>
                  <p className="text-xs text-slate-400 mt-1 mb-4">
                    Upload a CSV or Excel file to get started.
                  </p>
                  <Link
                    href="/upload"
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:underline"
                  >
                    <Upload className="h-4 w-4" /> Upload portfolio
                  </Link>
                </div>
              ) : (
                <div className="space-y-2">
                  {portfolios.map((p) => (
                    <PortfolioRow
                      key={p.id}
                      portfolio={p}
                      isActive={p.id === activePortfolioId}
                      isSelected={p.id === displayId}
                      onSelect={() => setSelectedId(p.id)}
                      onActivate={() => activate(p.id)}
                      onRename={(name) => rename(p.id, name)}
                      onDelete={() => remove(p.id)}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* ── Snapshot panel ──────────────────────────────────────── */}
            <div className="lg:col-span-2 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">
                  Snapshot History
                </h2>
                {selectedPortfolio && (
                  <span className="text-xs text-slate-400 truncate max-w-[120px]">
                    {selectedPortfolio.name}
                  </span>
                )}
              </div>

              {/* Create snapshot */}
              {displayId !== null && (
                <div className="flex items-center gap-2">
                  <input
                    value={snapLabel}
                    onChange={(e) => setSnapLabel(e.target.value)}
                    placeholder="Optional label…"
                    className="flex-1 text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  />
                  <button
                    onClick={handleCreateSnapshot}
                    disabled={creatingSnap}
                    className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-indigo-600 text-white text-xs font-medium px-2.5 py-1.5 hover:bg-indigo-700 transition-colors disabled:opacity-60"
                  >
                    {creatingSnap
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <Camera className="h-3.5 w-3.5" />
                    }
                    Snapshot
                  </button>
                </div>
              )}

              {snapError && (
                <p className="text-xs text-rose-500">{snapError}</p>
              )}

              {/* Snapshot list */}
              {displayId === null ? (
                <div className="rounded-xl border border-dashed border-slate-200 py-8 text-center">
                  <Camera className="h-7 w-7 text-slate-300 mx-auto mb-2" />
                  <p className="text-xs text-slate-400">Select a portfolio to see snapshots</p>
                </div>
              ) : snapsLoading ? (
                <div className="flex items-center gap-2 text-sm text-slate-400 py-6 justify-center">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading snapshots…
                </div>
              ) : snapshots.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 py-8 text-center">
                  <Camera className="h-7 w-7 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm font-medium text-slate-500">No snapshots yet</p>
                  <p className="text-xs text-slate-400 mt-1">
                    Create one above to start tracking history.
                  </p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[520px] overflow-y-auto pr-0.5">
                  {snapshots.map((snap, i) => (
                    <SnapshotSummaryCard
                      key={snap.id}
                      snapshot={snap}
                      isLatest={i === 0}
                      onDelete={() => deleteSnapshot(snap.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
