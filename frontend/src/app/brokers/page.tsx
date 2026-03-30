/**
 * /brokers — Broker Connections page
 * ------------------------------------
 * Full-page view for managing broker connections across the active portfolio.
 *
 * Layout:
 *   - Header with title + portfolio name
 *   - ConnectorStatusPanel (grid of BrokerConnectorCards)
 *   - Toast-style feedback on connect / sync / disconnect
 */

'use client'

import React, { useState, useCallback } from 'react'
import { Wifi, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react'
import { usePortfolios } from '@/hooks/usePortfolios'
import { useBrokerConnections } from '@/hooks/useBrokerConnections'
import { ConnectorStatusPanel } from '@/components/broker/ConnectorStatusPanel'
import type { BrokerConnectResponse } from '@/types'

// ─── Toast ────────────────────────────────────────────────────────────────────

type ToastKind = 'success' | 'error' | 'info'

interface Toast {
  id:      number
  kind:    ToastKind
  message: string
}

let toastSeq = 0

function ToastList({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  if (toasts.length === 0) return null
  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 w-72">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`flex items-start gap-2.5 rounded-xl border px-4 py-3 shadow-lg text-sm cursor-pointer transition-all
            ${t.kind === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : t.kind === 'error'   ? 'bg-rose-50 border-rose-200 text-rose-800'
              :                        'bg-indigo-50 border-indigo-200 text-indigo-800'}
          `}
          onClick={() => onDismiss(t.id)}
        >
          {t.kind === 'success' ? <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
            : t.kind === 'error'  ? <AlertCircle   className="h-4 w-4 shrink-0 mt-0.5" />
            :                       <RefreshCw      className="h-4 w-4 shrink-0 mt-0.5" />
          }
          <span className="flex-1">{t.message}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BrokersPage() {
  const { portfolios, activePortfolioId } = usePortfolios()
  const portfolioId    = activePortfolioId
  const activePortfolio = portfolios.find(p => p.id === activePortfolioId) ?? null

  const {
    brokers,
    connections,
    isLoading,
    error,
    syncingBroker,
    sync,
    disconnect,
    refresh,
    connect,
  } = useBrokerConnections(portfolioId)

  const [toasts, setToasts] = useState<Toast[]>([])

  const pushToast = useCallback((kind: ToastKind, message: string) => {
    const id = ++toastSeq
    setToasts(prev => [...prev, { id, kind, message }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000)
  }, [])

  const dismissToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const handleConnectSuccess = useCallback((response: BrokerConnectResponse) => {
    if (response.scaffolded) {
      pushToast('info', `${response.broker_name} saved as pending — connector not yet implemented.`)
    } else if (response.success) {
      pushToast('success', `Connected to ${response.broker_name} successfully.`)
    } else {
      pushToast('error', response.message ?? 'Connection failed.')
    }
    refresh()
  }, [pushToast, refresh])

  const handleSync = useCallback(async (brokerName: string) => {
    try {
      const res = await sync(brokerName)
      if (res.scaffolded) {
        pushToast('info', `${brokerName}: sync not yet implemented (scaffolded).`)
      } else {
        pushToast('success', `Synced ${res.holdings_synced ?? 0} holdings from ${brokerName}.`)
      }
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : 'Sync failed.')
    }
  }, [sync, pushToast])

  const handleDisconnect = useCallback(async (brokerName: string) => {
    try {
      await disconnect(brokerName)
      pushToast('success', `Disconnected from ${brokerName}.`)
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : 'Disconnect failed.')
    }
  }, [disconnect, pushToast])

  // ── No active portfolio ──────────────────────────────────────────────────
  if (!portfolioId) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-center">
        <Wifi className="h-8 w-8 text-slate-300" />
        <p className="text-sm font-medium text-slate-600">No active portfolio</p>
        <p className="text-xs text-slate-400">Select a portfolio from the Portfolios page first.</p>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">

      {/* Page header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100">
            <Wifi className="h-5 w-5 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Broker Connections</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Portfolio: <span className="font-medium text-slate-700">{activePortfolio?.name ?? `#${portfolioId}`}</span>
            </p>
          </div>
        </div>
        <button
          onClick={refresh}
          disabled={isLoading}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Architecture callout */}
      <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 px-5 py-4">
        <p className="text-xs font-semibold text-indigo-800 mb-1">Broker Sync Architecture</p>
        <p className="text-xs text-indigo-700 leading-relaxed">
          When a broker is connected and synced, it replaces your portfolio's holdings with live data from the broker API —
          the same refresh pipeline used by file uploads. Pre- and post-sync snapshots are created automatically so you can
          compare changes. Currently, all connectors are <span className="font-semibold">scaffolded</span> — the architecture
          is in place but auth flows require per-broker API credentials.
        </p>
      </div>

      {/* Connector grid */}
      <ConnectorStatusPanel
        portfolioId={portfolioId}
        brokers={brokers}
        connections={connections}
        isLoading={isLoading}
        error={error}
        syncingBroker={syncingBroker}
        onSync={handleSync}
        onDisconnect={handleDisconnect}
        onConnectSuccess={handleConnectSuccess}
        onRetry={refresh}
      />

      {/* Toasts */}
      <ToastList toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}
