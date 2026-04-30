'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Briefcase,
  FolderOpen,
  GitCompare,
  Activity,
  Users,
  Newspaper,
  MessageCircle,
  BarChart3,
  BarChart2,
  Bug,
  Upload,
  TrendingUp,
  Star,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useFeatureRegistry } from '@/hooks/useFeatureRegistry'
import type { FeatureId } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface NavItem {
  label: string
  href:  string
  Icon:  React.ElementType
  featureId?: FeatureId
  /** Short badge rendered inline after the label. Use "BETA" or "SCAFFOLD". */
  badge?: 'BETA' | 'SCAFFOLD'
}

interface NavGroup {
  label: string
  items: NavItem[]
}

// ─── Navigation hierarchy ─────────────────────────────────────────────────────
//
//  Core — the primary intelligence loop (all must work in uploaded/live mode):
//    Market → Dashboard → Holdings → Fundamentals → Risk → Changes
//
//  Secondary — useful but not the main workflow:
//    Peers, News & Events, Watchlist, My Portfolio, Upload, Advisor
//
//  Hidden from nav — routes still work, navigate by URL:
//    /screener   (Screener — BETA)
//    /simulate   (Simulator — BETA)
//    /optimize   (Optimizer — BETA)
//    /brokers    (Broker Sync — scaffold)
//    /sectors    (Sector Allocation — redundant with Dashboard)
//    /frontier   (Efficient Frontier — scaffold)

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Core',
    items: [
      { label: 'Market',       href: '/market',       Icon: TrendingUp,      featureId: 'market_data'    },
      { label: 'Dashboard',    href: '/dashboard',    Icon: LayoutDashboard, featureId: 'portfolio_core' },
      { label: 'Holdings',     href: '/holdings',     Icon: Briefcase,       featureId: 'portfolio_core' },
      { label: 'Fundamentals', href: '/fundamentals', Icon: BarChart2,       featureId: 'fundamentals'   },
      { label: 'Risk',         href: '/risk',         Icon: Activity,        featureId: 'risk_quant'     },
      { label: 'Changes',      href: '/changes',      Icon: GitCompare,      featureId: 'history'        },
    ],
  },
  {
    label: 'Secondary',
    items: [
      { label: 'Peers',        href: '/peers',      Icon: Users         },
      { label: 'News',         href: '/news',       Icon: Newspaper,     featureId: 'news'           },
      { label: 'Watchlist',    href: '/watchlist',  Icon: Star,          featureId: 'watchlist'      },
      { label: 'My Portfolio', href: '/portfolios', Icon: FolderOpen,    featureId: 'portfolio_core' },
      { label: 'Upload',       href: '/upload',     Icon: Upload,        featureId: 'upload_import'  },
      { label: 'Advisor',      href: '/advisor',    Icon: MessageCircle, featureId: 'advisor'        },
    ],
  },
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
  const { isDisabled } = useFeatureRegistry()

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
              {group.items
                .filter((item) => !isDisabled(item.featureId))
                .map((item) => renderLink(item))}
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
