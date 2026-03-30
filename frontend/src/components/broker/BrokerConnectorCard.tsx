/**
 * BrokerConnectorCard
 * --------------------
 * Card representing one available broker connector.
 * Shows status, capabilities, and a Connect/Disconnect CTA.
 *
 * States the card can show:
 *   - "Coming soon"  — is_implemented=false (scaffold)
 *   - "Not configured" — is_configured=false on the server
 *   - "Connect"      — not yet connected to this portfolio
 *   - "Connected"    — live connection
 *   - "Error"        — last attempt failed
 */

'use client'

import React from 'react'
import {
  Wifi, WifiOff, AlertCircle, Sparkles, Globe, ExternalLink,
  ChevronRight, RefreshCw, Unplug,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { SourceSyncStatusBadge } from './SourceSyncStatusBadge'
import type { BrokerInfo, BrokerConnection } from '@/types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtRelative(iso: string | null | undefined): string {
  if (!iso) return 'Never'
  try {
    const diff  = Date.now() - new Date(iso).getTime()
    const mins  = Math.floor(diff / 60_000)
    const hours = Math.floor(diff / 3_600_000)
    const days  = Math.floor(diff / 86_400_000)
    if (mins  < 2)  return 'Just now'
    if (hours < 1)  return `${mins}m ago`
    if (hours < 24) return `${hours}h ago`
    return `${days}d ago`
  } catch { return '—' }
}

// Region flag for visual context
const REGION_FLAG: Record<string, string> = {
  IN:     '🇮🇳',
  US:     '🇺🇸',
  Global: '🌐',
}

// ─── Component ────────────────────────────────────────────────────────────────

export interface BrokerConnectorCardProps {
  broker:       BrokerInfo
  connection:   BrokerConnection | null  // null = never connected
  onConnect?:   (brokerName: string) => void
  onSync?:      (brokerName: string) => void
  onDisconnect?:(brokerName: string) => void
  isSyncing?:   boolean
  className?:   string
}

export function BrokerConnectorCard({
  broker,
  connection,
  onConnect,
  onSync,
  onDisconnect,
  isSyncing = false,
  className,
}: BrokerConnectorCardProps): React.ReactElement {

  const isScaffolded    = !broker.is_implemented
  const state           = isScaffolded ? 'scaffolded'
    : connection?.connection_state ?? 'disconnected'
  const isConnected     = state === 'connected'
  const hasError        = state === 'error'
  const flag            = REGION_FLAG[broker.region] ?? '🌐'

  return (
    <div className={cn(
      'relative rounded-xl border bg-white overflow-hidden transition-shadow hover:shadow-md',
      isConnected ? 'border-emerald-200' : 'border-slate-200',
      className,
    )}>
      {/* Scaffold ribbon */}
      {isScaffolded && (
        <div className="absolute top-3 right-3">
          <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 text-purple-700 text-[9px] font-bold px-2 py-0.5 border border-purple-200">
            <Sparkles className="h-2.5 w-2.5" />
            Coming soon
          </span>
        </div>
      )}

      {/* Header */}
      <div className="px-5 pt-4 pb-3">
        <div className="flex items-start gap-3">
          {/* Logo placeholder */}
          <div className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border text-lg',
            isConnected ? 'bg-emerald-50 border-emerald-200'
              : isScaffolded ? 'bg-purple-50 border-purple-100'
              : 'bg-slate-50 border-slate-200',
          )}>
            {flag}
          </div>

          <div className="flex-1 min-w-0 pr-16">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-bold text-slate-900">{broker.display_name}</p>
              <SourceSyncStatusBadge state={state} size="xs" />
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed line-clamp-2">
              {broker.description}
            </p>
          </div>
        </div>
      </div>

      {/* Metadata */}
      <div className="px-5 pb-3 space-y-1.5">
        <div className="flex flex-wrap gap-1.5">
          {broker.asset_classes.slice(0, 4).map((ac) => (
            <span key={ac} className="text-[9px] font-medium bg-slate-100 text-slate-500 rounded px-1.5 py-0.5">
              {ac}
            </span>
          ))}
        </div>

        <div className="flex items-center gap-3 text-[10px] text-slate-400">
          <span className="flex items-center gap-1">
            <Globe className="h-2.5 w-2.5" /> {broker.region}
          </span>
          <span>·</span>
          <span>{broker.auth_method}</span>
          {broker.docs_url && (
            <>
              <span>·</span>
              <a
                href={broker.docs_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-0.5 hover:text-indigo-600 transition-colors"
                onClick={(e) => e.stopPropagation()}
              >
                Docs <ExternalLink className="h-2.5 w-2.5" />
              </a>
            </>
          )}
        </div>

        {/* Connection details */}
        {isConnected && connection && (
          <div className="text-[10px] text-slate-500 space-y-0.5">
            {connection.account_id && (
              <p>Account: <span className="font-mono text-slate-700">{connection.account_id}</span></p>
            )}
            <p>Last synced: <span className="font-medium text-slate-700">{fmtRelative(connection.last_sync_at)}</span></p>
          </div>
        )}

        {/* Error message */}
        {hasError && connection?.sync_error && (
          <div className="flex items-start gap-1.5 rounded-md bg-rose-50 border border-rose-100 px-2 py-1.5 text-[10px] text-rose-700">
            <AlertCircle className="h-3 w-3 shrink-0 mt-0.5" />
            <span className="line-clamp-2">{connection.sync_error}</span>
          </div>
        )}

        {/* Scaffold explanation */}
        {isScaffolded && (
          <div className="flex items-start gap-1.5 rounded-md bg-purple-50 border border-purple-100 px-2 py-1.5 text-[10px] text-purple-700">
            <Sparkles className="h-3 w-3 shrink-0 mt-0.5" />
            <span>This connector is scaffolded. The architecture is in place but the auth flow is not yet implemented.</span>
          </div>
        )}
      </div>

      {/* Footer actions */}
      <div className="px-5 pb-4 flex items-center gap-2">
        {isConnected ? (
          <>
            <button
              onClick={() => onSync?.(broker.broker_name)}
              disabled={isSyncing}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold py-2 hover:bg-emerald-700 transition-colors disabled:opacity-60"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', isSyncing && 'animate-spin')} />
              {isSyncing ? 'Syncing…' : 'Sync Now'}
            </button>
            <button
              onClick={() => onDisconnect?.(broker.broker_name)}
              title="Disconnect"
              className="p-2 rounded-lg border border-slate-200 text-slate-400 hover:text-rose-500 hover:border-rose-200 transition-colors"
            >
              <Unplug className="h-4 w-4" />
            </button>
          </>
        ) : (
          <button
            onClick={() => !isScaffolded && onConnect?.(broker.broker_name)}
            disabled={isScaffolded}
            className={cn(
              'w-full flex items-center justify-center gap-1.5 rounded-lg text-xs font-semibold py-2 transition-colors',
              isScaffolded
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                : hasError
                ? 'bg-rose-600 text-white hover:bg-rose-700'
                : 'bg-indigo-600 text-white hover:bg-indigo-700',
            )}
          >
            {isScaffolded ? (
              <><Sparkles className="h-3.5 w-3.5" /> Coming soon</>
            ) : hasError ? (
              <><RefreshCw className="h-3.5 w-3.5" /> Reconnect</>
            ) : (
              <><Wifi className="h-3.5 w-3.5" /> Connect <ChevronRight className="h-3.5 w-3.5" /></>
            )}
          </button>
        )}
      </div>
    </div>
  )
}
