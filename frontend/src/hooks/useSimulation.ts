/**
 * useSimulation — manages simulation state and exposes all mutation actions
 * -------------------------------------------------------------------------
 *
 * Data pipeline:
 *   usePortfolio()        → holdings (base), sectors (base)
 *   useFundamentals()     → ratios (for fundamentals merge)
 *   useWatchlist()        → watchlistItems (for add-from-watchlist + suggestions)
 *
 * State:
 *   simHoldings[]         — the user's current simulated holding list
 *                           (starts as a copy of base holdings; mutated by user actions)
 *
 * Derived (via useMemo):
 *   baseScenario          — computed once from real portfolio data
 *   simScenario           — recomputed from simHoldings on every change
 *   delta                 — before/after metric diff
 *   suggestions           — rule-based rebalancing suggestions
 *
 * Actions:
 *   addStock()            — add a new holding to simHoldings
 *   removeStock()         — mark a holding as 'remove'
 *   undoRemove()          — restore a removed holding
 *   setWeight()           — change a holding's weight %
 *   normalize()           — scale all weights to sum to 100
 *   reset()               — restore simHoldings to the base portfolio
 *   addFromWatchlist()    — add a watchlist item to the sim (pre-fills name/sector)
 */

'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import { usePortfolio }         from '@/hooks/usePortfolio'
import { useFundamentals }      from '@/hooks/useFundamentals'
import { useWatchlist }         from '@/hooks/useWatchlist'
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

  // ── Derived base values ──────────────────────────────────────────────────────
  const totalValue = useMemo(
    () => baseHoldings.reduce((s, h) => s + (h.market_value ?? 0), 0) || 1_000_000,
    [baseHoldings],
  )

  const ratioMap = useMemo(
    () => new Map<string, FinancialRatio>(ratios.map((r) => [r.ticker, r])),
    [ratios],
  )

  // ── Sim holdings state ───────────────────────────────────────────────────────
  const [simHoldings, setSimHoldings] = useState<SimulatedHolding[]>([])

  // Initialise / reset from base whenever base holdings load/change
  const initFromBase = useCallback(() => {
    if (baseHoldings.length === 0) return
    setSimHoldings(initSimulatedHoldings(baseHoldings, ratioMap, totalValue))
  }, [baseHoldings, ratioMap, totalValue])

  useEffect(() => {
    if (baseHoldings.length > 0 && simHoldings.length === 0) {
      initFromBase()
    }
  }, [baseHoldings, initFromBase, simHoldings.length])

  // ── Base scenario (stable — recomputed only when base holdings change) ────────
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

  // ── Rebalance suggestions (from simScenario, not base) ─────────────────────
  const suggestions = useMemo<RebalanceSuggestion[]>(() => {
    if (!simScenario) return []
    return generateRebalanceSuggestions(simScenario, watchlistItems)
  }, [simScenario, watchlistItems])

  // ── Is modified? ─────────────────────────────────────────────────────────────
  const isModified = useMemo(() => {
    return simHoldings.some((h) => h.action !== 'hold')
  }, [simHoldings])

  const totalSimWeight = useMemo(
    () => simHoldings.filter((h) => h.action !== 'remove').reduce((s, h) => s + h.weight, 0),
    [simHoldings],
  )

  const portfolioTickers = useMemo(
    () => new Set(baseHoldings.map((h) => h.ticker.toUpperCase())),
    [baseHoldings],
  )

  // ── Actions ──────────────────────────────────────────────────────────────────

  const addStock = useCallback(
    (holding: Omit<SimulatedHolding, 'action' | 'original_weight' | 'market_value'>) => {
      setSimHoldings((prev) => addHolding(prev, holding, totalValue))
    },
    [totalValue],
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
    [ratioMap, totalValue],
  )

  const removeStock = useCallback(
    (ticker: string) => {
      setSimHoldings((prev) => markRemoved(prev, ticker, totalValue))
    },
    [totalValue],
  )

  const undoRemove = useCallback(
    (ticker: string) => {
      setSimHoldings((prev) => undoRemoveUtil(prev, ticker, totalValue))
    },
    [totalValue],
  )

  const setWeight = useCallback(
    (ticker: string, weight: number) => {
      setSimHoldings((prev) => setHoldingWeight(prev, ticker, weight, totalValue))
    },
    [totalValue],
  )

  const normalize = useCallback(() => {
    setSimHoldings((prev) => normalizeWeights(prev, totalValue))
  }, [totalValue])

  const reset = useCallback(() => {
    initFromBase()
  }, [initFromBase])

  /**
   * Apply a suggestion directly:
   *   trim        → setWeight to suggestedWeight
   *   add_from_watchlist → addFromWatchlist if ticker found in watchlist
   *   remove      → markRemoved
   *   rebalance   → normalize (best approximation)
   */
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
    [watchlistItems, ratioMap, totalValue],
  )

  /**
   * Apply optimized portfolio weights from the optimizer engine.
   * `weights` is a Record<ticker, fraction> where fractions are 0.0–1.0.
   * For each active holding, the weight is updated to optimizer_weight × 100.
   * Tickers in the portfolio but absent from `weights` are set to 0.
   */
  const applyOptimizedWeights = useCallback(
    (weights: Record<string, number>) => {
      setSimHoldings((prev) => {
        let updated = prev
        for (const holding of prev) {
          if (holding.action === 'remove') continue
          const ticker = holding.ticker
          // Match against full ticker or stripped suffix (e.g. RELIANCE.NS → RELIANCE)
          const wFrac =
            weights[ticker] ??
            weights[ticker.replace(/\.(NS|BO|BSE)$/i, '')] ??
            0
          updated = setHoldingWeight(updated, ticker, wFrac * 100, totalValue)
        }
        return updated
      })
    },
    [totalValue],
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
