/**
 * useAdvisor — aggregates all portfolio data and manages advisor chat state
 * --------------------------------------------------------------------------
 *
 * Data pipeline:
 *   usePortfolio  → holdings, sectors, summary
 *   useFundamentals(holdings)  → enrichedHoldings, weightedMetrics
 *   useWatchlist  → watchlistItems
 *   computeRiskSnapshot  → riskSnapshot (derived, no API)
 *
 * Chat state:
 *   messages[]  — AdvisorChatMessage[] (user text | advisor AdvisorResponse)
 *   isThinking  — brief 400ms simulated "thinking" for better UX
 *   sendQuery() — adds user message, calls routeQuery(), appends response
 *
 * Future AI integration:
 *   Replace routeQuery(query, engineInput) with:
 *     await claudeApi.ask(query, engineInput)   ← same AdvisorResponse type
 *   Zero changes to this hook or any UI component.
 */

'use client'

import { useState, useCallback, useMemo } from 'react'
import { usePortfolio }              from '@/hooks/usePortfolio'
import { useFundamentals }           from '@/hooks/useFundamentals'
import { useWatchlist }              from '@/hooks/useWatchlist'
import { useOptimization }           from '@/hooks/useOptimization'
import { computeRiskSnapshot }       from '@/lib/risk'
import {
  routeQuery,
  getSuggestedQuestions,
  type AdvisorResponse,
  type AdvisorEngineInput,
} from '@/lib/advisor'

// ─── Message types ────────────────────────────────────────────────────────────

export interface UserChatMessage {
  role:      'user'
  content:   string
  timestamp: string
}

export interface AdvisorChatMessage {
  role:      'advisor'
  content:   AdvisorResponse
  timestamp: string
}

export type ChatMessage = UserChatMessage | AdvisorChatMessage

// ─── Hook result ──────────────────────────────────────────────────────────────

interface UseAdvisorResult {
  messages:           ChatMessage[]
  isThinking:         boolean
  sendQuery:          (query: string) => void
  clearMessages:      () => void
  suggestedQuestions: string[]
  engineInput:        AdvisorEngineInput
  ready:              boolean   // false while portfolio is still loading
  portfolioLoading:   boolean
  portfolioError:     string | null
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAdvisor(): UseAdvisorResult {
  // ── Data sources ────────────────────────────────────────────────────────────
  const { holdings, sectors, summary, loading: portfolioLoading, error: portfolioError } = usePortfolio()
  const { enrichedHoldings, weightedMetrics }  = useFundamentals(holdings)
  const { items: watchlistItems }               = useWatchlist()
  const { data: optData }                       = useOptimization()

  const riskSnapshot = useMemo(
    () => computeRiskSnapshot(holdings, sectors, summary),
    [holdings, sectors, summary],
  )

  const optimizationSummary = useMemo(() => {
    if (!optData?.max_sharpe) return null
    const ms  = optData.max_sharpe
    const mv  = optData.min_variance
    const cur = optData.current
    return {
      maxSharpe: {
        expectedReturn: ms.expected_return,
        volatility:     ms.volatility,
        sharpeRatio:    ms.sharpe_ratio,
        topWeights:     Object.entries(ms.weights)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 3)
          .map(([t, w]) => ({
            ticker: t.replace(/\.(NS|BO|BSE)$/i, ''),
            weight: +(w * 100).toFixed(1),
          })),
      },
      minVariance: mv ? { volatility: mv.volatility, sharpeRatio: mv.sharpe_ratio } : null,
      currentSharpe:    cur?.sharpe_ratio ?? null,
      rebalanceActions: optData.rebalance?.length ?? 0,
      period:           optData.meta?.period,
    }
  }, [optData])

  const engineInput: AdvisorEngineInput = useMemo(
    () => ({
      holdings,
      enrichedHoldings,
      sectors,
      weightedMetrics,
      riskSnapshot,
      watchlistItems,
      optimizationSummary,
    }),
    [holdings, enrichedHoldings, sectors, weightedMetrics, riskSnapshot, watchlistItems, optimizationSummary],
  )

  // ── Chat state ──────────────────────────────────────────────────────────────
  const [messages,    setMessages]    = useState<ChatMessage[]>([])
  const [isThinking,  setIsThinking]  = useState(false)

  // ── Send query ──────────────────────────────────────────────────────────────
  const sendQuery = useCallback(
    (query: string) => {
      if (!query.trim() || isThinking) return

      // Append user message immediately
      const userMsg: UserChatMessage = {
        role:      'user',
        content:   query.trim(),
        timestamp: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, userMsg])
      setIsThinking(true)

      // Brief artificial delay so the UI feels responsive rather than instant
      // Replace this setTimeout with: const response = await claudeApi.ask(...)
      setTimeout(() => {
        const response = routeQuery(query, engineInput)
        const advisorMsg: AdvisorChatMessage = {
          role:      'advisor',
          content:   response,
          timestamp: new Date().toISOString(),
        }
        setMessages((prev) => [...prev, advisorMsg])
        setIsThinking(false)
      }, 420)
    },
    [engineInput, isThinking],
  )

  const clearMessages = useCallback(() => setMessages([]), [])

  // ── Suggested questions (context-aware) ─────────────────────────────────────
  const suggestedQuestions = useMemo(
    () => getSuggestedQuestions(engineInput),
    [engineInput],
  )

  return {
    messages,
    isThinking,
    sendQuery,
    clearMessages,
    suggestedQuestions,
    engineInput,
    ready:          !portfolioLoading && holdings.length > 0,
    portfolioLoading,
    portfolioError,
  }
}
