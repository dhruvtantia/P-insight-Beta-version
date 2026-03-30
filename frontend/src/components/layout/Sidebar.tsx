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
  TrendingUp,
  Star,
  Users,
  Newspaper,
  Bot,
  BarChart3,
  BarChart2,
  Bug,
  MessageCircle,
  GitFork,
  Upload,
  Wifi,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Navigation groups ────────────────────────────────────────────────────────

const NAV_GROUPS = [
  {
    label: 'Overview',
    items: [
      { label: 'Dashboard',   href: '/dashboard',   Icon: LayoutDashboard },
      { label: 'Holdings',    href: '/holdings',    Icon: Briefcase       },
      { label: 'Portfolios',   href: '/portfolios',  Icon: FolderOpen      },
      { label: 'What Changed', href: '/changes',    Icon: GitCompare      },
      { label: 'Upload',       href: '/upload',     Icon: Upload          },
      { label: 'Brokers',      href: '/brokers',    Icon: Wifi            },
    ],
  },
  {
    label: 'Analysis',
    items: [
      { label: 'Sectors',        href: '/sectors',      Icon: PieChart   },
      { label: 'Risk',           href: '/risk',          Icon: Activity   },
      { label: 'Optimize',       href: '/optimize',      Icon: TrendingUp },
      { label: 'Fundamentals',   href: '/fundamentals',  Icon: BarChart2  },
    ],
  },
  {
    label: 'Research',
    items: [
      { label: 'Watchlist',     href: '/watchlist', Icon: Star      },
      { label: 'Peer Compare',  href: '/peers',     Icon: Users     },
      { label: 'News & Events', href: '/news',      Icon: Newspaper },
    ],
  },
  {
    label: 'Intelligence',
    items: [
      { label: 'Advisor',    href: '/advisor',   Icon: MessageCircle },
      { label: 'Simulator',  href: '/simulate',  Icon: GitFork       },
      { label: 'AI Chat',    href: '/ai-chat',   Icon: Bot           },
    ],
  },
] as const

const DEV_ITEMS = [
  { label: 'Diagnostics', href: '/debug', Icon: Bug },
] as const

// ─── Component ────────────────────────────────────────────────────────────────

interface SidebarProps {
  /** Controlled width in px from AppShell's drag state. Falls back to 240 (w-60). */
  width?: number
}

export function Sidebar({ width }: SidebarProps) {
  const pathname = usePathname()

  const renderLink = (href: string, label: string, Icon: React.ElementType) => {
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
          <span className="truncate">{label}</span>
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
              {group.items.map(({ label, href, Icon }) => renderLink(href, label, Icon))}
            </ul>
          </div>
        ))}

        {/* Developer tools */}
        <div>
          <p className="px-3 mb-1 text-[9px] font-bold uppercase tracking-widest text-slate-700">
            Developer
          </p>
          <ul className="space-y-0.5">
            {DEV_ITEMS.map(({ label, href, Icon }) => renderLink(href, label, Icon))}
          </ul>
        </div>
      </nav>

      {/* Footer */}
      <div className="border-t border-slate-800 px-4 py-3 shrink-0">
        <p className="text-[10px] text-slate-600 text-center">
          P-Insight v0.5 · Broker Sync
        </p>
      </div>
    </aside>
  )
}
