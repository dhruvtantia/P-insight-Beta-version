'use client'

/**
 * Market Landing Page — Primary entry point for P-Insight.
 *
 * Data sources (all gracefully degrade when unavailable):
 *   - GET /api/v1/market/overview  → main indices, sector indices, gainers/losers
 *   - GET /api/v1/news/?mode=live  → market headlines (optional, NewsAPI)
 *
 * Layout note: `-m-6` on the root div counteracts the AppShell `p-6` wrapper
 * so this page fills edge-to-edge within the content area.
 */

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  TrendingUp,
  TrendingDown,
  Upload,
  RefreshCw,
  WifiOff,
  BarChart2,
  Clock,
  Newspaper,
  ExternalLink,
  DollarSign,
  Package,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'
const REFRESH_INTERVAL_MS = 120_000   // 2 minutes
const REQUEST_TIMEOUT_MS  =  15_000   // 15 seconds

// ─── Types ────────────────────────────────────────────────────────────────────

interface IndexEntry {
  symbol:       string
  name:         string
  value?:       number
  change?:      number
  change_pct?:  number
  unavailable?: boolean
  reason?:      string
  // New fields from hardened backend
  status?:      'live' | 'last_close' | 'unavailable'
  data_date?:   string   // YYYY-MM-DD — date of the last bar yfinance returned
  last_updated?: string  // ISO-8601 UTC timestamp of the fetch
  source?:      string
}

interface TickerEntry {
  ticker:     string
  symbol:     string
  price:      number
  change_pct: number
}

interface MarketStatus {
  open:         boolean
  note:         string
  next_open?:   string
  checked_at_ist: string
}

interface MarketOverview {
  available:       boolean
  market_status?:  MarketStatus
  main_indices:    IndexEntry[]
  sector_indices:  IndexEntry[]
  top_gainers:     TickerEntry[]
  top_losers:      TickerEntry[]
  fetched_at?:     string
  source:          string
}

interface NewsArticle {
  title:       string
  url:         string
  source:      string
  published_at: string
  summary?:    string
  ticker?:     string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtNum(n: number): string {
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtPct(n: number, sign = true): string {
  const prefix = sign && n >= 0 ? '+' : ''
  return `${prefix}${n.toFixed(2)}%`
}

function relTime(iso: string): string {
  try {
    const diff  = Date.now() - new Date(iso).getTime()
    const hours = Math.floor(diff / 3_600_000)
    const mins  = Math.floor(diff / 60_000)
    if (mins  < 2)  return 'just now'
    if (hours < 1)  return `${mins}m ago`
    if (hours < 24) return `${hours}h ago`
    return `${Math.floor(hours / 24)}d ago`
  } catch { return '' }
}

async function fetchWithTimeout<T>(url: string): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.json()
  } finally {
    clearTimeout(timer)
  }
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded bg-slate-100', className)} />
}

// ─── Index Card ───────────────────────────────────────────────────────────────

function StatusBadge({ status, dataDate }: { status?: string; dataDate?: string }) {
  if (!status || status === 'unavailable') return null
  if (status === 'live') {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-700">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse inline-block mr-0.5" />
        Live
      </span>
    )
  }
  // last_close — show the date
  const label = dataDate ? `As of ${dataDate}` : 'Last close'
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-500">
      <Clock className="h-2.5 w-2.5" />
      {label}
    </span>
  )
}

function IndexCard({ idx, large = false }: { idx: IndexEntry; large?: boolean }) {
  if (idx.unavailable || idx.status === 'unavailable') {
    return (
      <div className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-50',
        large ? 'p-6 min-h-[120px]' : 'p-4 min-h-[90px]',
      )}>
        <WifiOff className="h-4 w-4 text-slate-300" />
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{idx.name}</span>
        <span className="text-[10px] text-slate-300">
          {idx.reason ? idx.reason.replace(/_/g, ' ') : 'unavailable'}
        </span>
      </div>
    )
  }

  const up  = (idx.change ?? 0) >= 0
  const Dir = up ? TrendingUp : TrendingDown
  const changeColour = up ? 'text-emerald-600' : 'text-red-500'
  const badgeBg      = up ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'

  return (
    <div className={cn(
      'flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md',
      large ? 'p-5' : 'p-4',
    )}>
      <div className="flex items-center justify-between">
        <span className={cn(
          'text-[10px] font-bold uppercase tracking-widest text-slate-400',
          large && 'text-xs',
        )}>
          {idx.name}
        </span>
        <div className="flex items-center gap-1.5">
          <StatusBadge status={idx.status} dataDate={idx.data_date} />
          <Dir className={cn('h-3.5 w-3.5 shrink-0', changeColour)} />
        </div>
      </div>
      <span className={cn(
        'font-extrabold tabular-nums leading-none text-slate-800',
        large ? 'text-3xl' : 'text-2xl',
      )}>
        {fmtNum(idx.value ?? 0)}
      </span>
      <span className={cn(
        'inline-flex items-center gap-1 self-start rounded-lg border px-2 py-0.5 text-xs font-semibold tabular-nums',
        badgeBg, changeColour,
      )}>
        {fmtNum(Math.abs(idx.change ?? 0))}
        <span className="opacity-70">({fmtPct(idx.change_pct ?? 0)})</span>
      </span>
    </div>
  )
}

// ─── Sector Row ───────────────────────────────────────────────────────────────

function SectorRow({ idx }: { idx: IndexEntry }) {
  if (idx.unavailable) {
    return (
      <div className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
        <span className="text-sm text-slate-400">{idx.name}</span>
        <span className="text-xs text-slate-300">—</span>
      </div>
    )
  }
  const up     = (idx.change ?? 0) >= 0
  const colour = up ? 'text-emerald-600' : 'text-red-500'
  return (
    <div className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
      <span className="text-sm font-medium text-slate-700">{idx.name}</span>
      <div className="flex items-center gap-3">
        <span className="text-sm tabular-nums font-semibold text-slate-800">
          {fmtNum(idx.value ?? 0)}
        </span>
        <span className={cn('text-xs tabular-nums font-bold w-16 text-right', colour)}>
          {fmtPct(idx.change_pct ?? 0)}
        </span>
      </div>
    </div>
  )
}

// ─── Mover Row ────────────────────────────────────────────────────────────────

function MoverRow({ t, gainer }: { t: TickerEntry; gainer: boolean }) {
  const colour = gainer ? 'text-emerald-600' : 'text-red-500'
  const bg     = gainer ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-slate-50 last:border-0">
      <div className="flex items-center gap-2.5 min-w-0">
        <span className={cn('rounded-lg px-2 py-0.5 text-xs font-bold shrink-0', bg)}>
          {t.ticker}
        </span>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <span className="text-sm tabular-nums text-slate-600 font-medium">
          ₹{fmtNum(t.price)}
        </span>
        <span className={cn('text-xs tabular-nums font-bold w-14 text-right', colour)}>
          {fmtPct(t.change_pct)}
        </span>
      </div>
    </div>
  )
}

// ─── News Row ─────────────────────────────────────────────────────────────────

function NewsRow({ article }: { article: NewsArticle }) {
  return (
    <a
      href={article.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-start gap-3 py-3 border-b border-slate-100 last:border-0 hover:bg-slate-50 -mx-5 px-5 rounded-lg transition-colors"
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-800 group-hover:text-indigo-700 leading-snug line-clamp-2 transition-colors">
          {article.title}
        </p>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[11px] text-slate-400">{article.source}</span>
          {article.published_at && (
            <>
              <span className="text-slate-200">·</span>
              <span className="text-[11px] text-slate-400">{relTime(article.published_at)}</span>
            </>
          )}
        </div>
      </div>
      <ExternalLink className="h-3.5 w-3.5 text-slate-300 group-hover:text-indigo-400 shrink-0 mt-0.5 transition-colors" />
    </a>
  )
}

// ─── Panel Wrapper ────────────────────────────────────────────────────────────

function Panel({
  title,
  icon: Icon,
  children,
  tag,
}: {
  title: string
  icon: React.ElementType
  children: React.ReactNode
  tag?: string
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-5">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="h-4 w-4 text-slate-400 shrink-0" />
        <h2 className="text-sm font-semibold text-slate-700 flex-1">{title}</h2>
        {tag && (
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{tag}</span>
        )}
      </div>
      {children}
    </div>
  )
}

// ─── Beta instrument data (static — no live data yet) ─────────────────────────

const FX_INSTRUMENTS = [
  { symbol: 'USDINR=X', name: 'USD / INR', unit: '₹' },
  { symbol: 'EURINR=X', name: 'EUR / INR', unit: '₹' },
  { symbol: 'GBPINR=X', name: 'GBP / INR', unit: '₹' },
  { symbol: 'JPYINR=X', name: 'JPY / INR', unit: '₹' },
  { symbol: 'CNYINR=X', name: 'CNY / INR', unit: '₹' },
]

const COMMODITY_INSTRUMENTS = [
  { symbol: 'GC=F',  name: 'Gold',        unit: 'USD/oz' },
  { symbol: 'SI=F',  name: 'Silver',      unit: 'USD/oz' },
  { symbol: 'HG=F',  name: 'Copper',      unit: 'USD/lb' },
  { symbol: 'BZ=F',  name: 'Brent Crude', unit: 'USD/bbl' },
  { symbol: 'CL=F',  name: 'WTI Crude',   unit: 'USD/bbl' },
  { symbol: 'NG=F',  name: 'Natural Gas', unit: 'USD/MMBtu' },
]

// ─── Beta instrument card ─────────────────────────────────────────────────────
//
// Displays a placeholder card for FX / commodity instruments that do not yet
// have live data support. Uses a dashed amber border to signal "coming soon"
// without showing fake values.

function BetaInstrumentCard({ name, unit }: { name: string; unit: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-dashed border-amber-200 bg-amber-50/40 px-3.5 py-3">
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 truncate">
        {name}
      </span>
      <span className="text-lg font-extrabold text-slate-200 tabular-nums leading-tight">
        ——.——
      </span>
      <span className="text-[10px] text-slate-400">{unit}</span>
    </div>
  )
}

// ─── Beta section header ──────────────────────────────────────────────────────

function BetaSectionHeader({
  title,
  icon: Icon,
}: {
  title: string
  icon: React.ElementType
}) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon className="h-4 w-4 text-slate-400 shrink-0" />
      <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
      <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest border border-amber-300 bg-amber-50 text-amber-600">
        Beta
      </span>
      <span className="text-[10px] text-slate-400">· Live data not yet available</span>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MarketPage() {
  const router = useRouter()

  const [overview,    setOverview]    = useState<MarketOverview | null>(null)
  const [loading,     setLoading]     = useState(true)
  const [refreshing,  setRefreshing]  = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const [news,        setNews]        = useState<NewsArticle[]>([])
  // newsStatus: 'loading' | 'ok' | 'unavailable'
  const [newsStatus,  setNewsStatus]  = useState<'loading' | 'ok' | 'unavailable'>('loading')

  // ── Market overview ─────────────────────────────────────────────────────────
  const fetchOverview = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true)
    try {
      const data = await fetchWithTimeout<MarketOverview>(
        `${BASE_URL}/api/v1/market/overview`
      )
      setOverview(data)
      setLastUpdated(new Date())
    } catch (err) {
      console.warn('[MarketPage] overview fetch failed:', err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  // ── News headlines (secondary, non-blocking) ────────────────────────────────
  const fetchNews = useCallback(async () => {
    setNewsStatus('loading')
    const tickers = 'RELIANCE.NS,TCS.NS,HDFCBANK.NS,INFY.NS,SBIN.NS,BHARTIARTL.NS'
    try {
      const data = await fetchWithTimeout<{
        articles:            NewsArticle[]
        news_key_configured: boolean
        news_unavailable:    boolean
      }>(`${BASE_URL}/api/v1/news/?mode=uploaded&tickers=${tickers}`)

      if (!data.news_key_configured || data.news_unavailable || !data.articles?.length) {
        setNewsStatus('unavailable')
      } else {
        setNews(data.articles.slice(0, 6))
        setNewsStatus('ok')
      }
    } catch {
      setNewsStatus('unavailable')
    }
  }, [])

  // Mount: fetch overview + news, set up refresh timer
  useEffect(() => {
    fetchOverview()
    fetchNews()
    const timer = setInterval(() => fetchOverview(), REFRESH_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [fetchOverview, fetchNews])

  const mainIndices    = overview?.main_indices   ?? []
  const sectorIndices  = overview?.sector_indices ?? []
  const topGainers     = overview?.top_gainers    ?? []
  const topLosers      = overview?.top_losers     ?? []
  const marketStatus   = overview?.market_status

  return (
    // -m-6 counteracts the AppShell's p-6 wrapper so this page fills edge-to-edge
    <div className="-m-6 min-h-screen bg-slate-50">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 px-6 py-4 flex-wrap">
          <div>
            <h1 className="text-lg font-bold text-slate-800 tracking-tight leading-tight">
              Indian Market Overview
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              {lastUpdated
                ? <>Last updated <Clock className="inline h-3 w-3 mx-0.5 mb-0.5" />
                    {lastUpdated.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                  </>
                : 'Loading market data…'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchOverview(true)}
              disabled={refreshing || loading}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition-colors"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
              Refresh
            </button>
            <button
              onClick={() => router.push('/upload')}
              className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 transition-colors shadow-sm"
            >
              <Upload className="h-3.5 w-3.5" />
              Upload Portfolio
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">

        {/* ── Market status banner ──────────────────────────────────────────── */}
        {!loading && marketStatus && (
          <div className={cn(
            'flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm',
            marketStatus.open
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-slate-200 bg-slate-50 text-slate-600',
          )}>
            <span className={cn(
              'h-2 w-2 rounded-full shrink-0',
              marketStatus.open ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400',
            )} />
            <span className="font-medium">{marketStatus.note}</span>
            {!marketStatus.open && marketStatus.next_open && (
              <span className="text-slate-400 text-xs ml-1">
                · Next open: {marketStatus.next_open}
              </span>
            )}
          </div>
        )}

        {/* ── Main Indices ──────────────────────────────────────────────────── */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {mainIndices.length > 0
              ? mainIndices.map((idx) => <IndexCard key={idx.symbol} idx={idx} large />)
              : [
                  { symbol: 'NIFTY', name: 'NIFTY 50', unavailable: true },
                  { symbol: 'SENSEX', name: 'SENSEX', unavailable: true },
                  { symbol: 'BANKNIFTY', name: 'BANK NIFTY', unavailable: true },
                ].map((idx) => <IndexCard key={idx.symbol} idx={idx as IndexEntry} large />)
            }
          </div>
        )}

        {/* ── Sectors + Movers ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* Sector Indices */}
          <Panel title="Sector Indices" icon={BarChart2}>
            {loading ? (
              <div className="space-y-3">
                {[0,1,2,3,4,5,6,7].map((i) => <Skeleton key={i} className="h-5" />)}
              </div>
            ) : sectorIndices.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-slate-400 py-4">
                <WifiOff className="h-4 w-4" /> Sector data unavailable
              </div>
            ) : (
              <div>
                {sectorIndices.map((idx) => <SectorRow key={idx.symbol} idx={idx} />)}
              </div>
            )}
          </Panel>

          {/* Top Gainers */}
          <Panel title="Top Gainers" icon={TrendingUp} tag="Today">
            {loading ? (
              <div className="space-y-2">
                {[0,1,2,3,4].map((i) => <Skeleton key={i} className="h-9" />)}
              </div>
            ) : topGainers.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-slate-400 py-4">
                <WifiOff className="h-4 w-4" /> Data unavailable
              </div>
            ) : (
              <div>
                {topGainers.map((t) => <MoverRow key={t.symbol} t={t} gainer />)}
              </div>
            )}
          </Panel>

          {/* Top Losers */}
          <Panel title="Top Losers" icon={TrendingDown} tag="Today">
            {loading ? (
              <div className="space-y-2">
                {[0,1,2,3,4].map((i) => <Skeleton key={i} className="h-9" />)}
              </div>
            ) : topLosers.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-slate-400 py-4">
                <WifiOff className="h-4 w-4" /> Data unavailable
              </div>
            ) : (
              <div>
                {topLosers.map((t) => <MoverRow key={t.symbol} t={t} gainer={false} />)}
              </div>
            )}
          </Panel>
        </div>

        {/* ── FX Rates (Beta) ──────────────────────────────────────────────── */}
        <div>
          <BetaSectionHeader title="FX Rates" icon={DollarSign} />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {FX_INSTRUMENTS.map((fx) => (
              <BetaInstrumentCard key={fx.symbol} name={fx.name} unit={fx.unit} />
            ))}
          </div>
        </div>

        {/* ── Commodities (Beta) ───────────────────────────────────────────── */}
        <div>
          <BetaSectionHeader title="Commodities" icon={Package} />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {COMMODITY_INSTRUMENTS.map((c) => (
              <BetaInstrumentCard key={c.symbol} name={c.name} unit={c.unit} />
            ))}
          </div>
        </div>

        {/* ── News Headlines ────────────────────────────────────────────────── */}
        {newsStatus !== 'unavailable' && (
          <Panel title="Market Headlines" icon={Newspaper} tag="Live">
            {newsStatus === 'loading' ? (
              <div className="space-y-4">
                {[0,1,2].map((i) => (
                  <div key={i} className="space-y-1.5">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                ))}
              </div>
            ) : news.length === 0 ? null : (
              <div>
                {news.map((a, i) => <NewsRow key={i} article={a} />)}
              </div>
            )}
          </Panel>
        )}

        {/* ── CTA Banner ───────────────────────────────────────────────────── */}
        <div className="rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50 to-slate-50 p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-indigo-800">
              Analyse your own portfolio
            </p>
            <p className="text-xs text-indigo-600 mt-0.5 max-w-md">
              Upload a CSV or Excel file with your holdings to unlock risk analytics,
              sector breakdown, fundamentals, and personalised insights.
            </p>
          </div>
          <button
            onClick={() => router.push('/upload')}
            className="shrink-0 flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors shadow-sm"
          >
            <Upload className="h-4 w-4" />
            Upload Portfolio
          </button>
        </div>

      </div>
    </div>
  )
}
