'use client'

/**
 * SystemDiagnosticsPanel — developer diagnostics view (v2).
 *
 * Sections:
 *   1. API Health          — checks /health endpoint, shows feature flags
 *   2. Data Mode           — current mode, available modes
 *   3. Active Filters      — filterStore state (sector, ticker)
 *   4. Simulation State    — simHoldings count, totalWeight, isModified
 *   5. Portfolio Data      — raw holdings JSON, sector allocations, risk snapshot
 *   6. Fundamentals        — weightedMetrics, top-5 ratios
 *   7. News & Events       — latest 3 articles, next 3 events
 *
 * Each section is a collapsible <details> element.
 * Intended for /debug route only.
 */

import { useEffect, useState }   from 'react'
import { CheckCircle, XCircle,
         RefreshCw, Filter,
         GitFork, Wifi, Layers,
         FolderOpen,
         TrendingUp }            from 'lucide-react'
import { usePortfolio }          from '@/hooks/usePortfolio'
import { useFundamentals }       from '@/hooks/useFundamentals'
import { useNews }               from '@/hooks/useNews'
import { useSimulation }         from '@/hooks/useSimulation'
import { useProviderStatus }     from '@/hooks/useProviderStatus'
import { useQuantAnalytics }     from '@/hooks/useQuantAnalytics'
import { useOptimization }       from '@/hooks/useOptimization'
import { usePortfolios }         from '@/hooks/usePortfolios'
import { useSnapshots }          from '@/hooks/useSnapshots'
import { useDelta }              from '@/hooks/useDelta'
import { useDataModeStore }      from '@/store/dataModeStore'
import { useFilterStore }        from '@/store/filterStore'
import { usePortfolioStore }     from '@/store/portfolioStore'
import { computeRiskSnapshot }   from '@/lib/risk'
import { systemApi, brokerApi, advisorApi }  from '@/services/api'
import { cn }                    from '@/lib/utils'

// ─── Shared primitives ────────────────────────────────────────────────────────

function DiagSection({
  title, badge, badgeOk, defaultOpen, children, icon: Icon,
}: {
  title:       string
  badge?:      string
  badgeOk?:    boolean
  defaultOpen?: boolean
  children:    React.ReactNode
  icon?:       React.ElementType
}) {
  return (
    <details open={defaultOpen} className="group border border-slate-200 rounded-lg overflow-hidden">
      <summary className="flex items-center justify-between px-4 py-3 bg-slate-50 cursor-pointer hover:bg-slate-100 transition-colors list-none">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="h-3.5 w-3.5 text-slate-400" />}
          <span className="text-sm font-semibold text-slate-700">{title}</span>
          {badge && (
            <span className={cn(
              'rounded-full px-2 py-0.5 text-[10px] font-bold',
              badgeOk === true  ? 'bg-emerald-100 text-emerald-700' :
              badgeOk === false ? 'bg-red-100 text-red-700'         :
              'bg-slate-100 text-slate-600'
            )}>
              {badge}
            </span>
          )}
        </div>
        <span className="text-slate-400 text-xs group-open:hidden">▶ expand</span>
        <span className="text-slate-400 text-xs hidden group-open:inline">▼ collapse</span>
      </summary>
      <div className="px-4 py-4 space-y-3 bg-white">{children}</div>
    </details>
  )
}

function SubSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">{label}</p>
      {children}
    </div>
  )
}

function JsonBlock({ data, note }: { data: unknown; note?: string }) {
  return (
    <div className="relative">
      <pre className="text-[10px] font-mono text-slate-600 bg-slate-50 border border-slate-100 rounded-md p-3 overflow-x-auto max-h-[240px] overflow-y-auto leading-relaxed">
        {JSON.stringify(data, null, 2)}
      </pre>
      {note && <p className="text-[9px] text-slate-400 mt-1 italic">{note}</p>}
    </div>
  )
}

function KVRow({
  label, value, mono = false, valueClass,
}: {
  label: string; value: string | number | boolean; mono?: boolean; valueClass?: string
}) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-slate-50 last:border-0">
      <span className="text-xs text-slate-500">{label}</span>
      <span className={cn(
        'text-xs font-semibold text-slate-800',
        mono && 'font-mono',
        valueClass,
      )}>
        {String(value)}
      </span>
    </div>
  )
}

function LoadingRow() {
  return (
    <div className="flex items-center gap-2 text-xs text-slate-400 animate-pulse py-2">
      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
      Loading…
    </div>
  )
}

function ErrorRow({ message }: { message: string }) {
  return <p className="text-xs text-red-500 py-1">{message}</p>
}

// ─── 1. API Health ────────────────────────────────────────────────────────────

function ApiHealthSection() {
  const [health,  setHealth]  = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  const check = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await systemApi.health()
      setHealth(res as unknown as Record<string, unknown>)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unreachable')
      setHealth(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { check() }, [])

  const ok = !error && health !== null

  return (
    <DiagSection title="API Health" badge={loading ? 'checking…' : ok ? 'OK' : 'ERROR'} badgeOk={ok} defaultOpen>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {loading && <RefreshCw className="h-4 w-4 text-slate-400 animate-spin" />}
          {!loading && ok  && <CheckCircle className="h-4 w-4 text-emerald-500" />}
          {!loading && !ok && <XCircle className="h-4 w-4 text-red-500" />}
          <span className="text-xs font-medium text-slate-700">
            {loading
              ? 'Checking backend…'
              : ok
              ? 'Backend reachable at localhost:8000'
              : `Backend unreachable: ${error}`
            }
          </span>
        </div>
        <button
          onClick={check}
          disabled={loading}
          className="text-xs text-indigo-600 hover:text-indigo-800 disabled:opacity-40"
        >
          Re-check
        </button>
      </div>
      {health && <JsonBlock data={health} />}
    </DiagSection>
  )
}

// ─── 2. Data Mode ─────────────────────────────────────────────────────────────

function DataModeSection() {
  const { mode, isLiveEnabled, isBrokerEnabled } = useDataModeStore()

  return (
    <DiagSection title="Data Mode" badge={mode} badgeOk={true} defaultOpen>
      <KVRow label="Current mode"  value={mode} />
      <KVRow label="Live enabled"   value={String(isLiveEnabled)} />
      <KVRow label="Broker enabled" value={String(isBrokerEnabled)} />
    </DiagSection>
  )
}

// ─── 3. Active Filters ────────────────────────────────────────────────────────

function FilterStateSection() {
  const selectedSector = useFilterStore((s) => s.selectedSector)
  const clearFilters   = useFilterStore((s) => s.clearFilters)

  const hasFilters = !!selectedSector

  return (
    <DiagSection
      title="Active Filters"
      badge={hasFilters ? 'active' : 'none'}
      badgeOk={!hasFilters}
      icon={Filter}
      defaultOpen
    >
      <KVRow label="selectedSector" value={selectedSector ?? '(none)'} mono />
      {hasFilters && (
        <button
          onClick={clearFilters}
          className="mt-2 text-xs text-red-500 hover:text-red-700 underline"
        >
          Clear all filters
        </button>
      )}
    </DiagSection>
  )
}

// ─── 4. Simulation State ──────────────────────────────────────────────────────

function SimulationStateSection() {
  const {
    simScenario,
    baseScenario,
    totalSimWeight,
    isModified,
    suggestions,
    loading,
    error,
  } = useSimulation()

  return (
    <DiagSection
      title="Simulation State"
      badge={isModified ? 'modified' : 'base'}
      badgeOk={!isModified}
      icon={GitFork}
    >
      {loading && <LoadingRow />}
      {error   && <ErrorRow message={error} />}
      {!loading && (
        <>
          <KVRow label="isModified"      value={String(isModified)} />
          <KVRow label="totalSimWeight"  value={`${totalSimWeight?.toFixed(1) ?? '—'}%`} />
          <KVRow label="simHoldings"     value={simScenario?.holdings.length ?? 0} />
          <KVRow label="baseHoldings"    value={baseScenario?.holdings.length ?? 0} />
          <KVRow label="suggestions"     value={suggestions.length} />
          <KVRow label="riskProfile (sim)"  value={simScenario?.riskSnapshot?.risk_profile  ?? '—'} />
          <KVRow label="riskProfile (base)" value={baseScenario?.riskSnapshot?.risk_profile ?? '—'} />

          {isModified && simScenario && (
            <SubSection label="Modified holdings">
              <JsonBlock
                data={simScenario.holdings.filter((h) => h.action !== 'hold').map((h) => ({
                  ticker: h.ticker,
                  action: h.action,
                  weight: h.weight,
                  original_weight: h.original_weight,
                }))}
              />
            </SubSection>
          )}
        </>
      )}
    </DiagSection>
  )
}

// ─── 5. Portfolio Data ────────────────────────────────────────────────────────

function PortfolioDataSection() {
  const { holdings, summary, sectors, loading, error } = usePortfolio()
  const riskSnapshot = computeRiskSnapshot(holdings, sectors, summary)

  return (
    <DiagSection title="Portfolio Data" badge={`${holdings.length} holdings`}>
      {loading && <LoadingRow />}
      {error   && <ErrorRow message={error} />}
      {!loading && (
        <>
          <SubSection label={`Holdings (${holdings.length})`}>
            <JsonBlock data={holdings.slice(0, 5)} note={holdings.length > 5 ? `…${holdings.length - 5} more hidden` : undefined} />
          </SubSection>
          <SubSection label="Summary">
            <JsonBlock data={summary} />
          </SubSection>
          <SubSection label="Sectors">
            <JsonBlock data={sectors} />
          </SubSection>
          <SubSection label="Risk Snapshot">
            <JsonBlock data={riskSnapshot} />
          </SubSection>
        </>
      )}
    </DiagSection>
  )
}

// ─── 6. Fundamentals ─────────────────────────────────────────────────────────

function FundamentalsSection() {
  const { holdings }                                  = usePortfolio()
  const { weightedMetrics, ratios, loading, error }   = useFundamentals(holdings)

  return (
    <DiagSection title="Fundamentals & Weighted Metrics" badge={`${ratios.length} ratios`}>
      {loading && <LoadingRow />}
      {error   && <ErrorRow message={error} />}
      {!loading && (
        <>
          <SubSection label="Weighted Portfolio Metrics">
            <JsonBlock data={weightedMetrics} />
          </SubSection>
          <SubSection label={`Per-Ticker Ratios (${ratios.length}, showing first 3)`}>
            <JsonBlock data={ratios.slice(0, 3)} note={ratios.length > 3 ? `…${ratios.length - 3} more` : undefined} />
          </SubSection>
        </>
      )}
    </DiagSection>
  )
}

// ─── 7. News & Events ─────────────────────────────────────────────────────────

function NewsSection() {
  const { articles, events, loading, error } = useNews()

  return (
    <DiagSection title="News & Events" badge={`${articles.length} articles · ${events.length} events`}>
      {loading && <LoadingRow />}
      {error   && <ErrorRow message={error} />}
      {!loading && (
        <>
          <SubSection label={`Articles (showing first 3 of ${articles.length})`}>
            <JsonBlock
              data={articles.slice(0, 3).map((a) => ({
                title:        a.title.slice(0, 60) + '…',
                event_type:   a.event_type,
                sentiment:    a.sentiment,
                tickers:      a.tickers,
                published_at: a.published_at,
              }))}
            />
          </SubSection>
          <SubSection label={`Upcoming Events (showing first 3 of ${events.length})`}>
            <JsonBlock data={events.slice(0, 3)} />
          </SubSection>
        </>
      )}
    </DiagSection>
  )
}

// ─── 2b. Live Provider Status ─────────────────────────────────────────────────

function ProviderStatusSection() {
  const { status, loading, error, refetch, lastFetchedAt } = useProviderStatus()

  const yfOk = status?.yfinance_available === true
  const badge = loading
    ? 'checking…'
    : error
    ? 'ERROR'
    : yfOk
    ? 'yfinance ✓'
    : 'yfinance missing'

  return (
    <DiagSection
      title="Live Provider Status"
      badge={badge}
      badgeOk={!loading && !error && yfOk}
      icon={Wifi}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] text-slate-400">
          {lastFetchedAt ? `Last checked ${lastFetchedAt.toLocaleTimeString()}` : 'Not yet checked'}
        </span>
        <button
          onClick={refetch}
          disabled={loading}
          className="text-xs text-indigo-600 hover:text-indigo-800 disabled:opacity-40"
        >
          Refresh
        </button>
      </div>

      {loading && <LoadingRow />}
      {error   && <ErrorRow message={error} />}

      {status && !loading && (
        <>
          <KVRow label="live_api_enabled"   value={String(status.live_api_enabled)} />
          <KVRow label="yfinance_available" value={String(status.yfinance_available)} />
          <KVRow label="provider"           value={status.provider} />

          {status.note && (
            <p className="mt-1 text-[10px] text-amber-600 bg-amber-50 border border-amber-100 rounded px-2 py-1.5">
              {status.note}
            </p>
          )}

          {status.cache && (
            <SubSection label="Cache">
              <KVRow label="price_cache_size" value={status.cache.price_cache_size} />
              <KVRow label="fund_cache_size"  value={status.cache.fund_cache_size} />
              <KVRow label="price_ttl"        value={`${status.cache.price_ttl_seconds}s`} />
              <KVRow label="fund_ttl"         value={`${status.cache.fund_ttl_seconds / 3600}h`} />

              {status.cache.cached_price_tickers.length > 0 && (
                <div className="mt-2">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">
                    Cached prices ({status.cache.cached_price_tickers.length})
                  </p>
                  <div className="space-y-0.5">
                    {status.cache.cached_price_tickers.map((t) => (
                      <div key={t.ticker} className="flex items-center justify-between text-[10px] font-mono">
                        <span className="text-slate-600">{t.ticker}</span>
                        <span className="flex items-center gap-2">
                          <span className="text-slate-700">₹{t.price.toLocaleString('en-IN')}</span>
                          <span className={cn(
                            'rounded-full px-1.5 py-0.5 text-[9px] font-semibold',
                            t.fresh ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-600'
                          )}>
                            {t.fresh ? 'fresh' : `${Math.round(t.age_seconds)}s old`}
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {status.cache.cached_price_tickers.length === 0 && (
                <p className="text-[10px] text-slate-400 mt-1 italic">
                  No prices cached yet. Switch to Live mode to populate.
                </p>
              )}
            </SubSection>
          )}
        </>
      )}
    </DiagSection>
  )
}

// ─── 8. Quantitative Analytics ────────────────────────────────────────────────

function QuantAnalyticsSection() {
  const { data, loading, error, period, setPeriod, refetch } = useQuantAnalytics()

  const meta        = data?.meta
  const metrics     = data?.metrics?.portfolio
  const benchmark   = data?.metrics?.benchmark
  const correlation = data?.correlation

  const badge = loading
    ? 'loading…'
    : error
    ? 'ERROR'
    : meta
    ? `${meta.valid_tickers.length} tickers · ${meta.period}`
    : 'no data'

  const isOk = !loading && !error && !!meta

  return (
    <DiagSection
      title="Quantitative Analytics"
      badge={badge}
      badgeOk={isOk}
      icon={TrendingUp}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {(['1y', '6mo', '3mo'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={cn(
                'px-2 py-0.5 rounded text-[10px] font-semibold transition-colors',
                period === p
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              )}
            >
              {p}
            </button>
          ))}
        </div>
        <button
          onClick={refetch}
          disabled={loading}
          className="text-xs text-indigo-600 hover:text-indigo-800 disabled:opacity-40"
        >
          Refresh
        </button>
      </div>

      {loading && <LoadingRow />}
      {error   && <ErrorRow message={error} />}

      {!loading && data && (
        <>
          {/* Meta */}
          <SubSection label="Meta">
            <KVRow label="provider_mode"     value={meta?.provider_mode ?? '—'} />
            <KVRow label="period"            value={meta?.period ?? '—'} />
            <KVRow label="data_points"       value={meta?.data_points ?? 0} />
            <KVRow label="benchmark"         value={`${meta?.benchmark_name ?? '—'} (${meta?.benchmark_ticker ?? '—'})`} />
            <KVRow label="benchmark_source"  value={meta?.benchmark_source ?? '—'} />
            <KVRow
              label="benchmark_available"
              value={String(meta?.benchmark_available ?? true)}
              valueClass={meta?.benchmark_available === false ? 'text-red-600' : 'text-emerald-700'}
            />
            <KVRow label="risk_free_rate"    value={`${((meta?.risk_free_rate ?? 0) * 100).toFixed(1)}%`} />
            <KVRow label="cached"            value={String(meta?.cached ?? false)} />
            {meta?.date_range && (
              <KVRow label="date_range" value={`${meta.date_range.start} → ${meta.date_range.end}`} />
            )}
            {(meta?.invalid_tickers?.length ?? 0) > 0 && (
              <p className="text-[10px] text-amber-600 bg-amber-50 border border-amber-100 rounded px-2 py-1 mt-1">
                Excluded tickers: {meta!.invalid_tickers.join(', ')}
              </p>
            )}
          </SubSection>

          {/* Per-ticker data source status */}
          {meta?.ticker_status && Object.keys(meta.ticker_status).length > 0 && (
            <SubSection label="Ticker Data Sources">
              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                {Object.entries(meta.ticker_status).map(([ticker, src]) => (
                  <div key={ticker} className="flex items-center justify-between py-0.5">
                    <span className="font-mono text-[10px] text-slate-600">{ticker}</span>
                    <span className={cn(
                      'text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border',
                      src === 'yfinance'     ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : src === 'mock'       ? 'bg-slate-100 text-slate-500 border-slate-200'
                      : src === 'unavailable' ? 'bg-red-50 text-red-600 border-red-200'
                      :                        'bg-amber-50 text-amber-700 border-amber-200'
                    )}>
                      {src}
                    </span>
                  </div>
                ))}
              </div>
            </SubSection>
          )}

          {/* Portfolio metrics */}
          {metrics && (
            <SubSection label="Portfolio Risk Metrics">
              <KVRow label="annualized_return"     value={`${metrics.annualized_return?.toFixed(2) ?? '—'}%`} />
              <KVRow label="annualized_volatility" value={`${metrics.annualized_volatility?.toFixed(2) ?? '—'}%`} />
              <KVRow label="sharpe_ratio"          value={`${metrics.sharpe_ratio?.toFixed(3) ?? '—'}x`} />
              <KVRow label="sortino_ratio"         value={`${metrics.sortino_ratio?.toFixed(3) ?? '—'}x`} />
              <KVRow label="max_drawdown"          value={`${metrics.max_drawdown?.toFixed(2) ?? '—'}%`} />
              <KVRow label="beta"                  value={`${metrics.beta?.toFixed(3) ?? '—'}`} />
              <KVRow label="tracking_error"        value={`${metrics.tracking_error?.toFixed(2) ?? '—'}%`} />
              <KVRow label="information_ratio"     value={`${metrics.information_ratio?.toFixed(3) ?? '—'}x`} />
              <KVRow label="alpha"                 value={`${metrics.alpha?.toFixed(2) ?? '—'}%`} />
              <KVRow label="var_95"                value={`${metrics.var_95?.toFixed(2) ?? '—'}%`} />
              {metrics.error && <ErrorRow message={metrics.error} />}
            </SubSection>
          )}

          {/* Benchmark metrics */}
          {benchmark && (
            <SubSection label={`Benchmark: ${benchmark.name}`}>
              <KVRow label="annualized_return"     value={`${benchmark.annualized_return?.toFixed(2) ?? '—'}%`} />
              <KVRow label="annualized_volatility" value={`${benchmark.annualized_volatility?.toFixed(2) ?? '—'}%`} />
              <KVRow label="sharpe_ratio"          value={`${benchmark.sharpe_ratio?.toFixed(3) ?? '—'}x`} />
              <KVRow label="max_drawdown"          value={`${benchmark.max_drawdown?.toFixed(2) ?? '—'}%`} />
            </SubSection>
          )}

          {/* Correlation summary */}
          {correlation && (
            <SubSection label={`Correlation (${correlation.tickers.length} tickers)`}>
              <KVRow label="average_pairwise"  value={`${correlation.average_pairwise?.toFixed(3) ?? '—'}`} />
              <KVRow label="interpretation"    value={correlation.interpretation ?? '—'} />
              {correlation.min_pair && (
                <KVRow
                  label="lowest pair"
                  value={`${correlation.min_pair.tickers.join(' × ')} = ${correlation.min_pair.value.toFixed(3)}`}
                />
              )}
              {correlation.max_pair && (
                <KVRow
                  label="highest pair"
                  value={`${correlation.max_pair.tickers.join(' × ')} = ${correlation.max_pair.value.toFixed(3)}`}
                />
              )}
            </SubSection>
          )}

          {/* Contributions */}
          {data.contributions?.length > 0 && (
            <SubSection label={`Per-Holding Contributions (${data.contributions.length})`}>
              <JsonBlock
                data={data.contributions.map((c) => ({
                  ticker: c.ticker,
                  weight: `${c.weight?.toFixed(1)}%`,
                  ann_return: `${c.annualized_return?.toFixed(2) ?? '—'}%`,
                  volatility: `${c.volatility?.toFixed(2) ?? '—'}%`,
                  beta: c.beta?.toFixed(3) ?? '—',
                }))}
              />
            </SubSection>
          )}

          {/* Series lengths */}
          <SubSection label="Series lengths">
            <KVRow label="performance.portfolio" value={data.performance?.portfolio?.length ?? 0} />
            <KVRow label="performance.benchmark" value={data.performance?.benchmark?.length ?? 0} />
            <KVRow label="drawdown"              value={data.drawdown?.length ?? 0} />
          </SubSection>
        </>
      )}
    </DiagSection>
  )
}

// ─── 9. Optimization ──────────────────────────────────────────────────────────

function OptimizationSection() {
  const { data, loading, error, period, setPeriod, refetch } = useOptimization()
  const meta       = data?.meta
  const current    = data?.current
  const minVar     = data?.min_variance
  const maxSharpe  = data?.max_sharpe
  const inputs     = data?.inputs
  const rebalance  = data?.rebalance ?? []

  const badge = loading
    ? 'loading…'
    : error
    ? 'ERROR'
    : meta?.error
    ? 'ERROR'
    : meta
    ? `${meta.valid_tickers.length} tickers · ${meta.optimizer_method ?? '—'}`
    : 'no data'

  const isOk = !loading && !error && !meta?.error && !!meta

  return (
    <DiagSection
      title="Portfolio Optimization"
      badge={badge}
      badgeOk={isOk}
      icon={TrendingUp}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {(['1y', '6mo', '3mo'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={cn(
                'px-2 py-0.5 rounded text-[10px] font-semibold transition-colors',
                period === p
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              )}
            >
              {p}
            </button>
          ))}
        </div>
        <button
          onClick={refetch}
          disabled={loading}
          className="text-xs text-indigo-600 hover:text-indigo-800 disabled:opacity-40"
        >
          Refresh
        </button>
      </div>

      {loading && <LoadingRow />}
      {error   && <ErrorRow message={error} />}

      {!loading && data && (
        <>
          {/* Meta */}
          <SubSection label="Meta">
            <KVRow label="provider_mode"           value={meta?.provider_mode ?? '—'} />
            <KVRow label="period"                  value={meta?.period ?? '—'} />
            <KVRow label="n_observations"          value={meta?.n_observations ?? 0} />
            <KVRow label="optimizer_method"        value={meta?.optimizer_method ?? '—'} />
            <KVRow label="expected_returns_method" value={meta?.expected_returns_method ?? '—'} />
            <KVRow label="covariance_method"       value={meta?.covariance_method ?? '—'} />
            <KVRow label="n_frontier_points"       value={meta?.n_frontier_points ?? 0} />
            <KVRow label="risk_free_rate"          value={`${((meta?.risk_free_rate ?? 0) * 100).toFixed(1)}%`} />
            <KVRow label="constraints"             value={(meta?.constraints ?? []).join(', ')} />
            <KVRow
              label="scipy_available"
              value={meta?.scipy_available == null ? '—' : meta.scipy_available ? '✓ yes' : '✗ no (Monte Carlo fallback)'}
              valueClass={meta?.scipy_available === false ? 'text-amber-600 font-semibold' : undefined}
            />
            <KVRow
              label="sklearn_available"
              value={meta?.sklearn_available == null ? '—' : meta.sklearn_available ? '✓ yes' : '✗ no (Ledoit-Wolf disabled)'}
              valueClass={meta?.sklearn_available === false ? 'text-slate-500' : undefined}
            />
            <KVRow label="cached"                  value={String(meta?.cached ?? false)} />
            {(meta?.invalid_tickers?.length ?? 0) > 0 && (
              <p className="text-[10px] text-amber-600 bg-amber-50 border border-amber-100 rounded px-2 py-1 mt-1">
                Excluded: {meta!.invalid_tickers.join(', ')}
              </p>
            )}
            {meta?.error && <ErrorRow message={meta.error} />}
          </SubSection>

          {/* Per-ticker history source */}
          {meta?.ticker_status && Object.keys(meta.ticker_status).length > 0 && (
            <SubSection label="Ticker Data Sources (Optimizer)">
              <div className="space-y-1">
                {Object.entries(meta.ticker_status).map(([ticker, src]) => (
                  <div key={ticker} className="flex items-center justify-between py-0.5">
                    <span className="text-[10px] font-mono text-slate-600">{ticker}</span>
                    <span className={cn(
                      'text-[9px] font-bold rounded px-1.5 py-0.5',
                      src === 'yfinance'    ? 'bg-emerald-50 text-emerald-700' :
                      src === 'mock'        ? 'bg-indigo-50 text-indigo-600'   :
                      src === 'unavailable' ? 'bg-red-50 text-red-600'         :
                      'bg-slate-100 text-slate-500'
                    )}>
                      {src}
                    </span>
                  </div>
                ))}
              </div>
            </SubSection>
          )}

          {/* Portfolio points comparison */}
          {current && (
            <SubSection label="Portfolio Comparison">
              <div className="text-[10px] font-mono space-y-1">
                <div className="grid grid-cols-4 gap-2 font-bold text-slate-500 border-b border-slate-100 pb-1 mb-1">
                  <span>—</span><span>Return</span><span>Vol</span><span>Sharpe</span>
                </div>
                {[
                  { label: 'Current',     p: current  },
                  { label: 'Min Var',     p: minVar   },
                  { label: 'Max Sharpe',  p: maxSharpe },
                ].filter((r) => r.p).map(({ label, p }) => p && (
                  <div key={label} className="grid grid-cols-4 gap-2 text-slate-700">
                    <span className="font-semibold">{label}</span>
                    <span>{p.expected_return.toFixed(2)}%</span>
                    <span>{p.volatility.toFixed(2)}%</span>
                    <span>{p.sharpe_ratio.toFixed(3)}x</span>
                  </div>
                ))}
              </div>
            </SubSection>
          )}

          {/* Expected returns */}
          {inputs?.expected_returns && (
            <SubSection label="Expected Returns (annualised %)">
              <JsonBlock
                data={Object.fromEntries(
                  Object.entries(inputs.expected_returns).map(([t, v]) => [t, `${v.toFixed(2)}%`])
                )}
              />
            </SubSection>
          )}

          {/* Cov diagonal */}
          {inputs?.covariance_diagonal && (
            <SubSection label="Covariance Diagonal (Σ_ii)">
              <JsonBlock data={inputs.covariance_diagonal} />
            </SubSection>
          )}

          {/* Rebalance deltas */}
          {rebalance.length > 0 && (
            <SubSection label={`Rebalance Deltas (${rebalance.length})`}>
              <JsonBlock
                data={rebalance.map((r) => ({
                  ticker:  r.ticker,
                  current: `${r.current_weight.toFixed(1)}%`,
                  target:  `${r.target_weight.toFixed(1)}%`,
                  delta:   `${r.delta_pct > 0 ? '+' : ''}${r.delta_pct.toFixed(1)}pp`,
                  action:  r.action,
                }))}
              />
            </SubSection>
          )}

          {/* Frontier length */}
          <SubSection label="Frontier">
            <KVRow label="frontier points" value={data.frontier?.length ?? 0} />
          </SubSection>
        </>
      )}
    </DiagSection>
  )
}

// ─── Portfolio Persistence Section ───────────────────────────────────────────

function PortfolioPersistenceSection() {
  const { portfolios, activePortfolioId, loading, error } = usePortfolios()
  const { loaded } = usePortfolioStore()
  const activeP = portfolios.find((p) => p.id === activePortfolioId)

  return (
    <DiagSection
      title="Portfolio Persistence"
      icon={FolderOpen}
      badge={loaded ? `${portfolios.length} portfolios` : 'loading'}
      badgeOk={loaded && portfolios.length > 0}
      defaultOpen={false}
    >
      {loading && <p className="text-xs text-slate-400 px-4 py-2">Loading…</p>}
      {error   && <p className="text-xs text-rose-500  px-4 py-2">{error}</p>}

      <SubSection label="Store">
        <KVRow label="store.loaded"           value={loaded} />
        <KVRow label="portfolios.length"      value={portfolios.length} />
        <KVRow label="activePortfolioId"      value={activePortfolioId ?? 'none'} />
      </SubSection>

      {activeP && (
        <SubSection label="Active Portfolio">
          <KVRow label="id"               value={activeP.id} />
          <KVRow label="name"             value={activeP.name} />
          <KVRow label="source"           value={activeP.source} />
          <KVRow label="is_refreshable"   value={String(activeP.is_refreshable ?? false)} />
          <KVRow label="num_holdings"     value={activeP.num_holdings} />
          <KVRow label="upload_filename"  value={activeP.upload_filename ?? '—'} />
          <KVRow
            label="last_synced_at"
            value={activeP.last_synced_at
              ? new Date(activeP.last_synced_at).toLocaleString()
              : '—'
            }
          />
          {activeP.source_metadata && (
            <div className="mt-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">
                source_metadata (parsed)
              </p>
              <JsonBlock data={(() => {
                try { return JSON.parse(activeP.source_metadata!) }
                catch { return activeP.source_metadata }
              })()} />
            </div>
          )}
        </SubSection>
      )}

      {portfolios.length > 0 && (
        <SubSection label="All Portfolios">
          <pre className="text-[10px] font-mono text-slate-600 bg-slate-50 border border-slate-100 rounded-md p-3 overflow-x-auto max-h-[180px] overflow-y-auto leading-relaxed">
            {JSON.stringify(portfolios.map((p) => ({
              id:              p.id,
              name:            p.name,
              source:          p.source,
              is_active:       p.is_active,
              is_refreshable:  p.is_refreshable,
              num_holdings:    p.num_holdings,
              last_synced_at:  p.last_synced_at ?? null,
              upload_filename: p.upload_filename ?? null,
            })), null, 2)}
          </pre>
        </SubSection>
      )}
    </DiagSection>
  )
}

// ─── Snapshot + Delta Section ─────────────────────────────────────────────────

function SnapshotSection() {
  const { activePortfolioId } = usePortfolioStore()
  const { snapshots, loading, error } = useSnapshots(activePortfolioId)

  // Auto-compare latest two snapshots (newest-first)
  const toId   = snapshots.length >= 2 ? snapshots[0].id : null
  const fromId = snapshots.length >= 2 ? snapshots[1].id : null
  const { delta, loading: deltaLoading, error: deltaError } = useDelta(fromId, toId)

  return (
    <DiagSection
      title="Snapshots & Delta"
      icon={Layers}
      badge={loading ? 'loading' : `${snapshots.length} snapshots`}
      badgeOk={!loading && !error}
      defaultOpen={false}
    >
      {loading && <p className="text-xs text-slate-400 px-4 py-2">Loading…</p>}
      {error   && <p className="text-xs text-rose-500  px-4 py-2">{error}</p>}

      {!loading && (
        <SubSection label="Summary">
          <KVRow label="snapshot_count"   value={snapshots.length} />
          <KVRow label="latest_snap_id"   value={snapshots.length > 0 ? snapshots[0].id : '—'} />
          <KVRow label="oldest_snap_id"   value={snapshots.length > 0 ? snapshots[snapshots.length - 1].id : '—'} />
        </SubSection>
      )}
      {!loading && snapshots.length === 0 && (
        <p className="text-xs text-slate-400 px-4 py-2">No snapshots for active portfolio.</p>
      )}

      {/* Latest 3 snapshots */}
      {snapshots.slice(0, 3).map((s, i) => (
        <SubSection key={s.id} label={`Snapshot #${s.id}${i === 0 ? ' (latest)' : ''}`}>
          <KVRow label="label"          value={s.label ?? '—'} />
          <KVRow label="captured_at"    value={s.captured_at} />
          <KVRow label="total_value"    value={s.total_value != null ? `₹${s.total_value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : '—'} />
          <KVRow label="num_holdings"   value={s.num_holdings ?? '—'} />
          <KVRow label="top_sector"     value={s.top_sector ?? '—'} />
        </SubSection>
      ))}

      {/* Delta: latest vs previous */}
      {snapshots.length >= 2 && (
        <SubSection label={`Delta: #${fromId} → #${toId}`}>
          {deltaLoading && <p className="text-xs text-slate-400 py-1">Computing delta…</p>}
          {deltaError   && <p className="text-xs text-rose-500  py-1">{deltaError}</p>}
          {delta && (
            <>
              <KVRow label="days_apart"         value={delta.days_apart} />
              <KVRow label="value_delta"        value={delta.total_value_delta != null ? `${delta.total_value_delta >= 0 ? '+' : ''}${delta.total_value_delta.toFixed(0)}` : '—'} />
              <KVRow label="value_delta_pct"    value={delta.total_value_delta_pct != null ? `${delta.total_value_delta_pct >= 0 ? '+' : ''}${delta.total_value_delta_pct.toFixed(2)}%` : '—'} />
              <KVRow label="added_tickers"      value={delta.added_tickers.length > 0 ? delta.added_tickers.join(', ') : 'none'} />
              <KVRow label="removed_tickers"    value={delta.removed_tickers.length > 0 ? delta.removed_tickers.join(', ') : 'none'} />
              <KVRow label="increased"          value={delta.increased_tickers.length} />
              <KVRow label="decreased"          value={delta.decreased_tickers.length} />
              <KVRow label="unchanged"          value={delta.unchanged_tickers.length} />
              <KVRow label="holding_deltas"     value={delta.holding_deltas.length} />
              <KVRow label="sector_deltas"      value={delta.sector_deltas.length} />
            </>
          )}
        </SubSection>
      )}

      {/* Raw delta payload */}
      {delta && (
        <SubSection label="Raw Delta Payload (first 5 holding_deltas)">
          <pre className="text-[10px] font-mono text-slate-600 bg-slate-50 border border-slate-100 rounded-md p-3 overflow-x-auto max-h-[200px] overflow-y-auto leading-relaxed">
            {JSON.stringify({
              snapshot_a_id: delta.snapshot_a_id,
              snapshot_b_id: delta.snapshot_b_id,
              days_apart:    delta.days_apart,
              holding_deltas: delta.holding_deltas.slice(0, 5),
              sector_deltas:  delta.sector_deltas.slice(0, 5),
            }, null, 2)}
          </pre>
        </SubSection>
      )}
    </DiagSection>
  )
}

// ─── Broker Connections Section ───────────────────────────────────────────────

function BrokerConnectionsSection() {
  const { activePortfolioId } = usePortfolios()
  const portfolioId = activePortfolioId

  const [brokers,    setBrokers]    = useState<import('@/types').BrokerInfo[]>([])
  const [connection, setConnection] = useState<import('@/types').BrokerConnection | null>(null)
  const [loading,    setLoading]    = useState(false)
  const [err,        setErr]        = useState<string | null>(null)

  useEffect(() => {
    if (!portfolioId) return
    setLoading(true)
    setErr(null)
    Promise.allSettled([
      brokerApi.listConnectors(),
      brokerApi.getConnection(portfolioId),
    ]).then(([listRes, connRes]) => {
      if (listRes.status === 'fulfilled') setBrokers(listRes.value.brokers)
      else setErr((listRes.reason as Error)?.message ?? 'Failed to load brokers')
      if (connRes.status === 'fulfilled' && connRes.value.broker_name) {
        setConnection(connRes.value)
      }
    }).finally(() => setLoading(false))
  }, [portfolioId])

  const implementedCount = brokers.filter(b => b.is_implemented).length
  const isConnected      = connection?.connection_state === 'connected'

  return (
    <DiagSection
      title="Broker Connections"
      badge={loading ? '…' : err ? 'error' : `${brokers.length} connectors`}
      badgeOk={!err && !loading}
      icon={Wifi}
    >
      {loading && <p className="text-xs text-slate-400">Loading…</p>}
      {err && <p className="text-xs text-rose-500">{err}</p>}
      {!loading && !err && (
        <>
          <SubSection label="Registry">
            <KVRow label="total_connectors"   value={brokers.length} />
            <KVRow label="implemented"        value={implementedCount} />
            <KVRow label="scaffolded"         value={brokers.length - implementedCount} />
            <KVRow label="portfolio_id"       value={portfolioId ?? '—'} />
            <KVRow label="has_connection"     value={String(!!connection)} />
            <KVRow label="is_connected"       value={String(isConnected)} />
          </SubSection>

          <SubSection label="Active Portfolio Connection">
            {connection ? (
              <>
                <KVRow label="broker_name"       value={connection.broker_name ?? '—'} />
                <KVRow label="connection_state"  value={connection.connection_state ?? '—'} />
                <KVRow label="account_id"        value={connection.account_id ?? '—'} />
                <KVRow label="last_sync_at"      value={connection.last_sync_at ? new Date(connection.last_sync_at).toLocaleString() : '—'} />
                <KVRow label="sync_error"        value={connection.sync_error ?? '—'} />
              </>
            ) : (
              <p className="text-xs text-slate-400">No connection established for this portfolio.</p>
            )}
          </SubSection>

          <SubSection label="All Connectors (raw)">
            <pre className="text-[10px] font-mono text-slate-600 bg-slate-50 border border-slate-100 rounded-md p-3 overflow-x-auto max-h-[200px] overflow-y-auto leading-relaxed">
              {JSON.stringify(brokers, null, 2)}
            </pre>
          </SubSection>
        </>
      )}
    </DiagSection>
  )
}

// ─── Main export ──────────────────────────────────────────────────────────────

// ─── AI Advisor Section ───────────────────────────────────────────────────────

function AIAdvisorSection() {
  const { activePortfolioId } = usePortfolios()

  const [status,   setStatus]   = useState<import('@/types').AdvisorStatus | null>(null)
  const [context,  setContext]  = useState<import('@/types').PortfolioContextPayload | null>(null)
  const [lastQuery,  setLastQuery]  = useState<string>('')
  const [lastResp,   setLastResp]   = useState<import('@/types').AIAdvisorResponse | null>(null)
  const [loading,  setLoading]  = useState(false)
  const [testMsg,  setTestMsg]  = useState('')
  const [err,      setErr]      = useState<string | null>(null)

  // Fetch status + context on mount / portfolio change
  useEffect(() => {
    setLoading(true)
    setErr(null)
    Promise.allSettled([
      advisorApi.status(),
      activePortfolioId ? advisorApi.getContext(activePortfolioId) : Promise.resolve(null),
    ]).then(([sRes, cRes]) => {
      if (sRes.status === 'fulfilled') setStatus(sRes.value)
      else setErr((sRes.reason as Error)?.message ?? 'Status fetch failed')
      if (cRes.status === 'fulfilled' && cRes.value) setContext(cRes.value as import('@/types').PortfolioContextPayload)
    }).finally(() => setLoading(false))
  }, [activePortfolioId])

  const testQuery = async () => {
    if (!lastQuery.trim()) return
    setTestMsg('Sending…')
    try {
      const resp = await advisorApi.ask(lastQuery, activePortfolioId, true, false)
      setLastResp(resp)
      setTestMsg(`${resp.fallback_used ? '⚠ fallback used' : '✓ AI response'} — ${resp.latency_ms}ms`)
    } catch (e) {
      setTestMsg(`Error: ${(e as Error).message}`)
    }
  }

  return (
    <DiagSection
      title="AI Advisor"
      badge={loading ? '…' : err ? 'error' : status?.available ? status.provider : 'fallback'}
      badgeOk={!err && !loading && (status?.available ?? false)}
      icon={Wifi}
    >
      {loading && <p className="text-xs text-slate-400">Loading…</p>}
      {err && <p className="text-xs text-rose-500">{err}</p>}

      {/* Provider status */}
      {status && (
        <SubSection label="Provider Status">
          <KVRow label="available"   value={String(status.available)} />
          <KVRow label="provider"    value={status.provider} />
          <KVRow label="model"       value={status.model ?? '—'} />
          <KVRow label="ai_enabled"  value={String(status.ai_enabled)} />
          <KVRow label="message"     value={status.message} />
        </SubSection>
      )}

      {/* Context payload summary */}
      {context && (
        <SubSection label="Context Payload (last built)">
          <KVRow label="portfolio"       value={context.portfolio_name} />
          <KVRow label="total_value"     value={`₹${context.total_value.toLocaleString()}`} />
          <KVRow label="num_holdings"    value={context.num_holdings} />
          <KVRow label="sectors"         value={context.num_sectors} />
          <KVRow label="risk_profile"    value={context.risk_profile} />
          <KVRow label="hhi"             value={context.hhi.toFixed(4)} />
          <KVRow label="div_score"       value={`${context.diversification_score}/100`} />
          <KVRow label="snapshot_count"  value={context.snapshot_count} />
          <KVRow label="has_changes"     value={String(!!context.recent_changes)} />
          <KVRow label="built_at"        value={new Date(context.built_at).toLocaleString()} />
        </SubSection>
      )}

      {/* Test query */}
      <SubSection label="Test Query">
        <div className="flex gap-2">
          <input
            type="text"
            value={lastQuery}
            onChange={(e) => setLastQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && testQuery()}
            placeholder="Type a test query…"
            className="flex-1 text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-300"
          />
          <button
            onClick={testQuery}
            className="text-[10px] font-semibold bg-indigo-600 text-white rounded px-2 py-1 hover:bg-indigo-700 transition-colors"
          >
            Ask
          </button>
        </div>
        {testMsg && <p className="text-[10px] text-slate-500 mt-1">{testMsg}</p>}
        {lastResp && (
          <pre className="text-[10px] font-mono text-slate-600 bg-slate-50 border border-slate-100 rounded-md p-3 overflow-x-auto max-h-[180px] overflow-y-auto leading-relaxed mt-2">
            {JSON.stringify({
              provider:      lastResp.provider,
              latency_ms:    lastResp.latency_ms,
              fallback_used: lastResp.fallback_used,
              summary:       lastResp.summary,
              insights:      lastResp.insights.slice(0, 2),
              recommendations: lastResp.recommendations.slice(0, 2),
            }, null, 2)}
          </pre>
        )}
      </SubSection>
    </DiagSection>
  )
}

// ─── Scaffolded Modules ───────────────────────────────────────────────────────

function ScaffoldedModulesSection() {
  const SCAFFOLDED = [
    {
      module:    'GET /api/v1/news/',
      status:    'No news API wired',
      detail:    'LiveAPIProvider.get_news() returns []. Phase 2: connect NewsAPI / yfinance.news key.',
      severity:  'warn' as const,
    },
    {
      module:    'GET /api/v1/news/events',
      status:    'No corporate calendar API',
      detail:    'LiveAPIProvider.get_events() returns []. Phase 2: connect Bloomberg or EODHD events API.',
      severity:  'warn' as const,
    },
    {
      module:    'GET /api/v1/frontier/',
      status:    'Deprecated scaffold',
      detail:    'Returns empty response with redirect_to=/api/v1/optimization/full. Safe to remove after clients migrate.',
      severity:  'info' as const,
    },
    {
      module:    'BrokerSyncProvider',
      status:    'Placeholder only',
      detail:    'get_holdings() / get_price_history() raise NotImplementedError. No broker OAuth implemented yet.',
      severity:  'info' as const,
    },
  ]

  return (
    <DiagSection title="Scaffolded / Unavailable Modules" icon={Layers}>
      <p className="text-[10px] text-slate-400 mb-2">
        Modules intentionally not fully implemented. Live mode callers receive explicit
        empty/unavailable responses — no silent mock fallback.
      </p>
      <div className="space-y-2">
        {SCAFFOLDED.map((item) => (
          <div
            key={item.module}
            className={cn(
              'rounded-md border px-3 py-2',
              item.severity === 'warn' ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-slate-50'
            )}
          >
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[10px] font-mono font-bold text-slate-700">{item.module}</span>
              <span className={cn(
                'text-[9px] font-bold rounded px-1.5 py-0.5',
                item.severity === 'warn' ? 'bg-amber-200 text-amber-800' : 'bg-slate-200 text-slate-600'
              )}>
                {item.status}
              </span>
            </div>
            <p className="text-[9px] text-slate-500 leading-relaxed">{item.detail}</p>
          </div>
        ))}
      </div>
    </DiagSection>
  )
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function SystemDiagnosticsPanel() {
  return (
    <div className="space-y-3">
      <ApiHealthSection />
      <DataModeSection />
      <PortfolioPersistenceSection />
      <SnapshotSection />
      <BrokerConnectionsSection />
      <AIAdvisorSection />
      <ProviderStatusSection />
      <QuantAnalyticsSection />
      <OptimizationSection />
      <ScaffoldedModulesSection />
      <FilterStateSection />
      <SimulationStateSection />
      <PortfolioDataSection />
      <FundamentalsSection />
      <NewsSection />
    </div>
  )
}
