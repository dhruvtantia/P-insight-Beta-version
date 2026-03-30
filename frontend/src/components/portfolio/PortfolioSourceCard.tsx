/**
 * PortfolioSourceCard
 * --------------------
 * Full-width card showing all source metadata for a portfolio:
 *   - Source type badge + icon
 *   - Portfolio name + description
 *   - Upload filename (if uploaded)
 *   - Last synced timestamp
 *   - Created / updated timestamps
 *   - Refreshability status
 *   - CTA button: "Re-import" (for uploaded) or "Sync Now" (for broker, future)
 *
 * Designed to be embedded in the Portfolios page source management section.
 */

'use client'

import React from 'react'
import {
  Upload, Database, Briefcase, Bot,
  Clock, Calendar, RefreshCw, ChevronRight,
  CheckCircle2, Info, Wifi,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { SourceBadge, RefreshableIndicator } from './SourceBadge'
import { SourceSyncStatusBadge } from '@/components/broker/SourceSyncStatusBadge'
import type { PortfolioMeta, BrokerConnection } from '@/types'
import { parseSourceMeta } from '@/types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDatetime(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch { return iso }
}

function fmtRelative(iso: string | null | undefined): string {
  if (!iso) return 'Never'
  try {
    const diff   = Date.now() - new Date(iso).getTime()
    const mins   = Math.floor(diff / 60_000)
    const hours  = Math.floor(diff / 3_600_000)
    const days   = Math.floor(diff / 86_400_000)
    if (mins  < 2)   return 'Just now'
    if (mins  < 60)  return `${mins}m ago`
    if (hours < 24)  return `${hours}h ago`
    if (days  < 30)  return `${days}d ago`
    return fmtDatetime(iso)
  } catch { return '—' }
}

const SOURCE_ICONS: Record<PortfolioMeta['source'], React.ElementType> = {
  mock:     Briefcase,
  uploaded: Upload,
  manual:   Bot,
  broker:   Database,
}

const SOURCE_DESCRIPTIONS: Record<PortfolioMeta['source'], string> = {
  mock:     'Demo portfolio using built-in mock data. Cannot be refreshed.',
  uploaded: 'Portfolio imported from a CSV or Excel file. You can re-import to update it.',
  manual:   'Portfolio created manually. Edit individual holdings to update.',
  broker:   'Portfolio synced from a broker account. Connect your broker to refresh.',
}

// ─── Metadata row ─────────────────────────────────────────────────────────────

function MetaRow({
  icon: Icon,
  label,
  value,
  className,
}: {
  icon:       React.ElementType
  label:      string
  value:      React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex items-start gap-2 text-xs', className)}>
      <Icon className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5" />
      <span className="text-slate-500 shrink-0 w-24">{label}</span>
      <span className="text-slate-700 font-medium">{value}</span>
    </div>
  )
}

// ─── Source status section ────────────────────────────────────────────────────

function SourceStatus({
  portfolio,
  brokerConnection,
}: {
  portfolio:         PortfolioMeta
  brokerConnection?: BrokerConnection | null
}) {
  const { source, is_refreshable, last_synced_at } = portfolio

  if (source === 'mock') {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
        <Info className="h-3.5 w-3.5 text-slate-400 shrink-0" />
        <span>Mock data is read-only. Upload your own portfolio to track real positions.</span>
      </div>
    )
  }

  if (source === 'broker') {
    const connState = brokerConnection?.connection_state ?? 'disconnected'
    const connBroker = brokerConnection?.broker_name
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <Wifi className="h-3.5 w-3.5 shrink-0 text-indigo-500" />
            <span className="font-medium">{connBroker ?? 'No broker'}</span>
          </div>
          <SourceSyncStatusBadge state={connState} size="xs" />
        </div>
        {brokerConnection?.last_sync_at && (
          <p className="text-[10px] text-slate-400">
            Last synced: <span className="font-medium text-slate-600">{fmtRelative(brokerConnection.last_sync_at)}</span>
          </p>
        )}
        {brokerConnection?.sync_error && (
          <p className="text-[10px] text-rose-600 bg-rose-50 rounded px-2 py-1">{brokerConnection.sync_error}</p>
        )}
        {!brokerConnection && (
          <p className="text-[10px] text-slate-400">No broker connected. Use the Brokers page to connect.</p>
        )}
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
        {is_refreshable
          ? <>Last synced <span className="font-medium text-slate-700">{fmtRelative(last_synced_at)}</span></>
          : <span>Static portfolio — not refreshable</span>
        }
      </div>
      {is_refreshable && (
        <RefreshableIndicator />
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export interface PortfolioSourceCardProps {
  portfolio:         PortfolioMeta
  /** Live broker connection for this portfolio (if source === 'broker') */
  brokerConnection?: BrokerConnection | null
  /** Called when user clicks "Re-import" or "Sync Now" */
  onRefresh?:        () => void
  /** If true, shows a more compact layout without full description */
  compact?:          boolean
  className?:        string
}

export function PortfolioSourceCard({
  portfolio,
  brokerConnection,
  onRefresh,
  compact = false,
  className,
}: PortfolioSourceCardProps): React.ReactElement {

  const {
    source, name, description, upload_filename,
    last_synced_at, created_at, updated_at,
    num_holdings, is_refreshable,
  } = portfolio

  const SourceIcon = SOURCE_ICONS[source] ?? Briefcase
  const sourceDesc = SOURCE_DESCRIPTIONS[source] ?? ''
  const meta       = parseSourceMeta(portfolio)

  return (
    <div className={cn(
      'rounded-xl border border-slate-200 bg-white overflow-hidden',
      className,
    )}>
      {/* Header strip */}
      <div className="flex items-start justify-between gap-4 px-5 pt-4 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-3 min-w-0">
          <div className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border',
            source === 'uploaded' ? 'bg-indigo-50 border-indigo-100'
              : source === 'broker' ? 'bg-emerald-50 border-emerald-100'
              : source === 'manual' ? 'bg-amber-50 border-amber-100'
              : 'bg-slate-50 border-slate-200',
          )}>
            <SourceIcon className={cn(
              'h-4 w-4',
              source === 'uploaded' ? 'text-indigo-600'
                : source === 'broker' ? 'text-emerald-600'
                : source === 'manual' ? 'text-amber-600'
                : 'text-slate-500',
            )} />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-slate-900 text-sm truncate">{name}</p>
            {!compact && description && (
              <p className="text-xs text-slate-400 truncate mt-0.5">{description}</p>
            )}
          </div>
        </div>
        <SourceBadge source={source} size="sm" showIcon />
      </div>

      {/* Metadata grid */}
      <div className="px-5 py-4 space-y-2.5">
        {!compact && (
          <p className="text-xs text-slate-500 leading-relaxed mb-3">{sourceDesc}</p>
        )}

        <MetaRow icon={Briefcase} label="Holdings" value={`${num_holdings} position${num_holdings !== 1 ? 's' : ''}`} />

        {upload_filename && (
          <MetaRow icon={Upload} label="File" value={
            <span className="font-mono text-[10px] bg-slate-100 rounded px-1.5 py-0.5">
              {upload_filename}
            </span>
          } />
        )}

        {(meta.row_count != null) && (
          <MetaRow icon={Info} label="Rows" value={`${meta.row_count} imported`} />
        )}

        <MetaRow
          icon={Clock}
          label="Last synced"
          value={last_synced_at ? fmtRelative(last_synced_at) : '—'}
        />

        {!compact && (
          <>
            <MetaRow icon={Calendar} label="Created" value={fmtDatetime(created_at)} />
            <MetaRow icon={RefreshCw} label="Updated" value={fmtRelative(updated_at)} />
          </>
        )}
      </div>

      {/* Footer — status + refresh button */}
      <div className="px-5 pb-4 space-y-3">
        <SourceStatus portfolio={portfolio} brokerConnection={brokerConnection} />

        {is_refreshable && onRefresh && (
          <button
            onClick={onRefresh}
            className={cn(
              'w-full flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-semibold transition-colors',
              source === 'broker'
                ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                : 'bg-indigo-600 text-white hover:bg-indigo-700',
            )}
          >
            {source === 'broker' ? (
              <><Database className="h-4 w-4" /> Sync Now</>
            ) : (
              <><RefreshCw className="h-4 w-4" /> Re-import File</>
            )}
            <ChevronRight className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  )
}
