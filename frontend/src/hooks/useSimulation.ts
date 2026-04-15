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

  // Actions
  addStock:         (holding: Omit<SimulatedHolding, 'action' | 'original_weight' | 'market_value'>) => void
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
  const { holdings: baseHoldings, sectors: baseSectors, summary, loading, error } = usePortfolio()
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
  const totalValue = useMemo(
    () => baseHoldings.reduce((s, h) => s + (h.market_value ?? 0), 0) || 1_000_000,
    [baseHoldings],
  )

  const ratioMap = useMemo(
    () => new Map<string, FinancialRatio>(ratios.map((r) => [r.ticker, r])),
    [ratios],
  )

  // ── Initialise from base portfolio ──────────────────────────────────────────
  const initFromBase = useCallback(() => {
    if (baseHoldings.length === 0) return
    const initial = initSimulatedHoldings(baseHoldings, ratioMap, totalValue)
    const store   = useSimulationStore.getState()
    store.setSimHoldings(initial)
    store.setPortfolioId(activePortfolioId)
    store.setHasHydrated(true)
  }, [baseHoldings, ratioMap, totalValue, activePortfolioId])

  /**
   * Initialisation logic:
   *   1. Base holdings not loaded yet → wait.
   *   2. Portfolio switched since last stored state → reinitialise.
   *   3. Already have persisted state for this portfolio → keep it (nav-persistence).
   *   4. First load (not yet hydrated) → initialise from base.
   */
  useEffect(() => {
    if (baseHoldings.length === 0 || loading) return

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
    hasHydrated,
    storedPortfolioId,
    activePortfolioId,
    simHoldings.length,
    initFromBase,
  ])

  // ── Base scenario (stable) ────────────────────────────────────────────────────
  const baseScenario = useMemo<PortfolioScenario | null>(() => {
    if (baseHoldings.length === 0) return null
    const baseSimHoldings = initSimulatedHoldings(baseHoldings, ratioMap, totalValue)
    return buildScenario('Current', baseSimHoldings, totalValue)
  }, [baseHoldings, ratioMap, totalValue])

  // ── Simulated scenario (recomputed on every simHoldings mutation) ─────────────
  const simScenario = useMemo<PortfolioScenario | null>(() => {
    if (simHoldings.length === 0) return null
    return buildScenario('Simulated', simHoldings, totalValue)
  }, [simHoldings, totalValue])

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

  const portfolioTickers = useMemo(
    () => new Set(baseHoldings.map((h) => h.ticker.toUpperCase())),
    [baseHoldings],
  )

  // ── Actions ───────────────────────────────────────────────────────────────────

  const addStock = useCallback(
    (holding: Omit<SimulatedHolding, 'action' | 'original_weight' | 'market_value'>) => {
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
