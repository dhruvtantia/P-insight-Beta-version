'use client'

/**
 * /upload — Portfolio Upload Wizard
 * -----------------------------------
 * Step 1: Drop a CSV or Excel file (UploadDropzone)
 * Step 2: Review auto-detected column mapping (ColumnMapper)
 *         – skipped if all required columns are high-confidence matches
 * Step 3: Confirm data preview (PortfolioPreviewTable)
 * Step 4: Import → success state with link to Dashboard
 *
 * All API calls hit /api/v1/upload/parse and /api/v1/upload/confirm.
 * After a successful import the user should switch Data Mode to "Uploaded"
 * in the Topbar to see their data.
 */

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Upload,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  RotateCcw,
  ChevronRight,
  LayoutDashboard,
} from 'lucide-react'
import { UploadDropzone } from '@/components/upload/UploadDropzone'
import { ColumnMapper, type ColumnMappingState } from '@/components/upload/ColumnMapper'
import { PortfolioPreviewTable } from '@/components/upload/PortfolioPreviewTable'
import { cn } from '@/lib/utils'

// ─── API base URL ─────────────────────────────────────────────────────────────
// All upload calls must hit FastAPI (port 8000), not Next.js (port 3000).
const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

// ─── Types ────────────────────────────────────────────────────────────────────

type WizardStep = 'drop' | 'mapping' | 'preview' | 'importing' | 'done' | 'error'

interface ParseResult {
  column_names:     string[]
  detected_mapping: ColumnMappingState
  ambiguous_fields: string[]
  high_confidence:  boolean
  preview_rows:     Record<string, unknown>[]
  row_count:        number
}

interface ConfirmResult {
  success:         boolean
  filename:        string
  holdings_parsed: number
  rows_skipped:    number
  skipped_details: Array<{ row_index: number; raw_ticker: string; error: string }>
  message:         string
}

// ─── Step indicator ───────────────────────────────────────────────────────────

const STEPS = ['Upload file', 'Map columns', 'Preview', 'Import'] as const

function StepIndicator({ current }: { current: WizardStep }) {
  const stepIndex = {
    drop:      0,
    mapping:   1,
    preview:   2,
    importing: 3,
    done:      3,
    error:     0,
  }[current]

  return (
    <div className="flex items-center gap-0 mb-8">
      {STEPS.map((label, i) => {
        const done   = i < stepIndex
        const active = i === stepIndex
        return (
          <div key={label} className="flex items-center">
            <div className="flex items-center gap-2">
              <div className={cn(
                'flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors',
                done   ? 'bg-emerald-500 text-white'
                : active ? 'bg-indigo-600 text-white'
                : 'bg-slate-100 text-slate-400',
              )}>
                {done ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
              </div>
              <span className={cn(
                'text-sm font-medium hidden sm:block',
                active ? 'text-slate-900' : done ? 'text-emerald-600' : 'text-slate-400',
              )}>
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <ChevronRight className="h-4 w-4 text-slate-300 mx-2 shrink-0" />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function UploadPage() {
  const router = useRouter()

  const [step,         setStep]         = useState<WizardStep>('drop')
  const [file,         setFile]         = useState<File | null>(null)
  const [parseResult,  setParseResult]  = useState<ParseResult | null>(null)
  const [mapping,      setMapping]      = useState<ColumnMappingState>({})
  const [confirmResult, setConfirmResult] = useState<ConfirmResult | null>(null)
  const [errorMsg,     setErrorMsg]     = useState<string | null>(null)
  const [loading,      setLoading]      = useState(false)

  // ── Step 1: file selected → call /parse ─────────────────────────────────────

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
        throw new Error(err.detail || `Server error ${res.status}`)
      }
      const data: ParseResult = await res.json()
      setParseResult(data)
      setMapping(data.detected_mapping)

      // If all required cols detected with high confidence, skip mapping step
      if (data.high_confidence) {
        setStep('preview')
      } else {
        setStep('mapping')
      }
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Upload failed')
      setStep('error')
    } finally {
      setLoading(false)
    }
  }, [])

  // ── Step 2 → 3: proceed from mapping to preview ──────────────────────────────

  const handleProceedToPreview = useCallback(() => {
    setStep('preview')
  }, [])

  // ── Step 3 → 4: confirm import ───────────────────────────────────────────────

  const handleConfirm = useCallback(async () => {
    if (!file || !parseResult) return
    setLoading(true)
    setStep('importing')

    try {
      const form = new FormData()
      form.append('file', file)
      form.append('column_mapping', JSON.stringify(mapping))

      const res = await fetch(`${BASE_URL}/api/v1/upload/confirm`, { method: 'POST', body: form })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || `Server error ${res.status}`)
      }
      const data: ConfirmResult = await res.json()
      setConfirmResult(data)
      setStep('done')
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Import failed')
      setStep('error')
    } finally {
      setLoading(false)
    }
  }, [file, parseResult, mapping])

  // ── Reset ───────────────────────────────────────────────────────────────────

  const handleReset = useCallback(() => {
    setStep('drop')
    setFile(null)
    setParseResult(null)
    setMapping({})
    setConfirmResult(null)
    setErrorMsg(null)
  }, [])

  // ── Required fields check ───────────────────────────────────────────────────

  const REQUIRED = ['ticker', 'name', 'quantity', 'average_cost']
  const missingRequired = REQUIRED.filter((f) => !mapping[f])
  const canProceed = missingRequired.length === 0

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-2xl mx-auto">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900">Upload Portfolio</h1>
        <p className="mt-1 text-sm text-slate-500">
          Import your holdings from a CSV or Excel file. We'll auto-detect the columns.
        </p>
      </div>

      <div className="card p-6 space-y-6">
        <StepIndicator current={step} />

        {/* ── STEP: drop ──────────────────────────────────────────────────── */}
        {(step === 'drop' || step === 'error') && (
          <>
            <UploadDropzone
              onFile={handleFile}
              disabled={loading}
              error={step === 'error' ? errorMsg : null}
            />
            {loading && (
              <div className="flex items-center gap-3 text-sm text-slate-500 mt-2">
                <div className="h-4 w-4 rounded-full border-2 border-indigo-400 border-t-transparent animate-spin shrink-0" />
                Analysing file…
              </div>
            )}
          </>
        )}

        {/* ── STEP: mapping ────────────────────────────────────────────────── */}
        {step === 'mapping' && parseResult && (
          <>
            <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Some columns could not be auto-detected</p>
                <p className="mt-0.5">
                  Review the mapping below and correct any mismatches before continuing.
                </p>
              </div>
            </div>

            <ColumnMapper
              columnNames={parseResult.column_names}
              mapping={mapping}
              ambiguous={parseResult.ambiguous_fields}
              onChange={setMapping}
            />

            {/* Preview with current mapping */}
            {parseResult.preview_rows.length > 0 && (
              <details className="group">
                <summary className="cursor-pointer text-xs text-indigo-600 hover:text-indigo-800 font-medium select-none">
                  Show data preview ▸
                </summary>
                <div className="mt-3">
                  <PortfolioPreviewTable
                    rows={parseResult.preview_rows as Array<Record<string, unknown>>}
                    rowCount={parseResult.row_count}
                  />
                </div>
              </details>
            )}

            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <button
                onClick={handleReset}
                className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Start over
              </button>
              <button
                onClick={handleProceedToPreview}
                disabled={!canProceed}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all',
                  canProceed
                    ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                    : 'bg-slate-100 text-slate-400 cursor-not-allowed',
                )}
              >
                Preview data <ArrowRight className="h-4 w-4" />
              </button>
            </div>

            {!canProceed && (
              <p className="text-xs text-red-500 -mt-2">
                Map all required fields first: {missingRequired.join(', ')}
              </p>
            )}
          </>
        )}

        {/* ── STEP: preview ────────────────────────────────────────────────── */}
        {step === 'preview' && parseResult && (
          <>
            {!parseResult.high_confidence && (
              <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                Column mapping confirmed. Review the sample rows below.
              </div>
            )}

            <PortfolioPreviewTable
              rows={parseResult.preview_rows as Array<Record<string, unknown>>}
              rowCount={parseResult.row_count}
            />

            <div className="rounded-lg border border-indigo-100 bg-indigo-50 px-4 py-3 text-xs text-indigo-700">
              <p className="font-semibold mb-0.5">What happens next</p>
              <p>
                All {parseResult.row_count} row{parseResult.row_count !== 1 ? 's' : ''} will be imported.
                After import, switch the <span className="font-semibold">Data Mode</span> toggle in
                the top-bar to <span className="font-semibold">Uploaded</span> to activate your data.
              </p>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <button
                onClick={() => setStep(parseResult.high_confidence ? 'drop' : 'mapping')}
                className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {parseResult.high_confidence ? 'Start over' : 'Back to mapping'}
              </button>
              <button
                onClick={handleConfirm}
                className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors"
              >
                <Upload className="h-4 w-4" />
                Import {parseResult.row_count} holding{parseResult.row_count !== 1 ? 's' : ''}
              </button>
            </div>
          </>
        )}

        {/* ── STEP: importing ──────────────────────────────────────────────── */}
        {step === 'importing' && (
          <div className="flex flex-col items-center gap-4 py-10 text-center">
            <div className="h-12 w-12 rounded-full border-4 border-indigo-400 border-t-transparent animate-spin" />
            <div>
              <p className="text-sm font-semibold text-slate-700">Importing your portfolio…</p>
              <p className="text-xs text-slate-400 mt-1">Normalising rows and updating the data cache</p>
            </div>
          </div>
        )}

        {/* ── STEP: done ───────────────────────────────────────────────────── */}
        {step === 'done' && confirmResult && (
          <div className="flex flex-col items-center gap-6 py-8 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
              <CheckCircle2 className="h-9 w-9 text-emerald-500" />
            </div>

            <div>
              <h2 className="text-lg font-bold text-slate-900">Import successful</h2>
              <p className="text-sm text-slate-500 mt-1">{confirmResult.message}</p>
            </div>

            <div className="flex gap-4 text-sm">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-5 py-3">
                <p className="text-2xl font-bold text-emerald-700">{confirmResult.holdings_parsed}</p>
                <p className="text-xs text-emerald-600 mt-0.5">Holdings imported</p>
              </div>
              {confirmResult.rows_skipped > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-5 py-3">
                  <p className="text-2xl font-bold text-amber-700">{confirmResult.rows_skipped}</p>
                  <p className="text-xs text-amber-600 mt-0.5">Rows skipped</p>
                </div>
              )}
            </div>

            {confirmResult.skipped_details.length > 0 && (
              <div className="w-full rounded-lg border border-amber-100 bg-amber-50 px-4 py-3 text-left text-xs text-amber-800">
                <p className="font-semibold mb-1">Skipped rows</p>
                <ul className="space-y-1">
                  {confirmResult.skipped_details.slice(0, 5).map((d, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="font-mono text-amber-700">{d.raw_ticker || `Row ${d.row_index + 2}`}</span>
                      <span className="text-amber-600">{d.error}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="rounded-lg border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-indigo-700 text-left w-full">
              <p className="font-semibold">Next step</p>
              <p className="text-xs text-indigo-600 mt-1">
                Switch the <strong>Data Mode</strong> toggle in the top-bar from{' '}
                <em>Mock</em> to <strong>Uploaded</strong> to use your portfolio data.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleReset}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Upload another
              </button>
              <button
                onClick={() => router.push('/dashboard')}
                className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
              >
                <LayoutDashboard className="h-4 w-4" /> Go to Dashboard
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
