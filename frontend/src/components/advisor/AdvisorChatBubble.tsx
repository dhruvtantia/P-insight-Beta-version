/**
 * AdvisorChatBubble — renders a single chat message
 * ---------------------------------------------------
 * role === 'user'    → right-aligned text bubble
 * role === 'advisor' → left-aligned AdvisorResponseCard
 *
 * Also exports ThinkingBubble for the "advisor is thinking" animation.
 */

'use client'

import { Zap, Bot, Clock } from 'lucide-react'
import { AdvisorResponseCard }  from './AdvisorResponseCard'
import type { ChatMessage }     from '@/hooks/useAdvisor'

// ─── Timestamp helper ─────────────────────────────────────────────────────────

function relTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

// ─── Thinking animation ───────────────────────────────────────────────────────

export function ThinkingBubble() {
  return (
    <div className="flex items-end gap-2 max-w-[85%]">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full
                      bg-indigo-600 text-white text-[10px] font-bold select-none">
        A
      </div>
      <div className="rounded-2xl rounded-bl-sm border border-slate-100 bg-white
                      px-4 py-3 shadow-sm">
        <div className="flex items-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="inline-block h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface AdvisorChatBubbleProps {
  message:     ChatMessage
  onFollowUp?: (question: string) => void
}

export function AdvisorChatBubble({ message, onFollowUp }: AdvisorChatBubbleProps) {

  // ── User message ────────────────────────────────────────────────────────────
  if (message.role === 'user') {
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="max-w-[75%] rounded-2xl rounded-br-sm bg-indigo-600 px-4 py-2.5 shadow-sm">
          <p className="text-sm text-white leading-relaxed">{message.content}</p>
        </div>
        <span className="text-[10px] text-slate-400 mr-1">{relTime(message.timestamp)}</span>
      </div>
    )
  }

  // ── Advisor response ────────────────────────────────────────────────────────
  return (
    <div className="flex items-start gap-2.5 max-w-[90%]">
      {/* Avatar */}
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full
                      bg-indigo-600 text-white text-[10px] font-bold mt-1 select-none">
        A
      </div>
      <div className="flex-1 min-w-0 space-y-1">
        <AdvisorResponseCard
          response={message.content}
          onFollowUp={onFollowUp}
        />
        {/* Timestamp + source + latency */}
        <div className="flex items-center gap-2 pl-1">
          <span className="text-[10px] text-slate-400">{relTime(message.timestamp)}</span>
          {message.source === 'ai' && (
            <span className="inline-flex items-center gap-1 text-[10px] text-violet-600">
              <Zap className="h-2.5 w-2.5" />
              {message.provider === 'claude' ? 'Claude' : message.provider ?? 'AI'}
            </span>
          )}
          {message.source === 'rule-based' && (
            <span className="inline-flex items-center gap-1 text-[10px] text-slate-400">
              <Bot className="h-2.5 w-2.5" />
              Rule-based
            </span>
          )}
          {message.source === 'ai' && message.latency_ms && message.latency_ms > 0 && (
            <span className="inline-flex items-center gap-0.5 text-[10px] text-slate-400">
              <Clock className="h-2.5 w-2.5" />
              {message.latency_ms < 1000
                ? `${message.latency_ms}ms`
                : `${(message.latency_ms / 1000).toFixed(1)}s`}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
