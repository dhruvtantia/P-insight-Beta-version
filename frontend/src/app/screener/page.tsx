'use client'

/**
 * Screener — Beta placeholder
 * ----------------------------
 * This page is a beta stub. The screener feature is planned but not yet
 * implemented. It will allow users to filter and rank stocks by fundamentals,
 * sector, market cap, momentum, and other quantitative criteria.
 *
 * When implemented, the screener will call a backend endpoint that:
 *   - Accepts filter criteria (sector, PE, momentum, etc.)
 *   - Returns a ranked list of securities
 *   - Allows one-click add to watchlist or portfolio
 *
 * For now: landing page explaining what it is and what's coming.
 */

import {
  SlidersHorizontal,
  BarChart2,
  TrendingUp,
  PieChart,
  Filter,
} from 'lucide-react'

const PLANNED_FEATURES = [
  {
    Icon:  BarChart2,
    title: 'Fundamentals Filters',
    desc:  'Filter by P/E, P/B, EPS growth, revenue, debt/equity, and dividend yield.',
  },
  {
    Icon:  TrendingUp,
    title: 'Momentum & Technical',
    desc:  'Rank by 1M / 3M / 12M price momentum, 52-week range position, and RSI.',
  },
  {
    Icon:  PieChart,
    title: 'Sector & Market Cap',
    desc:  'Narrow by NSE sector, market cap band (large / mid / small / micro), and index membership.',
  },
  {
    Icon:  Filter,
    title: 'Custom Filters',
    desc:  'Combine any set of criteria and save the resulting screen for later.',
  },
]

export default function ScreenerPage() {
  return (
    <div className="max-w-2xl mx-auto py-8 space-y-8">

      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-100">
          <SlidersHorizontal className="h-5 w-5 text-indigo-600" />
        </div>
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl font-bold text-slate-900">Stock Screener</h1>
            <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest border border-amber-300 bg-amber-50 text-amber-600">
              Beta
            </span>
          </div>
          <p className="text-sm text-slate-500 leading-relaxed">
            Filter and rank NSE-listed securities by fundamentals, sector, market cap,
            and momentum. The screener is currently in development.
          </p>
        </div>
      </div>

      {/* Coming soon card */}
      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
        <SlidersHorizontal className="h-10 w-10 text-slate-200 mx-auto mb-3" />
        <p className="text-sm font-semibold text-slate-600">Screener not yet available</p>
        <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
          This feature is planned for a future release. The filters and ranking
          engine are being built out. Check back soon.
        </p>
      </div>

      {/* Planned features */}
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">
          Planned features
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {PLANNED_FEATURES.map(({ Icon, title, desc }) => (
            <div
              key={title}
              className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100">
                <Icon className="h-4 w-4 text-slate-500" />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-700">{title}</p>
                <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}
