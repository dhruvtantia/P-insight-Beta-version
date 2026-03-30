/**
 * PortfolioRefreshPanel
 * ----------------------
 * Re-import workflow for uploaded portfolios.
 *
 * Embeds the full Upload Wizard steps inline (parse → map → preview → refresh):
 *   1. Drop a new CSV / Excel file
 *   2. (Optional) Review column mapping
 *   3. Preview data
 *   4. Confirm — calls POST /portfolios/{id}/refresh
 *      → auto-creates pre- and post-refresh snapshots
 *      → replaces holdings in place
 *
 * Architecture-ready for broker sync: swap step 1 for a broker auth flow
 * and step 4 for `portfolioMgmtApi.refresh(id, brokerData, mapping)`.
 */

'use client'

import React, { useState, useCallback } from 'react'
import {
  Upload, CheckCircle2, AlertCircle, ArrowRight,
  RotateCcw, RefreshCw, Camera, ChevronRight, X,
} from 'lucide-react'
import { UploadDropzone }                     from '@/components/upload/UploadDropzone'
import { ColumnMapper, type ColumnMappingState } from '@/components/upload/ColumnMapper'
import { PortfolioPreviewTable }              from '@/components/upload/PortfolioPreviewTable'
import { portfolioMgmtApi }                  from '@/services/api'
import { cn }                                from '@/lib/utils'
import type { PortfolioMeta } from '@/types'

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

// ─── Types ─────────────────────────────────────────────────────────────────────

type Step = 'drop' | 'mapping' | 'preview' | 'refreshing' | 'done' | 'error'

interface ParseResult {
  column_names:     string[]
  detected_mapping: ColumnMappingState
  ambiguous_fields: string[]
  high_confidence:  boolean
  preview_rows:     Array<Record<string, unknown>>
  row_count:        number
}

// ─── Step indicator ────────────────────────────────────────────────────────────

const STEPS = ['New file', 'Columns', 'Preview', 'Re-import'] as const

function StepIndicator({ current }: { current: Step }) {
  const idx = ({ drop: 0, mapping: 1, preview: 2, refreshing: 3, done: 3, error: 0 } as const)[current]
  return (
    <div className="flex items-center gap-0 mb-6">
      {STEPS.map((label, i) => {
        const done   = i < idx
        const active = i === idx
        return (
          <div key={label} className="flex items-center">
            <div className="flex items-center gap-1.5">
              <div className={cn(
                'flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold transition-colors',
                done   ? 'bg-emerald-500 text-white'
                  : active ? 'bg-indigo-600 text-white'
                  : 'bg-slate-100 text-slate-400',
              )}>
                {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
              </div>
              <span className={cn(
                'text-xs font-medium hidden sm:block',
                active ? 'text-slate-900' : done ? 'text-emerald-600' : 'text-slate-400',
              )}>
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <ChevronRight className="h-3.5 w-3.5 text-slate-300 mx-1.5 shrink-0" />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────

export interface PortfolioRefreshPanelProps {
  portfolio:   PortfolioMeta
  onSuccess?:  (updatedMeta: PortfolioMeta) => void
  onCancel?:   () => void
  className?:  string
}

const REQUIRED = ['ticker', 'name', 'quantity', 'average_cost']

export function PortfolioRefreshPanel({
  portfolio,
  onSuccess,
  onCancel,
  className,
}: PortfolioRefreshPanelProps): React.ReactElement {
  const [step,         setStep]         = useState<Step>('drop')
  const [file,         setFile]         = useState<File | null>(null)
  const [parseResult,  setParseResult]  = useState<ParseResult | null>(null)
  const [mapping,      setMapping]      = useState<ColumnMappingState>({})
  const [doneMsg,      setDoneMsg]      = useState<string>('')
  const [errorMsg,     setErrorMsg]     = useState<string | null>(null)
  const [loading,      setLoading]      = useState(false)

  // Step 1 → parse
  const handleFile = useCallback(async (f: File) => {
    setFile(f)
    setErrorMsg(null)
    setLoading(true)
    try {
      const form = new FormData()
      form.append('file', f)
      const res = await fetch(`${BASE_URL}/api/v1/upload/parse`, { method: 'POST', body: form })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || `Parse error ${res.status}`)
      }
      const data: ParseResult = await res.json()
      setParseResult(data)
      setMapping(data.detected_mapping)
      setStep(data.high_confidence ? 'preview' : 'mapping')
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'File read failed')
      setStep('error')
    } finally {
      setLoading(false)
    }
  }, [])

  // Step 3 → refresh
  const handleRefresh = useCallback(async () => {
    if (!file || !parseResult) return
    setLoading(true)
    setStep('refreshing')
    try {
      const result = await portfolioMgmtApi.refresh(portfolio.id, file, mapping)
      setDoneMsg(result.message)
      // Fetch updated portfolio meta
      const updated = await portfolioMgmtApi.getById(portfolio.id)
      setStep('done')
      onSuccess?.(updated)
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Refresh failed')
      setStep('error')
    } finally {
      setLoading(false)
    }
  }, [file, parseResult, mapping, portfolio.id, onSuccess])

  const reset = useCallback(() => {
    setStep('drop')
    setFile(null)
    setParseResult(null)
    setMapping({})
    setErrorMsg(null)
  }, [])

  const missingRequired = REQUIRED.filter((f) => !mapping[f])
  const canProceed = missingRequired.length === 0

  return (
    <div className={cn('rounded-xl border border-slate-200 bg-white', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <RefreshCw className="h-4 w-4 text-indigo-500" />
          <p className="text-sm font-semibold text-slate-800">
            Re-import into <span className="text-indigo-600">{portfolio.name}</span>
          </p>
        </div>
        {onCancel && (
          <button
            onClick={onCancel}
            className="text-slate-400 hover:text-slate-600 transition-colors"
            aria-label="Cancel"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="p-5 space-y-5">
        <StepIndicator current={step} />

        {/* Step: drop */}
        {(step === 'drop' || step === 'error') && (
          <>
            <div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-700 flex items-start gap-2">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">This will replace all current holdings</p>
                <p className="mt-0.5">Your current data will be preserved as a snapshot before the re-import.</p>
              </div>
            </div>
            <UploadDropzone onFile={handleFile} disabled={loading} error={step === 'error' ? errorMsg : null} />
            {loading && (
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <div className="h-3.5 w-3.5 rounded-full border-2 border-indigo-400 border-t-transparent animate-spin" />
                Parsing file…
              </div>
            )}
          </>
        )}

        {/* Step: mapping */}
        {step === 'mapping' && parseResult && (
          <>
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 flex items-start gap-2">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              Some columns could not be auto-detected. Review the mapping before continuing.
            </div>
            <ColumnMapper
              columnNames={parseResult.column_names}
              mapping={mapping}
              ambiguous={parseResult.ambiguous_fields}
              onChange={setMapping}
            />
            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <button onClick={reset} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700">
                <RotateCcw className="h-3 w-3" /> Start over
              </button>
              <button
                onClick={() => setStep('preview')}
                disabled={!canProceed}
                className={cn(
                  'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all',
                  canProceed
                    ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                    : 'bg-slate-100 text-slate-400 cursor-not-allowed',
                )}
              >
                Preview <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </>
        )}

        {/* Step: preview */}
        {step === 'preview' && parseResult && (
          <>
            <PortfolioPreviewTable
              rows={parseResult.preview_rows}
              rowCount={parseResult.row_count}
            />
            <div className="rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs text-indigo-700">
              <p className="font-semibold mb-0.5">What happens next</p>
              <p>
                {parseResult.row_count} row{parseResult.row_count !== 1 ? 's' : ''} will be imported.
                A <span className="font-semibold">pre-refresh snapshot</span> is saved automatically.
              </p>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <button
                onClick={() => setStep(parseResult.high_confidence ? 'drop' : 'mapping')}
                className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700"
              >
                <RotateCcw className="h-3 w-3" /> Back
              </button>
              <button
                onClick={handleRefresh}
                className="flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 transition-colors"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Re-import {parseResult.row_count} holding{parseResult.row_count !== 1 ? 's' : ''}
              </button>
            </div>
          </>
        )}

        {/* Step: refreshing */}
        {step === 'refreshing' && (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <div className="h-10 w-10 rounded-full border-4 border-indigo-400 border-t-transparent animate-spin" />
            <p className="text-sm font-medium text-slate-700">Re-importing portfolio…</p>
            <p className="text-xs text-slate-400">Saving snapshot and replacing holdings</p>
          </div>
        )}

        {/* Step: done */}
        {step === 'done' && (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
              <CheckCircle2 className="h-7 w-7 text-emerald-500" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900">Re-import successful</p>
              <p className="text-xs text-slate-500 mt-1">{doneMsg}</p>
            </div>
            <div className="rounded-lg bg-indigo-50 border border-indigo-100 px-3 py-2 text-xs text-indigo-700 text-left w-full">
              <span className="flex items-center gap-1.5 font-medium mb-1">
                <Camera className="h-3.5 w-3.5" /> Snapshots saved
              </span>
              A pre-refresh and post-refresh snapshot were created automatically so you can track what changed.
            </div>
            <button
              onClick={reset}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-medium transition-colors"
            >
              Re-import another file
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
