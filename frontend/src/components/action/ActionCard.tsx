/**
 * ActionCard
 * -----------
 * Individual action item in the Action Center.
 * Visual style driven by the action's `type` (warning / suggestion / info / success).
 *
 * Each action has:
 *   - type-based colour scheme
 *   - category badge
 *   - title + description
 *   - optional CTA link
 */

'use client'

import React from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  Info,
  Zap,
  TrendingUp,
  Shield,
  Upload,
  Camera,
  BarChart2,
  Eye,
  Brain,
  ArrowRight,
  CheckCircle2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Action, ActionType, ActionCategory } from '@/types'

// ─── Category icon map ────────────────────────────────────────────────────────

const CATEGORY_ICONS: Record<ActionCategory, React.ElementType> = {
  portfolio: TrendingUp,
  optimizer: Zap,
  upload:    Upload,
  watchlist: Eye,
  snapshot:  Camera,
  advisor:   Brain,
}

const CATEGORY_LABELS: Record<ActionCategory, string> = {
  portfolio: 'Portfolio',
  optimizer: 'Optimizer',
  upload:    'Upload',
  watchlist: 'Watchlist',
  snapshot:  'Snapshot',
  advisor:   'Advisor',
}

// ─── Type styling ─────────────────────────────────────────────────────────────

const TYPE_STYLES: Record<ActionType, {
  border: string; icon: string; badge: string; marker: string; IconEl: React.ElementType
}> = {
  warning: {
    border: 'border-amber-200 dark:border-amber-700',
    icon:   'bg-amber-50  dark:bg-amber-900/30  text-amber-500',
    badge:  'bg-amber-50  dark:bg-amber-900/30  text-amber-600 dark:text-amber-400',
    marker: 'bg-amber-400',
    IconEl: AlertTriangle,
  },
  suggestion: {
    border: 'border-indigo-200 dark:border-indigo-700',
    icon:   'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-500',
    badge:  'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400',
    marker: 'bg-indigo-400',
    IconEl: Zap,
  },
  info: {
    border: 'border-slate-200 dark:border-slate-700',
    icon:   'bg-slate-50   dark:bg-slate-700/50  text-slate-400',
    badge:  'bg-slate-100  dark:bg-slate-700     text-slate-500 dark:text-slate-400',
    marker: 'bg-slate-300',
    IconEl: Info,
  },
  success: {
    border: 'border-emerald-200 dark:border-emerald-700',
    icon:   'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-500',
    badge:  'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400',
    marker: 'bg-emerald-400',
    IconEl: CheckCircle2,
  },
}

// ─── Component ────────────────────────────────────────────────────────────────

interface ActionCardProps {
  action:     Action
  compact?:   boolean
  className?: string
}

export function ActionCard({ action, compact = false, className }: ActionCardProps): React.ReactElement {
  const styles = TYPE_STYLES[action.type] ?? TYPE_STYLES.info
  const CatIcon = CATEGORY_ICONS[action.category] ?? Info
  const TypeIcon = styles.IconEl

  const inner = (
    <div
      className={cn(
        'group relative flex items-start gap-3 rounded-xl border bg-white dark:bg-slate-800',
        'transition-shadow',
        action.href && 'hover:shadow-md cursor-pointer',
        compact ? 'p-3' : 'p-4',
        styles.border,
        className,
      )}
    >
      {/* Priority marker stripe */}
      <div className={cn('absolute left-0 top-4 bottom-4 w-0.5 rounded-r', styles.marker)} />

      {/* Icon */}
      <div className={cn(
        'shrink-0 rounded-lg flex items-center justify-center',
        compact ? 'h-7 w-7' : 'h-9 w-9',
        styles.icon,
      )}>
        <TypeIcon className={cn(compact ? 'h-3.5 w-3.5' : 'h-4 w-4')} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className={cn(
            'font-semibold text-slate-700 dark:text-slate-200',
            compact ? 'text-xs' : 'text-sm',
          )}>
            {action.title}
          </p>
          <span className={cn(
            'shrink-0 text-[10px] font-medium rounded px-1.5 py-0.5 leading-none flex items-center gap-1',
            styles.badge,
          )}>
            <CatIcon className="h-2.5 w-2.5" />
            {CATEGORY_LABELS[action.category]}
          </span>
        </div>

        {!compact && (
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            {action.description}
          </p>
        )}

        {action.href && (
          <span className={cn(
            'inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-400',
            'text-xs font-medium mt-1.5 group-hover:underline',
          )}>
            {action.cta ?? 'View'} <ArrowRight className="h-3 w-3" />
          </span>
        )}
      </div>
    </div>
  )

  if (action.href) {
    return <Link href={action.href} className="block">{inner}</Link>
  }
  return inner
}
