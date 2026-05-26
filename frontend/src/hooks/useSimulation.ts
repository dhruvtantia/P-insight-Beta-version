/**
 * useSimulation — manages simulation state and exposes all mutation actions
 * -------------------------------------------------------------------------
 *
 * Data pipeline:
 *   usePortfolio()        → holdings (base), sectors (base)
 *   useFundamentals()     → ratios (for fundamentals merge)
 *   useWatchlist()        → watchlistItems (for add-from-watchlist + suggestions)
 *
 * State (persisted across navigation via simulationStore):
 *   simHoldings[]         — the user's current simulated holding list
 *                           (starts as a copy of base holdings; mutated by user actions)
 *                           Survives in-app navigation. Resets only when the active
 *                           portfolio changes or when reset() is called explicitly.
 *
 * Derived (via useMemo):
 *   baseScenario          — computed once from real portfolio data
 *   simScenario           — recomputed from simHoldings on every change
 *   delta                 — before/after metric diff
 *   suggestions           — rule-based rebalancing suggestions
 *
 * Actions:
 *   addStock()            — add a new holding to simHoldings
 *   addNewStock()         — add a new stock by ticker/name/sector (from search)
 *   addFromWatchlist()    — add a watchlist item (pre-fills name/sector)
 *   removeStock()         — mark a holding as 'remove'
 *   undoRemove()          — restore a removed holding
 *   setWeight()           — change a holding's weight %
 *   normalize()           — scale all weights to sum to 100
 *   reset()               — restore simHoldings to the base portfolio
 */

'use client'

import { useMemo, useCallback, useEffect } from 'react'
import { usePortfolio }         from '@/hooks/usePortfolio'
import { useFundamentals }      from '@/hooks/useFundamentals'
import { useWatchlist }         from '@/hooks/useWatchlist'
import { usePortfolioStore }    from '@/store/portfolioStore'
import { useSimulationStore }   from '@/store/simulationStore'
import {
  initSimulatedHoldings,
  buildScenario,
  setHoldingWeight,
  addHolding,
  markRemoved,
  undoRemove as undoRemoveUtil,
  normalizeWeights,
  computeScenarioDelta,
  generateRebalanceSuggestions,
  type SimulatedHolding,
  type PortfolioScenario,
  type ScenarioDelta,
  type RebalanceSuggestion,
} from '@/lib/simulation'
import type { WatchlistItem, FinancialRatio } from '@/types'

// ─── Status types ────────────────────────────────────────────────────────────

export type SimulationReadiness =
  | 'loading'
  | 'no_portfolio_loaded'
  | 'missing_market_values'
  | 'portfolio_stale'
  | 'portfolio_enriching'
  | 'portfolio_degraded'
  | 'ready'

export type TargetWeightState = 'empty' | 'valid' | 'underallocated' | 'overallocated'

export interface SimulationDataQuality {
  missingPriceCount:        number
  fallbackMarketValueCount: number
  unknownPriceStatusCount:  number
  missingFundamentalsCount: number
  activeHoldingCount:       number
}

const VALID_PRICE_STATUSES = new Set([
  'live',
  'stale',
  'missing',
  'fallback_average_cost',
  'uploaded_current_price',
  'provider_failed',
  'not_applicable',
  'pending',
  'unknown',
])

const MISSING_PRICE_STATUSES = new Set([
  'missing',
  'provider_failed',
  'pending',
  'unknown',
])

// ─── Hook result ──────────────────────────────────────────────────────────────

export interface UseSimulationResult {
  // Scenarios
  baseScenario:     PortfolioScenario | null
  simScenario:      PortfolioScenario | null
  delta:            ScenarioDelta | null
  suggestions:      RebalanceSuggestion[]

  // Derived convenience
  totalSimWeight:   number
  isModified:       boolean
  watchlistItems:   WatchlistItem[]
  portfolioTickers: Set<string>
  readiness:        SimulationReadiness
  canSimulate:      boolean
  blockingReason:   string | null
  warnings:         string[]
  targetWeightState: TargetWeightState
  isWeightValid:    boolean
  weightDrift:      number
  dataQuality:      SimulationDataQuality

  // Actions
  addStock:         (holding: Omit<SimulatedHolding, 'action' | 'original_weight' | 'market_value' | 'source'>) => void
  addNewStock:      (ticker: string, name?: string, sector?: string) => void
  addFromWatchlist: (item: WatchlistItem) => void
  removeStock:      (ticker: string) => void
  undoRemove:       (ticker: string) => void
  setWeight:        (ticker: string, weight: number) => void
  normalize:        () => void
  reset:            () => void
  applyFromSuggestion:     (suggestion: RebalanceSuggestion) => void
  applyOptimizedWeights:   (weights: Record<string, number>) => void

  // Loading / error passthrough
  loading:          boolean
  error:            string | null
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useSimulation(): UseSimulationResult {
  // ── Data sources ────────────────────────────────────────────────────────────
  const { holdings: baseHoldings, loading, error, stale, meta } = usePortfolio()
  const { ratios }               = useFundamentals(baseHoldings)
  const { items: watchlistItems } = useWatchlist()

  // Active portfolio ID — used to detect portfolio switches
  const activePortfolioId = usePortfolioStore((s) => s.activePortfolioId)

  // ── Simulation store (persists across navigation) ──────────────────────────
  const {
    simHoldings,
    portfolioId:   storedPortfolioId,
    hasHydrated,
  } = useSimulationStore()

  /**
   * Wrapper around the store setter that supports functional updates.
   * All action callbacks use this so they can compute new state from previous.
   * Uses useSimulationStore.getState() to avoid stale-closure issues.
   */
  const setSimHoldings = useCallback(
    (updater: SimulatedHolding[] | ((prev: SimulatedHolding[]) => SimulatedHolding[])) => {
      const current = useSimulationStore.getState().simHoldings
      const next    = typeof updater === 'function' ? updater(current) : updater
      useSimulationStore.getState().setSimHoldings(next)
    },
    [],
  )

  // ── Derived base values ──────────────────────────────────────────────────────
  const baseMarketValueTotal = useMemo(
    () => baseHoldings.reduce((s, h) => s + (h.market_value ?? 0), 0),
    [baseHoldings],
  )

  const totalValue = baseMarketValueTotal > 0 ? baseMarketValueTotal : 0

  const readiness = useMemo<SimulationReadiness>(() => {
    if (loading) return 'loading'
    if (baseHoldings.length === 0) return 'no_portfolio_loaded'
    if (baseMarketValueTotal <= 0) return 'missing_market_values'
    if (stale) return 'portfolio_stale'
    if (meta?.lifecycle_state === 'enriching') return 'portfolio_enriching'
    if (meta?.lifecycle_state === 'degraded' || meta?.incomplete === true) return 'portfolio_degraded'
    return 'ready'
  }, [loading, baseHoldings.length, baseMarketValueTotal, stale, meta?.lifecycle_state, meta?.incomplete])

  const canSimulate =
    readiness === 'ready' ||
    readiness === 'portfolio_stale' ||
    readiness === 'portfolio_enriching' ||
    readiness === 'portfolio_degraded'

  const blockingReason = useMemo(() => {
    if (readiness === 'no_portfolio_loaded') {
      return 'No portfolio loaded. Upload or activate a portfolio before using simulation.'
    }
    if (readiness === 'missing_market_values') {
      return 'Simulation unavailable because holdings do not have usable market values.'
    }
    return null
  }, [readiness])

  const ratioMap = useMemo(
    () => new Map<string, FinancialRatio>(ratios.map((r) => [r.ticker, r])),
    [ratios],
  )

  // ── Initialise from base portfolio ──────────────────────────────────────────
  const initFromBase = useCallback(() => {
    if (!canSimulate || baseHoldings.length === 0) return
    const initial = initSimulatedHoldings(baseHoldings, ratioMap, totalValue)
    const store   = useSimulationStore.getState()
    store.setSimHoldings(initial)
    store.setPortfolioId(activePortfolioId)
    store.setHasHydrated(true)
  }, [canSimulate, baseHoldings, ratioMap, totalValue, activePortfolioId])

  /**
   * Initialisation logic:
   *   1. Base holdings not loaded yet → wait.
   *   2. Portfolio switched since last stored state → reinitialise.
   *   3. Already have persisted state for this portfolio → keep it (nav-persistence).
   *   4. First load (not yet hydrated) → initialise from base.
   */
  useEffect(() => {
    if (!canSimulate || baseHoldings.length === 0 || loading) return

    // Portfolio switched → force reinitialise
    if (
      hasHydrated &&
      storedPortfolioId !== null &&
      activePortfolioId !== null &&
      storedPortfolioId !== activePortfolioId
    ) {
      initFromBase()
      return
    }

    // Already have valid persisted state → keep it
    if (hasHydrated && simHoldings.length > 0) return

    // First load or empty state → initialise from base
    initFromBase()
  }, [
    baseHoldings.length,
    loading,
    canSimulate,
    hasHydrated,
    storedPortfolioId,
    activePortfolioId,
    simHoldings.length,
    initFromBase,
  ])

  // ── Base scenario (stable) ────────────────────────────────────────────────────
  const baseScenario = useMemo<PortfolioScenario | null>(() => {
    if (!canSimulate || baseHoldings.length === 0) return null
    const baseSimHoldings = initSimulatedHoldings(baseHoldings, ratioMap, totalValue)
    return buildScenario('Current', baseSimHoldings, totalValue)
  }, [canSimulate, baseHoldings, ratioMap, totalValue])

  // ── Simulated scenario (recomputed on every simHoldings mutation) ─────────────
  const simScenario = useMemo<PortfolioScenario | null>(() => {
    if (!canSimulate || simHoldings.length === 0) return null
    return buildScenario('Simulated', simHoldings, totalValue)
  }, [canSimulate, simHoldings, totalValue])

  // ── Delta ────────────────────────────────────────────────────────────────────
  const delta = useMemo<ScenarioDelta | null>(() => {
    if (!baseScenario || !simScenario) return null
    return computeScenarioDelta(baseScenario, simScenario)
  }, [baseScenario, simScenario])

  // ── Rebalance suggestions ─────────────────────────────────────────────────────
  const suggestions = useMemo<RebalanceSuggestion[]>(() => {
    if (!simScenario) return []
    return generateRebalanceSuggestions(simScenario, watchlistItems)
  }, [simScenario, watchlistItems])

  // ── Derived convenience ───────────────────────────────────────────────────────
  const isModified = useMemo(
    () => simHoldings.some((h) => h.action !== 'hold'),
    [simHoldings],
  )

  const totalSimWeight = useMemo(
    () => simHoldings.filter((h) => h.action !== 'remove').reduce((s, h) => s + h.weight, 0),
    [simHoldings],
  )

  const activeSimHoldings = useMemo(
    () => simHoldings.filter((h) => h.action !== 'remove'),
    [simHoldings],
  )

  const targetWeightState = useMemo<TargetWeightState>(() => {
    if (activeSimHoldings.length === 0) return 'empty'
    if (totalSimWeight < 99.5) return 'underallocated'
    if (totalSimWeight > 100.5) return 'overallocated'
    return 'valid'
  }, [activeSimHoldings.length, totalSimWeight])

  const isWeightValid = targetWeightState === 'valid'
  const weightDrift = totalSimWeight - 100

  const dataQuality = useMemo<SimulationDataQuality>(() => {
    const missingPriceCount = baseHoldings.filter((h) => {
      const status = h.price_status
      return h.current_price == null || (status != null && MISSING_PRICE_STATUSES.has(status))
    }).length

    const fallbackMarketValueCount = baseHoldings.filter(
      (h) => h.market_value_uses_fallback === true,
    ).length

    const unknownPriceStatusCount = baseHoldings.filter((h) => {
      const status = h.price_status
      return status == null || !VALID_PRICE_STATUSES.has(status)
    }).length

    const missingFundamentalsCount = activeSimHoldings.filter(
      (h) => h.fundamentals === null,
    ).length

    return {
      missingPriceCount,
      fallbackMarketValueCount,
      unknownPriceStatusCount,
      missingFundamentalsCount,
      activeHoldingCount: activeSimHoldings.length,
    }
  }, [baseHoldings, activeSimHoldings])

  const warnings = useMemo(() => {
    const items: string[] = []
    if (readiness === 'portfolio_stale') {
      items.push('Showing the last successfully loaded portfolio because the latest refresh failed.')
    } else if (readiness === 'portfolio_enriching') {
      items.push('Portfolio enrichment is still running; simulation results may change as prices update.')
    } else if (readiness === 'portfolio_degraded') {
      items.push('Portfolio data is incomplete; treat simulation results as estimates.')
    }

    if (targetWeightState === 'underallocated') {
      items.push(`Target weights are underallocated by ${Math.abs(weightDrift).toFixed(1)}%.`)
    } else if (targetWeightState === 'overallocated') {
      items.push(`Target weights are overallocated by ${Math.abs(weightDrift).toFixed(1)}%.`)
    } else if (targetWeightState === 'empty' && canSimulate) {
      items.push('No active simulated holdings remain.')
    }

    if (dataQuality.missingPriceCount > 0) {
      items.push(`${dataQuality.missingPriceCount} holding${dataQuality.missingPriceCount === 1 ? '' : 's'} have missing or unavailable prices.`)
    }
    if (dataQuality.fallbackMarketValueCount > 0) {
      items.push(`${dataQuality.fallbackMarketValueCount} holding${dataQuality.fallbackMarketValueCount === 1 ? '' : 's'} use fallback market values.`)
    }
    if (dataQuality.unknownPriceStatusCount > 0) {
      items.push(`${dataQuality.unknownPriceStatusCount} holding${dataQuality.unknownPriceStatusCount === 1 ? '' : 's'} have unknown price status.`)
    }
    if (dataQuality.missingFundamentalsCount > 0 && dataQuality.activeHoldingCount > 0) {
      items.push(`Fundamentals are available for ${dataQuality.activeHoldingCount - dataQuality.missingFundamentalsCount}/${dataQuality.activeHoldingCount} active holdings.`)
    }
    return items
  }, [readiness, targetWeightState, weightDrift, canSimulate, dataQuality])

  const portfolioTickers = useMemo(
    () => new Set(baseHoldings.map((h) => h.ticker.toUpperCase())),
    [baseHoldings],
  )

  // ── Actions ───────────────────────────────────────────────────────────────────

  const addStock = useCallback(
    (holding: Omit<SimulatedHolding, 'action' | 'original_weight' | 'market_value' | 'source'>) => {
      setSimHoldings((prev) => addHolding(prev, holding, totalValue))
    },
    [setSimHoldings, totalValue],
  )

  /**
   * Add a brand-new stock by ticker + optional name/sector.
   * Used by the "Search & add stock" flow in SimulationControls.
   * Does NOT require the stock to already be in the watchlist.
   */
  const addNewStock = useCallback(
    (ticker: string, name?: string, sector?: string) => {
      const upper = ticker.trim().toUpperCase()
      setSimHoldings((prev) =>
        addHolding(
          prev,
          {
            ticker:       upper,
            name:         name ?? upper,
            sector:       sector ?? 'Other',
            weight:       5,
            fundamentals: ratioMap.get(upper) ?? null,
            source:       'search',
          },
          totalValue,
        ),
      )
    },
    [setSimHoldings, ratioMap, totalValue],
  )

  const addFromWatchlist = useCallback(
    (item: WatchlistItem) => {
      setSimHoldings((prev) =>
        addHolding(
          prev,
          {
            ticker:       item.ticker,
            name:         item.name ?? item.ticker,
            sector:       item.sector ?? 'Other',
            weight:       5,
            fundamentals: ratioMap.get(item.ticker) ?? null,
            source:       'watchlist',
          },
          totalValue,
        ),
      )
    },
    [setSimHoldings, ratioMap, totalValue],
  )

  const removeStock = useCallback(
    (ticker: string) => {
      setSimHoldings((prev) => markRemoved(prev, ticker, totalValue))
    },
    [setSimHoldings, totalValue],
  )

  const undoRemove = useCallback(
    (ticker: string) => {
      setSimHoldings((prev) => undoRemoveUtil(prev, ticker, totalValue))
    },
    [setSimHoldings, totalValue],
  )

  const setWeight = useCallback(
    (ticker: string, weight: number) => {
      setSimHoldings((prev) => setHoldingWeight(prev, ticker, weight, totalValue))
    },
    [setSimHoldings, totalValue],
  )

  const normalize = useCallback(() => {
    setSimHoldings((prev) => normalizeWeights(prev, totalValue))
  }, [setSimHoldings, totalValue])

  const reset = useCallback(() => {
    initFromBase()
  }, [initFromBase])

  const applyFromSuggestion = useCallback(
    (suggestion: RebalanceSuggestion) => {
      if (suggestion.type === 'trim' && suggestion.ticker && suggestion.suggestedWeight !== undefined) {
        setSimHoldings((prev) =>
          setHoldingWeight(prev, suggestion.ticker!, suggestion.suggestedWeight!, totalValue),
        )
      } else if (suggestion.type === 'add_from_watchlist' && suggestion.ticker) {
        const wlItem = watchlistItems.find(
          (w) => w.ticker.toUpperCase() === suggestion.ticker!.toUpperCase(),
        )
        if (wlItem) {
          setSimHoldings((prev) => addHolding(prev, {
            ticker:       wlItem.ticker,
            name:         wlItem.name ?? wlItem.ticker,
            sector:       wlItem.sector ?? 'Other',
            weight:       suggestion.suggestedWeight ?? 5,
            fundamentals: ratioMap.get(wlItem.ticker) ?? null,
            source:       'watchlist',
          }, totalValue))
        }
      } else if (suggestion.type === 'remove' && suggestion.ticker) {
        setSimHoldings((prev) => markRemoved(prev, suggestion.ticker!, totalValue))
      } else if (suggestion.type === 'rebalance') {
        setSimHoldings((prev) => normalizeWeights(prev, totalValue))
      }
    },
    [setSimHoldings, watchlistItems, ratioMap, totalValue],
  )

  const applyOptimizedWeights = useCallback(
    (weights: Record<string, number>) => {
      setSimHoldings((prev) => {
        let updated = prev
        for (const holding of prev) {
          if (holding.action === 'remove') continue
          const ticker = holding.ticker
          const wFrac =
            weights[ticker] ??
            weights[ticker.replace(/\.(NS|BO|BSE)$/i, '')] ??
            0
          updated = setHoldingWeight(updated, ticker, wFrac * 100, totalValue)
        }
        return updated
      })
    },
    [setSimHoldings, totalValue],
  )

  return {
    baseScenario,
    simScenario,
    delta,
    suggestions,
    totalSimWeight,
    isModified,
    watchlistItems,
    portfolioTickers,
    readiness,
    canSimulate,
    blockingReason,
    warnings,
    targetWeightState,
    isWeightValid,
    weightDrift,
    dataQuality,
    addStock,
    addNewStock,
    addFromWatchlist,
    removeStock,
    undoRemove,
    setWeight,
    normalize,
    reset,
    applyFromSuggestion,
    applyOptimizedWeights,
    loading,
    error,
  }
}
