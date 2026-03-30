'use client'

/**
 * EmptyWatchlistState — zero-data illustration for the watchlist
 * ---------------------------------------------------------------
 * Shown when the user has no watchlist items yet.
 * Renders a visual illustration + copy + optional CTA.
 */

import { Star, TrendingUp, Search } from 'lucide-react'
import { WatchlistTagBadge } from './WatchlistTagBadge'

interface Props {
  onStartAdding?: () => void   // scrolls / focuses the add form
}

export function EmptyWatchlistState({ onStartAdding }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
      {/* Icon cluster */}
      <div className="relative mb-6">
        <div className="h-16 w-16 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center shadow-sm">
          <Star className="h-8 w-8 text-amber-400" />
        </div>
        <div className="absolute -top-2 -right-4 h-8 w-8 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center shadow-sm">
          <TrendingUp className="h-4 w-4 text-indigo-400" />
        </div>
        <div className="absolute -bottom-2 -left-4 h-8 w-8 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center shadow-sm">
          <Search className="h-4 w-4 text-emerald-400" />
        </div>
      </div>

      <h3 className="text-base font-semibold text-slate-800 mb-1">Your watchlist is empty</h3>
      <p className="text-sm text-slate-500 max-w-xs leading-relaxed mb-5">
        Add stocks you're monitoring, researching, or considering for your portfolio.
        Track your conviction level and price targets alongside your notes.
      </p>

      {/* Sample tag badges for visual context */}
      <div className="flex flex-wrap justify-center gap-2 mb-6">
        <WatchlistTagBadge tag="High Conviction" size="md" />
        <WatchlistTagBadge tag="Research" size="md" />
        <WatchlistTagBadge tag="Income" size="md" />
        <WatchlistTagBadge tag="Speculative" size="md" />
      </div>

      {onStartAdding && (
        <button
          onClick={onStartAdding}
          className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white
                     hover:bg-indigo-700 transition-colors shadow-sm"
        >
          Add your first stock
        </button>
      )}
    </div>
  )
}
