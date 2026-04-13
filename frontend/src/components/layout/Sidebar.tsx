'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Briefcase,
  FolderOpen,
  GitCompare,
  PieChart,
  Activity,
  SlidersHorizontal,
  Users,
  Newspaper,
  MessageCircle,
  BarChart3,
  BarChart2,
  Bug,
  Upload,
  TrendingUp,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

interface NavItem {
  label: string
  href:  string
  Icon:  React.ElementType
  /** Short badge rendered inline after the label. Use "BETA" or "SCAFFOLD". */
  badge?: 'BETA' | 'SCAFFOLD'
}

interface NavGroup {
  label: string
  items: NavItem[]
}

// ─── Navigation groups ────────────────────────────────────────────────────────
//
//  Primary workflow (reliable in uploaded/live mode):
//    Dashboard → Holdings → Fundamentals → Risk → Peer Compare
//  Data management:
//    Portfolios, Upload, What Changed, Watchlist
//  Explore (mostly functional):
//    Sectors, News & Events (mock in non-live), Advisor (rule-based or AI)
//  Labs (BETA / experimental — clearly labelled):
//    Optimizer, Simulator, Brokers
//
//  Not in nav (scaffold): AI Chat (/ai-chat), Efficient Frontier (/frontier)

const NAV_GROUPS: NavGroup[] = [
  {
    // Market is the default landing page — shown first
    label: 'Overview',
    items: [
      { label: 'Market', href: '/market', Icon: TrendingUp },
    ],
  },
  {
    // Portfolio workspace — Tier 1 core: all must work
    label: 'Portfolio',
    items: [
      { label: 'Dashboard',    href: '/dashboard',    Icon: LayoutDashboard },
      { label: 'Holdings',     href: '/holdings',     Icon: Briefcase       },
      { label: 'Fundamentals', href: '/fundamentals', Icon: BarChart2       },
      { label: 'Risk',         href: '/risk',         Icon: Activity        },
    ],
  },
  {
    // Portfolio management — Tier 1
    // Note: Watchlist (/watchlist) is hidden from nav but route code is NOT deleted.
    // Navigate to /watchlist directly to access it.
    label: 'Manage',
    items: [
      { label: 'My Portfolio', href: '/portfolios', Icon: FolderOpen                           },
      { label: 'Upload',       href: '/upload',     Icon: Upload                               },
      { label: 'What Changed', href: '/changes',    Icon: GitCompare                           },
      { label: 'Screener',     href: '/screener',   Icon: SlidersHorizontal, badge: 'BETA' as const },
    ],
  },
  {
    // Explore — Tier 2: helpful but not critical
    // Peer Compare, News, and Advisor are secondary workflows.
    label: 'Explore',
    items: [
      { label: 'Peer Compare',  href: '/peers',    Icon: Users         },
      { label: 'News & Events', href: '/news',     Icon: Newspaper     },
      { label: 'Advisor',       href: '/advisor',  Icon: MessageCircle },
    ],
  },
  // Hidden from nav (route code NOT deleted — navigate directly by URL):
  //   /sectors   (Sector Allocation — redundant with dashboard)
  //   /optimize  (Optimizer — Tier 3)
  //   /simulate  (Simulator — Tier 3)
  //   /brokers   (Broker Sync — Tier 3, scaffold)
  //   /frontier  (Efficient Frontier — Tier 3, scaffold)
]

const DEV_ITEMS: NavItem[] = [
  { label: 'Diagnostics', href: '/debug', Icon: Bug },
]

// ─── Badge component ──────────────────────────────────────────────────────────

function NavBadge({ type }: { type: 'BETA' | 'SCAFFOLD' }) {
  const styles =
    type === 'BETA'
      ? 'bg-amber-500/15 text-amber-400 border-amber-500/20'
      : 'bg-slate-600/40 text-slate-400 border-slate-600/40'
  return (
    <span
      className={cn(
        'ml-auto shrink-0 rounded px-1 py-px text-[8px] font-bold uppercase tracking-wider border leading-tight',
        styles
      )}
    >
      {type}
    </span>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

interface SidebarProps {
  /** Controlled width in px from AppShell's drag state. Falls back to 240 (w-60). */
  width?: number
}

export function Sidebar({ width }: SidebarProps) {
  const pathname = usePathname()

  const renderLink = ({ href, label, Icon, badge }: NavItem) => {
    const isActive = pathname === href || pathname.startsWith(href + '/')
    return (
      <li key={href}>
        <Link
          href={href}
          className={cn(
            'group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-all duration-150',
            isActive
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
          )}
        >
          <Icon
            className={cn(
              'h-4 w-4 shrink-0 transition-colors',
              isActive ? 'text-white' : 'text-slate-500 group-hover:text-slate-300'
            )}
          />
          <span className="truncate flex-1">{label}</span>
          {badge && <NavBadge type={badge} />}
        </Link>
      </li>
    )
  }

  return (
    <aside
      style={width ? { width } : undefined}
      className="fixed left-0 top-0 z-30 flex h-screen flex-col bg-slate-900 border-r border-slate-800 w-60"
    >
      {/* Logo */}
      <div className="flex h-14 items-center gap-3 px-5 border-b border-slate-800 shrink-0">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600">
          <BarChart3 className="h-3.5 w-3.5 text-white" />
        </div>
        <div>
          <span className="text-sm font-bold text-white tracking-tight">P-Insight</span>
          <p className="text-[10px] text-slate-500 uppercase tracking-widest leading-none mt-0.5">
            Portfolio Analytics
          </p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="px-3 mb-1 text-[9px] font-bold uppercase tracking-widest text-slate-600">
              {group.label}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => renderLink(item))}
            </ul>
          </div>
        ))}

        {/* Developer tools — only visible in development mode */}
        {process.env.NODE_ENV === 'development' && (
          <div>
            <p className="px-3 mb-1 text-[9px] font-bold uppercase tracking-widest text-slate-700">
              Developer
            </p>
            <ul className="space-y-0.5">
              {DEV_ITEMS.map((item) => renderLink(item))}
            </ul>
          </div>
        )}
      </nav>

      {/* Footer */}
      <div className="border-t border-slate-800 px-4 py-3 shrink-0">
        <p className="text-[10px] text-slate-600 text-center">
          P-Insight v0.5 · Portfolio Analytics
        </p>
      </div>
    </aside>
  )
}
