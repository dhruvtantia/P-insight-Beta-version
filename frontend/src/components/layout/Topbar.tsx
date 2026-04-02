'use client'

import { usePathname } from 'next/navigation'
import { RefreshCw } from 'lucide-react'
import { DataModeToggle } from '@/components/common/DataModeToggle'
import { PortfolioSwitcher } from '@/components/portfolio/PortfolioSwitcher'
import { IndexTicker } from '@/components/layout/IndexTicker'

// Map route paths to human-readable page titles
const PAGE_TITLES: Record<string, string> = {
  '/dashboard':    'Dashboard',
  '/holdings':     'Holdings',
  '/sectors':      'Sector Allocation',
  '/risk':         'Risk Analysis',
  '/fundamentals': 'Fundamentals',
  '/frontier':     'Efficient Frontier',
  '/watchlist':    'Watchlist',
  '/peers':        'Peer Comparison',
  '/news':         'News & Events',
  '/simulate':     'Portfolio Simulator',
  '/advisor':      'Portfolio Advisor',
  '/ai-chat':      'AI Portfolio Chat',
  '/debug':        'System Diagnostics',
  '/upload':       'Upload Portfolio',
  '/optimize':     'Optimizer',
  '/portfolios':   'Portfolios',
  '/changes':      'What Changed',
  '/quant':        'Quant Analytics',
}

interface TopbarProps {
  onRefresh?:    () => void
  /** Passed from AppShell so the topbar left edge tracks the sidebar width. */
  sidebarWidth?: number
}

export function Topbar({ onRefresh, sidebarWidth = 240 }: TopbarProps) {
  const pathname = usePathname()
  const title = PAGE_TITLES[pathname] ?? 'P-Insight'

  return (
    <header
      className="fixed top-0 right-0 z-20 flex h-16 items-center justify-between border-b border-slate-200 bg-white/95 backdrop-blur-sm px-6 gap-4"
      style={{ left: sidebarWidth }}
    >
      {/* Page Title */}
      <div>
        <h1 className="text-lg font-semibold text-slate-900 leading-tight">{title}</h1>
        <p className="text-xs text-slate-500 leading-none mt-0.5">
          Portfolio Analytics Platform
        </p>
      </div>

      {/* Centre — Live index strip (hidden on small screens) */}
      <div className="hidden lg:flex items-center">
        <IndexTicker />
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-3">
        {/* Portfolio switcher */}
        <PortfolioSwitcher />

        {/* Data Mode Toggle */}
        <DataModeToggle />

        {/* Refresh Button */}
        {onRefresh && (
          <button
            onClick={onRefresh}
            className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
        )}

        {/* User Avatar (placeholder) */}
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold select-none">
          DT
        </div>
      </div>
    </header>
  )
}
