'use client'

import { useState, useRef, useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { RefreshCw, LogOut } from 'lucide-react'
import { DataModeToggle } from '@/components/common/DataModeToggle'
import { PortfolioSwitcher } from '@/components/portfolio/PortfolioSwitcher'
import { IndexTicker } from '@/components/layout/IndexTicker'
import { useAuth } from '@/context/AuthContext'

// Map route paths to human-readable page titles
const PAGE_TITLES: Record<string, string> = {
  '/market':       'Market Overview',
  '/dashboard':    'Dashboard',
  '/holdings':     'Holdings',
  '/sectors':      'Sector Allocation',
  '/risk':         'Risk Analysis',
  '/fundamentals': 'Fundamentals',
  '/watchlist':    'Watchlist',
  '/peers':        'Peer Comparison',
  '/news':         'News & Events',
  '/simulate':     'Portfolio Simulator',
  '/advisor':      'Portfolio Advisor',
  '/debug':        'System Diagnostics',
  '/upload':       'Upload Portfolio',
  '/optimize':     'Optimizer',
  '/portfolios':   'My Portfolio',
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
  const router = useRouter()
  const { user, configured, signOut } = useAuth()
  const title = PAGE_TITLES[pathname] ?? 'P-Insight'

  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  async function handleSignOut() {
    await signOut()
    setMenuOpen(false)
    router.push('/login')
  }

  const initials = user?.email ? user.email.slice(0, 2).toUpperCase() : '?'

  return (
    <header
      className="fixed top-0 right-0 z-20 flex h-[76px] items-center border-b border-slate-200 bg-white/95 backdrop-blur-sm px-5 gap-3"
      style={{ left: sidebarWidth }}
    >
      {/* Page Title — shrink-0 so the centre strip gets priority space */}
      <div className="shrink-0 min-w-[130px]">
        <h1 className="text-base font-semibold text-slate-900 leading-tight truncate">{title}</h1>
        <p className="text-[11px] text-slate-400 leading-none mt-0.5 truncate">
          Portfolio Analytics
        </p>
      </div>

      {/* Centre — Live index strip. flex-1 + overflow-hidden so chips never push the right controls off-screen */}
      <div className="hidden lg:flex flex-1 items-center justify-center overflow-hidden">
        <IndexTicker />
      </div>

      {/* Right Controls — shrink-0 so they never get clipped */}
      <div className="shrink-0 flex items-center gap-2.5 ml-auto">
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

        {/* User menu */}
        {configured && (
          <div ref={menuRef} className="relative">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold select-none hover:bg-indigo-200 transition-colors"
              title={user?.email ?? undefined}
            >
              {initials}
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-10 z-30 w-56 rounded-md border border-slate-200 bg-white py-1 shadow-lg">
                {user?.email && (
                  <div className="truncate border-b border-slate-100 px-3 py-2 text-xs text-slate-500">
                    {user.email}
                  </div>
                )}
                <button
                  onClick={handleSignOut}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Log out
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  )
}
