/**
 * useAdvisor — AI-aware portfolio advisor hook
 * ---------------------------------------------
 *
 * Data pipeline (unchanged from rule-based version):
 *   usePortfolio  → holdings, sectors, summary
 *   useFundamentals(holdings)  → enrichedHoldings, weightedMetrics
 *   useWatchlist  → watchlistItems
 *   computeRiskSnapshot  → riskSnapshot (derived, no API)
 *
 * AI integration (new):
 *   On mount → GET /advisor/status → sets aiEnabled + provider name
 *   sendQuery:
 *     If AI available  → POST /advisor/ask → parse AIAdvisorResponse
 *                        → convert to AdvisorResponse for existing UI
 *     If AI unavailable or fallback_used → local routeQuery() (unchanged)
 *
 * Zero UI changes required: AdvisorChatBubble + advisor/page.tsx consume
 * the same AdvisorResponse type regardless of AI vs rule-based path.
 *
 * New public fields:
 *   aiEnabled    — true when an LLM provider is configured
 *   provider     — 'claude' | 'openai' | 'none'
 *   lastLatencyMs — latency of the last AI call (0 for rule-based)
 */

'use client'

import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { usePortfolio }        from '@/hooks/usePortfolio'
import { useFundamentals }     from '@/hooks/useFundamentals'
import { useWatchlist }        from '@/hooks/useWatchlist'
import { useOptimization }     from '@/hooks/useOptimization'
import { usePortfolios }       from '@/hooks/usePortfolios'
import { computeRiskSnapshot } from '@/lib/risk'
import { advisorApi }          from '@/services/api'
import {
  routeQuery,
  getSuggestedQuestions,
  type AdvisorResponse,
  type AdvisorEngineInput,
} from '@/lib/advisor'
import type { AdvisorProviderName } from '@/types'

// ─── Message types ────────────────────────────────────────────────────────────

export interface UserChatMessage {
  role:      'user'
  content:   string
  timestamp: string
}

export interface AdvisorChatMessage {
  role:        'advisor'
  content:     AdvisorResponse
  timestamp:   string
  /** Which path generated this response */
  source:      'ai' | 'rule-based'
  latency_ms?: number
  provider?:   string
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
  ready:              boolean
  portfolioLoading:   boolean
  portfolioError:     string | null
  /** true when an LLM API key is configured on the backend */
  aiEnabled:          boolean
  /** which provider is active: 'claude' | 'openai' | 'none' */
  provider:           AdvisorProviderName
  /** latency of the last AI call in ms (0 for rule-based) */
  lastLatencyMs:      number
}

// ─── AI response → AdvisorResponse adapter ───────────────────────────────────

import type { AIAdvisorResponse } from '@/types'

function aiToAdvisorResponse(ai: AIAdvisorResponse, query: string): AdvisorResponse {
  /**
   * Convert the flat AIAdvisorResponse (summary + string arrays) into the
   * structured AdvisorResponse used by AdvisorChatBubble.
   */
  const cat = (ai.category ?? 'general') as AdvisorResponse['category']

  const items: AdvisorResponse['items'] = [
    ...ai.insights.map((text) => ({
      type:        'insight'  as const,
      category:    cat,
      title:       text.length > 90 ? text.slice(0, 90) + '…' : text,
      explanation: text,
      confidence:  'high'     as const,
    })),
    ...ai.recommendations.map((text) => ({
      type:      'suggestion' as const,
      category:  cat,
      action:    text.length > 90 ? text.slice(0, 90) + '…' : text,
      rationale: text,
      priority:  'medium'    as const,
    })),
  ]

  return {
    query,
    category:  cat,
    summary:   ai.summary || 'No summary available.',
    items,
    followUps: ai.follow_ups ?? [],
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAdvisor(): UseAdvisorResult {
  // ── Data sources ────────────────────────────────────────────────────────────
  const { holdings, sectors, summary, loading: portfolioLoading, error: portfolioError } = usePortfolio()
  const { enrichedHoldings, weightedMetrics } = useFundamentals(holdings)
  const { items: watchlistItems }             = useWatchlist()
  const { data: optData }                     = useOptimization()
  const { activePortfolioId }                 = usePortfolios()

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
      minVariance:      mv  ? { volatility: mv.volatility, sharpeRatio: mv.sharpe_ratio } : null,
      currentSharpe:    cur ? cur.sharpe_ratio : null,
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

  // ── AI provider state ─────────────────────────────────────────────────────
  const [aiEnabled,     setAiEnabled]     = useState(false)
  const [provider,      setProvider]      = useState<AdvisorProviderName>('none')
  const [lastLatencyMs, setLastLatencyMs] = useState(0)
  const statusFetched = useRef(false)

  useEffect(() => {
    if (statusFetched.current) return
    statusFetched.current = true

    advisorApi.status()
      .then((s) => {
        setAiEnabled(s.available)
        setProvider(s.provider)
      })
      .catch(() => {
        // Backend unreachable or error — silently stay rule-based
        setAiEnabled(false)
        setProvider('none')
      })
  }, [])

  // ── Chat state ──────────────────────────────────────────────────────────────
  const [messages,   setMessages]   = useState<ChatMessage[]>([])
  const [isThinking, setIsThinking] = useState(false)

  // ── Send query ──────────────────────────────────────────────────────────────
  const sendQuery = useCallback(
    async (query: string) => {
      if (!query.trim() || isThinking) return

      const userMsg: UserChatMessage = {
        role:      'user',
        content:   query.trim(),
        timestamp: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, userMsg])
      setIsThinking(true)

      const appendAdvisor = (
        response:   AdvisorResponse,
        source:     'ai' | 'rule-based',
        latencyMs?: number,
        prov?:      string,
      ) => {
        const msg: AdvisorChatMessage = {
          role:       'advisor',
          content:    response,
          timestamp:  new Date().toISOString(),
          source,
          latency_ms: latencyMs,
          provider:   prov,
        }
        setMessages((prev) => [...prev, msg])
      }

      try {
        if (aiEnabled) {
          // ── AI path ────────────────────────────────────────────────────────
          const aiResp = await advisorApi.ask(
            query,
            activePortfolioId ?? null,
            true,   // include_snapshots
            false,  // include_optimization (expensive — skip unless query demands it)
          )

          if (!aiResp.fallback_used && aiResp.summary) {
            setLastLatencyMs(aiResp.latency_ms)
            appendAdvisor(
              aiToAdvisorResponse(aiResp, query),
              'ai',
              aiResp.latency_ms,
              aiResp.provider,
            )
            setIsThinking(false)
            return
          }
          // fallback_used=true or empty summary → fall through to rule-based
        }

        // ── Rule-based path (always available, zero dependencies) ─────────────
        await new Promise<void>((res) => setTimeout(res, 380))
        appendAdvisor(routeQuery(query, engineInput), 'rule-based')
      } catch (err) {
        // Any unexpected error → rule-based safety net
        console.warn('[useAdvisor] AI path failed, falling back:', err)
        appendAdvisor(routeQuery(query, engineInput), 'rule-based')
      } finally {
        setIsThinking(false)
      }
    },
    [aiEnabled, activePortfolioId, engineInput, isThinking],
  )

  const clearMessages = useCallback(() => setMessages([]), [])

  // ── Suggested questions ──────────────────────────────────────────────────────
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
    aiEnabled,
    provider,
    lastLatencyMs,
  }
}
