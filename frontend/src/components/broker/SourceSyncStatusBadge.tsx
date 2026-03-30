/**
 * SourceSyncStatusBadge
 * ----------------------
 * Coloured pill showing broker connection / sync state.
 * Used in BrokerConnectorCard, ConnectorStatusPanel, PortfolioSourceCard.
 *
 * States:
 *   disconnected  — slate    "Not connected"
 *   pending       — amber    "Pending"
 *   connected     — emerald  "Connected"
 *   syncing       — indigo   "Syncing…" (animated)
 *   error         — rose     "Error"
 *   scaffolded    — purple   "Coming soon"  (not a DB state, UI-only)
 */

'use client'

import React from 'react'
import { CheckCircle2, Clock, AlertCircle, RefreshCw, Wifi, WifiOff, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { BrokerSyncState } from '@/types'

// ─── Config ───────────────────────────────────────────────────────────────────

type BadgeState = BrokerSyncState | 'scaffolded'

interface StateConfig {
  label:   string
  icon:    React.ElementType
  bg:      string
  text:    string
  border:  string
  animate: boolean
}

const STATE_CONFIG: Record<BadgeState, StateConfig> = {
  disconnected: {
    label: 'Not connected', icon: WifiOff,
    bg: 'bg-slate-100', text: 'text-slate-500', border: 'border-slate-200', animate: false,
  },
  pending: {
    label: 'Pending', icon: Clock,
    bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', animate: false,
  },
  connected: {
    label: 'Connected', icon: CheckCircle2,
    bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', animate: false,
  },
  syncing: {
    label: 'Syncing…', icon: RefreshCw,
    bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200', animate: true,
  },
  error: {
    label: 'Error', icon: AlertCircle,
    bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200', animate: false,
  },
  scaffolded: {
    label: 'Coming soon', icon: Sparkles,
    bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200', animate: false,
  },
}

// ─── Component ────────────────────────────────────────────────────────────────

export interface SourceSyncStatusBadgeProps {
  state:       BadgeState
  size?:       'xs' | 'sm' | 'md'
  showIcon?:   boolean
  className?:  string
}

export function SourceSyncStatusBadge({
  state,
  size = 'sm',
  showIcon = true,
  className,
}: SourceSyncStatusBadgeProps): React.ReactElement {
  const cfg    = STATE_CONFIG[state] ?? STATE_CONFIG.disconnected
  const { icon: Icon } = cfg

  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded-full border font-medium leading-none',
      cfg.bg, cfg.text, cfg.border,
      {
        'text-[9px] px-1.5 py-0.5':  size === 'xs',
        'text-[10px] px-2 py-0.5':   size === 'sm',
        'text-xs px-2.5 py-1':        size === 'md',
      },
      className,
    )}>
      {showIcon && (
        <Icon className={cn(
          { 'h-2.5 w-2.5': size === 'xs' || size === 'sm', 'h-3 w-3': size === 'md' },
          cfg.animate && 'animate-spin',
        )} />
      )}
      {cfg.label}
    </span>
  )
}

/** Compact dot-only version. */
export function SyncStateDot({ state, className }: { state: BadgeState; className?: string }): React.ReactElement {
  const cfg = STATE_CONFIG[state] ?? STATE_CONFIG.disconnected
  const dotColor = {
    disconnected: 'bg-slate-300',
    pending:      'bg-amber-400',
    connected:    'bg-emerald-500',
    syncing:      'bg-indigo-400',
    error:        'bg-rose-500',
    scaffolded:   'bg-purple-400',
  }[state] ?? 'bg-slate-300'

  return (
    <span
      className={cn('inline-block h-2 w-2 rounded-full', dotColor, className)}
      title={cfg.label}
    />
  )
}
