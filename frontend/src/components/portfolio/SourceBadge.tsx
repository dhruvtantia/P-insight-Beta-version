/**
 * SourceBadge — reusable source type badge
 * ------------------------------------------
 * Compact coloured pill showing portfolio source.
 * Used in: Topbar switcher, PortfolioSourceCard, portfolios list, debug panel.
 *
 * Sizes: 'xs' (small pill), 'sm' (default), 'md' (larger with icon)
 */

'use client'

import React from 'react'
import { Upload, Database, Briefcase, Bot, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PortfolioMeta } from '@/types'

// ─── Config ───────────────────────────────────────────────────────────────────

export type PortfolioSource = PortfolioMeta['source']

interface SourceConfig {
  label:    string
  icon:     React.ElementType
  bg:       string
  text:     string
  border:   string
  dotColor: string
}

const SOURCE_CONFIG: Record<PortfolioSource, SourceConfig> = {
  mock: {
    label:    'Mock',
    icon:     Briefcase,
    bg:       'bg-slate-100',
    text:     'text-slate-600',
    border:   'border-slate-200',
    dotColor: 'bg-slate-400',
  },
  uploaded: {
    label:    'Uploaded',
    icon:     Upload,
    bg:       'bg-indigo-50',
    text:     'text-indigo-700',
    border:   'border-indigo-200',
    dotColor: 'bg-indigo-500',
  },
  manual: {
    label:    'Manual',
    icon:     Bot,
    bg:       'bg-amber-50',
    text:     'text-amber-700',
    border:   'border-amber-200',
    dotColor: 'bg-amber-400',
  },
  broker: {
    label:    'Broker',
    icon:     Database,
    bg:       'bg-emerald-50',
    text:     'text-emerald-700',
    border:   'border-emerald-200',
    dotColor: 'bg-emerald-500',
  },
}

const FALLBACK: SourceConfig = SOURCE_CONFIG.mock

// ─── Component ────────────────────────────────────────────────────────────────

export interface SourceBadgeProps {
  source:      PortfolioSource
  size?:       'xs' | 'sm' | 'md'
  /** Show the icon alongside the label */
  showIcon?:   boolean
  /** Show a dot instead of the full pill — useful in compact lists */
  dotOnly?:    boolean
  className?:  string
}

export function SourceBadge({
  source,
  size     = 'sm',
  showIcon = false,
  dotOnly  = false,
  className,
}: SourceBadgeProps): React.ReactElement {
  const cfg   = SOURCE_CONFIG[source] ?? FALLBACK
  const { icon: Icon } = cfg

  if (dotOnly) {
    return (
      <span
        className={cn('inline-block rounded-full', cfg.dotColor, {
          'h-1.5 w-1.5': size === 'xs',
          'h-2 w-2':     size === 'sm',
          'h-2.5 w-2.5': size === 'md',
        }, className)}
        title={cfg.label}
      />
    )
  }

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
        <Icon className={cn({
          'h-2.5 w-2.5': size === 'xs' || size === 'sm',
          'h-3 w-3':     size === 'md',
        })} />
      )}
      {cfg.label}
    </span>
  )
}

// ─── Refreshable indicator ────────────────────────────────────────────────────

/** Small icon + label shown when a portfolio is eligible for refresh/re-import. */
export function RefreshableIndicator({ className }: { className?: string }): React.ReactElement {
  return (
    <span className={cn(
      'inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600',
      className,
    )}>
      <RefreshCw className="h-2.5 w-2.5" />
      Refreshable
    </span>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Return the display label for a source key. */
export function sourceLabel(source: PortfolioSource): string {
  return (SOURCE_CONFIG[source] ?? FALLBACK).label
}
