'use client'

import { useState, useRef, useEffect } from 'react'
import { Bot, Send, User } from 'lucide-react'
import { aiChatApi } from '@/services/api'
import { cn } from '@/lib/utils'
import type { ChatMessage } from '@/types'

const SUGGESTED = [
  'What is my portfolio\'s overall P&L?',
  'Which sector am I most concentrated in?',
  'What is the Sharpe Ratio of my portfolio?',
  'Which stock has the highest weight?',
]

export default function AIChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return

    const userMsg: ChatMessage = { role: 'user', content: text, timestamp: new Date().toISOString() }
    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setLoading(true)

    try {
      const res = await aiChatApi.sendMessage(text)
      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: res.reply,
        timestamp: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, assistantMsg])
    } catch (err) {
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: 'Failed to reach the AI service. Make sure the backend is running.',
        timestamp: new Date().toISOString(),
      }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] max-w-3xl">
      {/* Header */}
      <div className="card p-4 mb-4 flex items-center gap-3">
        <div className="h-8 w-8 rounded-lg bg-indigo-100 flex items-center justify-center">
          <Bot className="h-4 w-4 text-indigo-600" />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-800">AI Portfolio Advisor</p>
          <p className="text-xs text-amber-600">Phase 2 — Scaffold mode active</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 mb-4">
        {messages.length === 0 && (
          <div className="text-center py-8">
            <Bot className="h-12 w-12 text-slate-300 mx-auto mb-4" />
            <p className="text-sm font-semibold text-slate-500">Ask anything about your portfolio</p>
            <p className="text-xs text-slate-400 mb-6">AI responses require an API key (Phase 2)</p>
            <div className="flex flex-wrap gap-2 justify-center">
              {SUGGESTED.map((s) => (
                <button key={s} onClick={() => sendMessage(s)}
                  className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs text-indigo-700 hover:bg-indigo-100 transition-colors text-left">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={cn('flex gap-3', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
            {msg.role === 'assistant' && (
              <div className="h-7 w-7 rounded-full bg-indigo-100 flex items-center justify-center shrink-0 mt-0.5">
                <Bot className="h-3.5 w-3.5 text-indigo-600" />
              </div>
            )}
            <div className={cn(
              'max-w-[80%] rounded-xl px-4 py-3 text-sm leading-relaxed',
              msg.role === 'user'
                ? 'bg-indigo-600 text-white rounded-br-sm'
                : 'bg-white border border-slate-200 text-slate-800 rounded-bl-sm'
            )}>
              {msg.content}
            </div>
            {msg.role === 'user' && (
              <div className="h-7 w-7 rounded-full bg-slate-200 flex items-center justify-center shrink-0 mt-0.5">
                <User className="h-3.5 w-3.5 text-slate-600" />
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex gap-3">
            <div className="h-7 w-7 rounded-full bg-indigo-100 flex items-center justify-center">
              <Bot className="h-3.5 w-3.5 text-indigo-600 animate-pulse" />
            </div>
            <div className="card px-4 py-3">
              <div className="flex gap-1">
                {[0, 150, 300].map((d) => (
                  <div key={d} className="h-2 w-2 rounded-full bg-slate-300 animate-bounce" style={{ animationDelay: `${d}ms` }} />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="card p-3 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage(input)}
          placeholder="Ask about your portfolio..."
          className="flex-1 rounded-md px-3 py-2 text-sm border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          disabled={loading}
        />
        <button
          onClick={() => sendMessage(input)}
          disabled={loading || !input.trim()}
          className="flex h-9 w-9 items-center justify-center rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 transition-colors"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
