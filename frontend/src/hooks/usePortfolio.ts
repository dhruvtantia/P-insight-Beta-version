/**
 * usePortfolio Hook — public API for all portfolio consumers
 * -----------------------------------------------------------
 * Thin wrapper over PortfolioContext. Pages and components import this hook;
 * they do NOT import PortfolioContext directly.
 *
 * The fetch logic lives in PortfolioContext (mounted once in AppShell).
 * This hook delegates to context — no local state, no independent fetch.
 *
 * Why this pattern:
 *   Before: every page calling usePortfolio() triggered its own fetch on mount.
 *           Dashboard + Risk page each independently called computeRiskSnapshot()
 *           client-side from the same data.
 *   After:  one fetch per mode change, shared across all pages.
 *           riskSnapshot comes from the backend — zero client-side computation.
 *
 * Usage (unchanged from caller perspective):
 *   const { holdings, summary, sectors, riskSnapshot, loading, error, refetch }
 *     = usePortfolio()
 */

'use client'

import { usePortfolioContext }  from '@/context/PortfolioContext'
import type {
  Holding,
  PortfolioSummary,
  SectorAllocation,
  PortfolioInsight,
  RiskSnapshot,
  FundamentalsSummary,
  PortfolioBundleMeta,
} from '@/types'

export interface UsePortfolioReturn {
  holdings:            Holding[]
  summary:             PortfolioSummary | null
  sectors:             SectorAllocation[]
  riskSnapshot:        RiskSnapshot | null         // backend-computed (was client-side useMemo)
  fundamentalsSummary: FundamentalsSummary | null  // availability metadata for dashboard
  meta:                PortfolioBundleMeta | null  // provenance: mode, portfolio_id, as_of
  insights:            PortfolioInsight[]
  loading:             boolean
  error:               string | null
  refetch:             () => void
}

export function usePortfolio(): UsePortfolioReturn {
  return usePortfolioContext()
}
