/**
 * ConnectorStatusPanel
 * ---------------------
 * Overview panel showing all broker connections for the active portfolio.
 * Used in the Portfolios → Sources tab and the dedicated /brokers page.
 *
 * Shows:
 *   - A grid of BrokerConnectorCards (one per registered broker)
 *   - An inline BrokerConnectionFlow when the user clicks Connect
 *   - Loading skeleton while fetching
 *   - Error state with retry
 */

'use client'

import React, { useState, useCallback } from 'react'
import { RefreshCw, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { BrokerConnectorCard } from './BrokerConnectorCard'
import { BrokerConnectionFlow } from './BrokerConnectionFlow'
import type { BrokerInfo, BrokerConnection, BrokerConnectResponse } from '@/types'

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ConnectorStatusPanelProps {
  portfolioId:   number
  brokers:       BrokerInfo[]
  connections:   Record<string, BrokerConnection>   // broker_name → connection
  isLoading?:    boolean
  error?:        string | null
  syncingBroker?: string | null
  onConnect?:    (brokerName: string) => void
  onSync?:       (brokerName: string) => void
  onDisconnect?: (brokerName: string) => void
  onConnectSuccess?: (response: BrokerConnectResponse) => void
  onRetry?:      () => void
  className?:    string
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function CardSkeleton(): React.ReactElement {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3 animate-pulse">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-xl bg-slate-100" />
        <div className="flex-1 space-y-2">
          <div className="h-3 w-28 rounded bg-slate-100" />
          <div className="h-2.5 w-40 rounded bg-slate-100" />
        </div>
      </div>
      <div className="flex gap-1.5">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-4 w-12 rounded bg-slate-100" />
        ))}
      </div>
      <div className="h-8 rounded-lg bg-slate-100" />
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ConnectorStatusPanel({
  portfolioId,
  brokers,
  connections,
  isLoading     = false,
  error         = null,
  syncingBroker = null,
  onConnect,
  onSync,
  onDisconnect,
  onConnectSuccess,
  onRetry,
  className,
}: ConnectorStatusPanelProps): React.ReactElement {

  const [connectingFor, setConnectingFor] = useState<string | null>(null)

  const handleConnectClick = useCallback((brokerName: string) => {
    setConnectingFor(brokerName)
    onConnect?.(brokerName)
  }, [onConnect])

  const handleFlowSuccess = useCallback((response: BrokerConnectResponse) => {
    setConnectingFor(null)
    onConnectSuccess?.(response)
  }, [onConnectSuccess])

  const handleFlowCancel = useCallback(() => {
    setConnectingFor(null)
  }, [])

  // ── Loading ────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className={cn('space-y-4', className)}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => <CardSkeleton key={i} />)}
        </div>
      </div>
    )
  }

  // ── Error ──────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className={cn(
        'flex flex-col items-center gap-3 py-10 rounded-xl border border-rose-100 bg-rose-50 text-center',
        className,
      )}>
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-100">
          <AlertTriangle className="h-5 w-5 text-rose-500" />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900">Failed to load broker connectors</p>
          <p className="text-xs text-slate-500 mt-0.5">{error}</p>
        </div>
        {onRetry && (
          <button
            onClick={onRetry}
            className="flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Retry
          </button>
        )}
      </div>
    )
  }

  // ── Inline connection flow ─────────────────────────────────────────────────
  if (connectingFor !== null) {
    return (
      <BrokerConnectionFlow
        portfolioId={portfolioId}
        brokers={brokers}
        onSuccess={handleFlowSuccess}
        onCancel={handleFlowCancel}
        className={className}
      />
    )
  }

  // ── Main grid ──────────────────────────────────────────────────────────────
  if (brokers.length === 0) {
    return (
      <div className={cn(
        'flex flex-col items-center gap-2 py-10 text-center',
        className,
      )}>
        <p className="text-sm text-slate-500">No broker connectors registered.</p>
        <p className="text-xs text-slate-400">Add connectors to the backend CONNECTOR_REGISTRY.</p>
      </div>
    )
  }

  // Split: implemented first, then scaffolded
  const sorted = [...brokers].sort((a, b) => {
    if (a.is_implemented === b.is_implemented) return a.display_name.localeCompare(b.display_name)
    return a.is_implemented ? -1 : 1
  })

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">
          {brokers.filter(b => b.is_implemented).length} live · {brokers.filter(b => !b.is_implemented).length} coming soon
        </p>
        <p className="text-[10px] text-slate-400">
          {Object.values(connections).filter(c => c.connection_state === 'connected').length} connected for this portfolio
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sorted.map((broker) => (
          <BrokerConnectorCard
            key={broker.broker_name}
            broker={broker}
            connection={connections[broker.broker_name] ?? null}
            isSyncing={syncingBroker === broker.broker_name}
            onConnect={handleConnectClick}
            onSync={onSync}
            onDisconnect={onDisconnect}
          />
        ))}
      </div>
    </div>
  )
}
