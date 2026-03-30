/**
 * BrokerConnectionFlow
 * ---------------------
 * Step-by-step panel for connecting a broker to a portfolio.
 *
 * Steps:
 *   1. Select broker  — shows BrokerConnectorCard for each available broker
 *   2. Configure       — enter account_id + any required non-secret fields
 *   3. Connecting…    — spinner while POST /brokers/{id}/connect runs
 *   4. Result          — success or error state
 *
 * For scaffolded connectors: step 2 is skipped and step 4 shows
 * a clear "not yet implemented" message with docs link.
 */

'use client'

import React, { useState, useCallback } from 'react'
import {
  ArrowLeft, ChevronRight, CheckCircle2, AlertCircle,
  Sparkles, ExternalLink, X, Wifi,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { brokerApi } from '@/services/api'
import { SourceSyncStatusBadge } from './SourceSyncStatusBadge'
import type { BrokerInfo, BrokerConnectResponse } from '@/types'

// ─── Types ─────────────────────────────────────────────────────────────────────

type Step = 'select' | 'configure' | 'connecting' | 'result'

// ─── Component ────────────────────────────────────────────────────────────────

export interface BrokerConnectionFlowProps {
  portfolioId:  number
  brokers:      BrokerInfo[]
  onSuccess?:   (response: BrokerConnectResponse) => void
  onCancel?:    () => void
  className?:   string
}

export function BrokerConnectionFlow({
  portfolioId,
  brokers,
  onSuccess,
  onCancel,
  className,
}: BrokerConnectionFlowProps): React.ReactElement {

  const [step,       setStep]       = useState<Step>('select')
  const [selected,   setSelected]   = useState<BrokerInfo | null>(null)
  const [accountId,  setAccountId]  = useState('')
  const [result,     setResult]     = useState<BrokerConnectResponse | null>(null)
  const [error,      setError]      = useState<string | null>(null)

  const handleSelect = useCallback((broker: BrokerInfo) => {
    setSelected(broker)
    setStep('configure')
  }, [])

  const handleConnect = useCallback(async () => {
    if (!selected) return
    setStep('connecting')
    setError(null)
    try {
      const res = await brokerApi.connect(
        portfolioId,
        selected.broker_name,
        accountId.trim() || undefined,
      )
      setResult(res)
      setStep('result')
      if (res.success) onSuccess?.(res)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connection failed')
      setStep('result')
    }
  }, [selected, portfolioId, accountId, onSuccess])

  const reset = useCallback(() => {
    setStep('select')
    setSelected(null)
    setAccountId('')
    setResult(null)
    setError(null)
  }, [])

  return (
    <div className={cn('rounded-xl border border-slate-200 bg-white overflow-hidden', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          {step !== 'select' && (
            <button onClick={reset} className="text-slate-400 hover:text-slate-600 mr-1">
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <Wifi className="h-4 w-4 text-indigo-500" />
          <p className="text-sm font-semibold text-slate-800">
            {step === 'select'     ? 'Connect a Broker'
              : step === 'configure' ? `Configure ${selected?.display_name}`
              : step === 'connecting'? 'Connecting…'
              : 'Connection Result'
            }
          </p>
        </div>
        {onCancel && (
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="p-5">

        {/* Step 1 — Select broker */}
        {step === 'select' && (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">
              Choose a broker to connect. Scaffolded connectors are shown so you can see what's coming.
            </p>
            <div className="space-y-2">
              {brokers.map((b) => (
                <button
                  key={b.broker_name}
                  onClick={() => handleSelect(b)}
                  className={cn(
                    'w-full flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all',
                    b.is_implemented
                      ? 'border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/30 bg-white'
                      : 'border-dashed border-slate-200 bg-slate-50 cursor-pointer',
                  )}
                >
                  <span className="text-xl shrink-0">
                    {{ IN: '🇮🇳', US: '🇺🇸', Global: '🌐' }[b.region] ?? '🌐'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-slate-800 truncate">{b.display_name}</p>
                      {!b.is_implemented && (
                        <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-purple-600 bg-purple-50 border border-purple-100 rounded-full px-1.5 py-0.5">
                          <Sparkles className="h-2 w-2" /> Soon
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-400 truncate">{b.description}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-300 shrink-0" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2 — Configure */}
        {step === 'configure' && selected && (
          <div className="space-y-4">
            {!selected.is_implemented && (
              <div className="rounded-lg bg-purple-50 border border-purple-100 px-3 py-2.5 text-xs text-purple-700 flex items-start gap-2">
                <Sparkles className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Scaffolded connector</p>
                  <p className="mt-0.5">
                    {selected.display_name} is not yet implemented. Clicking Connect will
                    save a pending state so you can track progress. No real connection will be made.
                  </p>
                  {selected.docs_url && (
                    <a href={selected.docs_url} target="_blank" rel="noopener noreferrer"
                       className="inline-flex items-center gap-1 mt-1 font-medium hover:underline">
                      View API docs <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  )}
                </div>
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Account ID <span className="text-slate-400 font-normal">(optional — non-secret)</span>
                </label>
                <input
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  placeholder={`e.g. ${selected.broker_name === 'zerodha' ? 'ZY1234' : 'U123456'}`}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400"
                />
              </div>

              {selected.required_config_fields.length > 0 && (
                <div className="rounded-lg bg-amber-50 border border-amber-100 px-3 py-2 text-xs text-amber-700">
                  <p className="font-semibold mb-1">Required fields for full integration:</p>
                  <p className="font-mono">{selected.required_config_fields.join(', ')}</p>
                  <p className="mt-1 text-amber-600">
                    These will be required once the connector is fully implemented.
                    Set them via environment variables — never in the UI.
                  </p>
                </div>
              )}
            </div>

            <div className="flex justify-between pt-2 border-t border-slate-100">
              <button onClick={reset} className="text-xs text-slate-500 hover:text-slate-700">
                Cancel
              </button>
              <button
                onClick={handleConnect}
                className={cn(
                  'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
                  selected.is_implemented
                    ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                    : 'bg-purple-600 text-white hover:bg-purple-700',
                )}
              >
                <Wifi className="h-3.5 w-3.5" />
                {selected.is_implemented ? 'Connect' : 'Save pending state'}
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Step 3 — Connecting spinner */}
        {step === 'connecting' && (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <div className="h-10 w-10 rounded-full border-4 border-indigo-400 border-t-transparent animate-spin" />
            <p className="text-sm font-medium text-slate-700">Connecting to {selected?.display_name}…</p>
            <p className="text-xs text-slate-400">Validating credentials and testing connection</p>
          </div>
        )}

        {/* Step 4 — Result */}
        {step === 'result' && (
          <div className="space-y-4">
            {result?.scaffolded ? (
              <div className="flex flex-col items-center gap-3 py-4 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-purple-100">
                  <Sparkles className="h-6 w-6 text-purple-500" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900">Scaffolded — pending state saved</p>
                  <p className="text-xs text-slate-500 mt-1 max-w-xs">
                    {selected?.display_name} is not yet implemented. The connection state has been
                    saved as "pending". You'll be notified when this connector is ready.
                  </p>
                </div>
                <SourceSyncStatusBadge state="pending" size="sm" />
              </div>
            ) : error || !result?.success ? (
              <div className="flex flex-col items-center gap-3 py-4 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-100">
                  <AlertCircle className="h-6 w-6 text-rose-500" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900">Connection failed</p>
                  <p className="text-xs text-slate-500 mt-1">{error || result?.message}</p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 py-4 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
                  <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900">Connected!</p>
                  <p className="text-xs text-slate-500 mt-1">{result.message}</p>
                </div>
                <SourceSyncStatusBadge state="connected" size="sm" />
              </div>
            )}

            <div className="flex justify-center gap-3 pt-2 border-t border-slate-100">
              <button onClick={reset} className="text-xs text-indigo-600 hover:underline font-medium">
                Connect another broker
              </button>
              {onCancel && (
                <button onClick={onCancel} className="text-xs text-slate-500 hover:text-slate-700">
                  Done
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
