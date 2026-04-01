/**
 * Advisor Page — /advisor
 * -----------------------
 * AI-powered portfolio advisor chat interface.
 *
 * Layout:
 *   Left sidebar   — portfolio context panel (key stats + how it works)
 *   Main area      — chat: messages + input + suggested question chips
 *
 * Features:
 *   • AI-powered responses via Claude or OpenAI (when API key configured)
 *   • Rule-based fallback when AI provider is unavailable
 *   • Provider badge showing Claude / Rule-based mode
 *   • Response latency display on AI messages
 *   • Suggested question chips refreshed after each response
 *   • Structured response cards with follow-up chips
 *   • URL param ?q= for deep-linking from dashboard/changes pages
 *   • Clear chat button
 */

'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useSearchParams }          from 'next/navigation'
import Link                         from 'next/link'
import {
  Send,
  MessageCircle,
  RefreshCw,
  PieChart,
  TrendingUp,
  Wallet,
  Activity,
  Sparkles,
  Cpu,
  Zap,
  Bot,
  Clock,
} from 'lucide-react'
import { useAdvisor }               from '@/hooks/useAdvisor'
import { AdvisorChatBubble, ThinkingBubble } from '@/components/advisor/AdvisorChatBubble'
import { cn }                       from '@/lib/utils'
import type { AdvisorProviderName } from '@/types'

// ─── Provider badge ───────────────────────────────────────────────────────────

function ProviderBadge({ provider, aiEnabled }: { provider: AdvisorProviderName; aiEnabled: boolean }) {
  if (aiEnabled && provider === 'claude') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-700">
        <Zap className="h-3 w-3" /> Claude AI
      </span>
    )
  }
  if (aiEnabled && provider === 'openai') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
        <Zap className="h-3 w-3" /> OpenAI
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
      <Bot className="h-3 w-3" /> Rule-based
    </span>
  )
}

// ─── Context panel (left sidebar on lg+) ─────────────────────────────────────

function ContextStat({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ElementType
  label: string
  value: string
  sub?: string
}) {
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-slate-100 last:border-0">
      <Icon className="h-4 w-4 text-slate-400 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-slate-400 uppercase tracking-wide">{label}</p>
        <p className="text-sm font-semibold text-slate-800 truncate">{value}</p>
        {sub && <p className="text-[11px] text-slate-400">{sub}</p>}
      </div>
    </div>
  )
}

function ContextPanel({
  engineInput,
  loading,
  aiEnabled,
  provider,
}: {
  engineInput: ReturnType<typeof useAdvisor>['engineInput']
  loading:     boolean
  aiEnabled:   boolean
  provider:    AdvisorProviderName
}) {
  const { holdings, sectors, weightedMetrics, riskSnapshot } = engineInput

  if (loading) {
    return (
      <div className="animate-pulse space-y-3 p-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3 py-2.5">
            <div className="h-4 w-4 rounded bg-slate-200 shrink-0" />
            <div className="space-y-1 flex-1">
              <div className="h-2 w-16 rounded bg-slate-200" />
              <div className="h-3 w-24 rounded bg-slate-100" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  const totalValue = holdings.reduce((s, h) => s + (h.market_value ?? 0), 0)

  return (
    <div className="p-4 space-y-0">
      <ContextStat
        icon={Cpu}
        label="Holdings"
        value={`${holdings.length} stocks`}
        sub={`${sectors.length} sectors`}
      />
      <ContextStat
        icon={Activity}
        label="Risk Profile"
        value={riskSnapshot?.risk_profile.replace(/_/g, ' ') ?? '—'}
        sub={riskSnapshot ? `HHI: ${riskSnapshot.hhi.toFixed(3)}` : undefined}
      />
      {weightedMetrics?.wtd_pe !== null && (
        <ContextStat
          icon={TrendingUp}
          label="Wtd P/E"
          value={weightedMetrics?.wtd_pe !== null && weightedMetrics?.wtd_pe !== undefined
            ? `${weightedMetrics.wtd_pe.toFixed(1)}×`
            : '—'
          }
          sub="vs Nifty ~21×"
        />
      )}
      {weightedMetrics?.wtd_roe !== null && (
        <ContextStat
          icon={PieChart}
          label="Wtd ROE"
          value={weightedMetrics?.wtd_roe !== null && weightedMetrics?.wtd_roe !== undefined
            ? `${weightedMetrics.wtd_roe.toFixed(1)}%`
            : '—'
          }
        />
      )}
      {weightedMetrics?.wtd_div_yield !== null && (
        <ContextStat
          icon={Wallet}
          label="Div Yield"
          value={weightedMetrics?.wtd_div_yield !== null && weightedMetrics?.wtd_div_yield !== undefined
            ? `${weightedMetrics.wtd_div_yield.toFixed(2)}%`
            : '—'
          }
          sub="weighted avg"
        />
      )}

      {/* Provider + how it works */}
      <div className="mt-4 rounded-lg bg-slate-50 border border-slate-100 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Engine
          </p>
          <ProviderBadge provider={provider} aiEnabled={aiEnabled} />
        </div>
        {aiEnabled ? (
          <p className="text-[11px] text-slate-500 leading-relaxed">
            Responses are generated by {provider === 'claude' ? 'Anthropic Claude' : 'OpenAI'} using
            live portfolio data — holdings, sectors, risk metrics, and snapshot history.
          </p>
        ) : (
          <p className="text-[11px] text-slate-500 leading-relaxed">
            Rule-based analysis across 7 domains: concentration, diversification, valuation,
            income, watchlist, performance, and peer comparison.
            Set <code className="text-[10px] bg-slate-100 px-0.5 rounded">ANTHROPIC_API_KEY</code> in
            {' '}<code className="text-[10px] bg-slate-100 px-0.5 rounded">.env</code> to enable AI.
          </p>
        )}
      </div>
    </div>
  )
}

// ─── Chat input ───────────────────────────────────────────────────────────────

function ChatInput({
  onSend,
  disabled,
}: {
  onSend: (q: string) => void
  disabled: boolean
}) {
  const [value, setValue] = useState('')

  const handleSubmit = () => {
    if (!value.trim() || disabled) return
    onSend(value.trim())
    setValue('')
  }

  return (
    <div className="flex gap-2">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSubmit()}
        placeholder="Ask about your portfolio…"
        disabled={disabled}
        className={cn(
          'flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm',
          'text-slate-800 placeholder-slate-400',
          'focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          'transition-colors',
        )}
      />
      <button
        onClick={handleSubmit}
        disabled={disabled || !value.trim()}
        className={cn(
          'flex h-11 w-11 items-center justify-center rounded-xl',
          'bg-indigo-600 text-white shadow-sm',
          'hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed',
          'transition-colors',
        )}
        aria-label="Send message"
      >
        <Send className="h-4 w-4" />
      </button>
    </div>
  )
}

// ─── Suggested question chips ─────────────────────────────────────────────────

function SuggestedChips({
  questions,
  onSelect,
  disabled,
}: {
  questions: string[]
  onSelect: (q: string) => void
  disabled: boolean
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {questions.map((q) => (
        <button
          key={q}
          onClick={() => onSelect(q)}
          disabled={disabled}
          className={cn(
            'rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px]',
            'text-slate-600 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-700',
            'disabled:opacity-40 disabled:cursor-not-allowed',
            'transition-colors',
          )}
        >
          {q}
        </button>
      ))}
    </div>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({
  questions,
  onSelect,
  ready,
}: {
  questions: string[]
  onSelect: (q: string) => void
  ready: boolean
}) {
  return (
    <div className="flex flex-col items-center justify-center flex-1 px-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-100 mb-4">
        <MessageCircle className="h-7 w-7 text-indigo-600" />
      </div>
      <h2 className="text-base font-semibold text-slate-800 mb-1">Ask about your portfolio</h2>
      <p className="text-sm text-slate-500 mb-6 max-w-xs">
        {ready
          ? 'Your portfolio is loaded and ready for analysis. Try one of the suggested questions below.'
          : 'Loading your portfolio data…'
        }
      </p>
      {ready && (
        <SuggestedChips questions={questions.slice(0, 6)} onSelect={onSelect} disabled={false} />
      )}
    </div>
  )
}

// ─── Page inner (reads search params) ─────────────────────────────────────────

function AdvisorPageInner() {
  const searchParams = useSearchParams()
  const deepLinkQuery = searchParams.get('q')

  const {
    messages,
    isThinking,
    sendQuery,
    clearMessages,
    suggestedQuestions,
    engineInput,
    ready,
    portfolioLoading,
    portfolioError,
    aiEnabled,
    provider,
  } = useAdvisor()

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const initialQuerySent = useRef(false)

  // Deep-link: if URL has ?q=, fire it once when portfolio is ready
  useEffect(() => {
    if (ready && deepLinkQuery && !initialQuerySent.current) {
      initialQuerySent.current = true
      sendQuery(deepLinkQuery)
    }
  }, [ready, deepLinkQuery, sendQuery])

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isThinking])

  const hasMessages = messages.length > 0

  return (
    <div className="flex h-[calc(100vh-4rem)] gap-5 max-w-[1400px]">

      {/* ── Left context panel (hidden on sm, shown md+) ──────────────────── */}
      <aside className="hidden md:flex flex-col w-64 shrink-0">
        <div className="card flex-1 overflow-y-auto">
          <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100">
            <Sparkles className="h-4 w-4 text-indigo-500" />
            <h2 className="text-sm font-semibold text-slate-800">Portfolio Context</h2>
          </div>
          <ContextPanel
            engineInput={engineInput}
            loading={portfolioLoading}
            aiEnabled={aiEnabled}
            provider={provider}
          />
        </div>
      </aside>

      {/* ── Main chat area ─────────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-slate-900">Portfolio Copilot</h1>
                <ProviderBadge provider={provider} aiEnabled={aiEnabled} />
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {aiEnabled
                  ? `Powered by ${provider === 'claude' ? 'Claude' : 'OpenAI'} · context-aware portfolio analysis`
                  : 'Rule-based analysis · set ANTHROPIC_API_KEY to enable AI'
                }
              </p>
            </div>
          </div>
          {hasMessages && (
            <button
              onClick={clearMessages}
              className="flex items-center gap-1.5 rounded-md border border-slate-200
                         bg-white px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-50
                         transition-colors"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Clear chat
            </button>
          )}
        </div>

        {/* Error */}
        {portfolioError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 mb-4 text-sm text-red-600">
            Could not load portfolio: {portfolioError}.{' '}
            <Link href="/dashboard" className="underline">Go to dashboard</Link> to troubleshoot.
          </div>
        )}

        {/* Messages */}
        <div className="card flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
          {!hasMessages ? (
            <EmptyState
              questions={suggestedQuestions}
              onSelect={sendQuery}
              ready={ready}
            />
          ) : (
            <>
              {messages.map((msg, i) => (
                <AdvisorChatBubble
                  key={i}
                  message={msg}
                  onFollowUp={sendQuery}
                />
              ))}
              {isThinking && <ThinkingBubble />}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Suggested chips (shown when conversation is active) */}
        {hasMessages && !isThinking && (
          <div className="mt-3">
            <SuggestedChips
              questions={suggestedQuestions.slice(0, 5)}
              onSelect={sendQuery}
              disabled={isThinking}
            />
          </div>
        )}

        {/* Input */}
        <div className="mt-3">
          <ChatInput onSend={sendQuery} disabled={!ready || isThinking} />
          <p className="mt-2 text-[10px] text-slate-400 text-center">
            {aiEnabled
              ? `AI-generated analysis — for informational purposes only, not financial advice.`
              : `Rule-based analysis — for informational purposes only, not financial advice.`
            }
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── Page export (wraps inner in Suspense for useSearchParams) ─────────────────

export default function AdvisorPage() {
  return (
    <Suspense fallback={
      <div className="flex h-[calc(100vh-4rem)] items-center justify-center">
        <div className="flex items-center gap-2 text-slate-400">
          <RefreshCw className="h-4 w-4 animate-spin" />
          <span className="text-sm">Loading advisor…</span>
        </div>
      </div>
    }>
      <AdvisorPageInner />
    </Suspense>
  )
}
