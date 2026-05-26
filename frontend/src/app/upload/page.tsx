'use client'

/**
 * /upload — Portfolio Upload Wizard
 * -----------------------------------
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

import React, { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  Upload,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  RotateCcw,
  ChevronRight,
  LayoutDashboard,
  ChevronDown,
} from 'lucide-react'
import { UploadDropzone } from '@/components/upload/UploadDropzone'
import { ColumnMapper, type ColumnMappingState } from '@/components/upload/ColumnMapper'
import { PortfolioPreviewTable } from '@/components/upload/PortfolioPreviewTable'
import { useDataModeStore } from '@/store/dataModeStore'
import { cn } from '@/lib/utils'
import { uploadApi } from '@/services/api'
import type { ApiV2StatusResponse } from '@/generated/api-contracts'

// ─── Types ────────────────────────────────────────────────────────────────────

type WizardStep = 'drop' | 'mapping' | 'preview' | 'importing' | 'done' | 'error'

interface ParseResult {
  column_names:     string[]
  detected_mapping: ColumnMappingState
  ambiguous_fields: string[]
  high_confidence:  boolean
  preview_rows:     Record<string, unknown>[]
  row_count:        number
  missing_optional: string[]    // optional cols absent — will be enriched post-import
  required_fields:  string[]
  optional_fields:  string[]
}

interface EnrichmentDetail {
  ticker:              string
  normalized_ticker:   string
  sector_status:       'from_file' | 'yfinance' | 'fmp' | 'static_map' | 'unknown'
  name_status:         'from_file' | 'yfinance' | 'fmp' | 'static_map' | 'ticker_fallback'
  attempted_sources:   string[]
  enrichment_reason:   string | null
  // Backend-computed (returned by to_dict() — use directly, do NOT recompute)
  enrichment_status:   'enriched' | 'partial' | 'failed' | 'pending'
  fundamentals_status: 'fetched' | 'unavailable' | 'pending'
}

interface ConfirmResult {
  success:                 boolean
  filename:                string
  holdings_parsed:         number     // compat alias for rows_accepted
  rows_accepted:           number
  rows_rejected:           number
  skipped_details:         Array<{ row_index: number; raw_ticker: string; error: string }>
  enriched_count:          number
  rows_fully_enriched:     number
  rows_partially_enriched: number
  rows_sector_unknown:     number
  rows_no_fundamentals:    number     // holdings where fundamentals fetch was unavailable
  enrichment_note:         string | null
  enrichment_details:      EnrichmentDetail[]
  message:                 string
}

// ─── Upload V2 result ─────────────────────────────────────────────────────────
// Returned by POST /api/v1/upload/v2/confirm — fast response, enrichment async.

interface V2RejectedRow {
  row_index:  number
  raw_ticker: string | null
  reasons:    string[]
}

interface V2WarningRow {
  row_index: number
  ticker:    string
  warnings:  string[]
}

interface V2ConfirmResult {
  portfolio_id:            number
  filename:                string
  imported_at:             string
  total_rows:              number
  rows_valid:              number
  rows_valid_with_warning: number
  rows_invalid:            number
  rejected_rows:           V2RejectedRow[]
  warning_rows:            V2WarningRow[]
  enrichment_started:      boolean
  enrichment_complete:     boolean
  portfolio_usable:        boolean
  next_action:             string
  message:                 string
}

type V2HoldingEnrichmentStatus = ApiV2StatusResponse['holdings'][number]

const ENRICHMENT_POLL_INTERVAL_MS = 2_500
const ENRICHMENT_POLL_TIMEOUT_MS  = 90_000

// ─── Enrichment status helpers ────────────────────────────────────────────────

type SectorStatus = EnrichmentDetail['sector_status']
type NameStatus   = EnrichmentDetail['name_status']

function statusBadge(enrichmentStatus: string | undefined): React.ReactElement {
  const map: Record<string, { label: string; cls: string }> = {
    enriched: { label: 'Enriched',  cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    partial:  { label: 'Partial',   cls: 'bg-amber-50 text-amber-700 border-amber-200' },
    failed:   { label: 'Failed',    cls: 'bg-red-50 text-red-700 border-red-200' },
    pending:  { label: 'Pending',   cls: 'bg-slate-50 text-slate-500 border-slate-200' },
  }
  const entry = map[enrichmentStatus ?? ''] ?? { label: 'Unknown', cls: 'bg-slate-50 text-slate-400 border-slate-200' }
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${entry.cls}`}>
      {entry.label}
    </span>
  )
}

function sectorBadge(sectorStatus: SectorStatus): React.ReactElement {
  const labels: Record<SectorStatus, string> = {
    from_file:  'File',
    yfinance:   'YF',
    fmp:        'FMP',
    static_map: 'Map',
    unknown:    '—',
  }
  const clsMap: Record<SectorStatus, string> = {
    from_file:  'text-slate-500',
    yfinance:   'text-indigo-600',
    fmp:        'text-violet-600',
    static_map: 'text-teal-600',
    unknown:    'text-red-500 font-semibold',
  }
  return (
    <span className={`text-[10px] tabular-nums ${clsMap[sectorStatus]}`}>
      {labels[sectorStatus]}
    </span>
  )
}

function fundamentalsBadge(status: EnrichmentDetail['fundamentals_status']): React.ReactElement {
  if (status === 'fetched') {
    return <span className="text-[10px] text-emerald-600">✓ Live</span>
  }
  if (status === 'unavailable') {
    return <span className="text-[10px] text-amber-600 font-medium">⚠ N/A</span>
  }
  // pending = enrichment was skipped (fields came from file) — not a failure
  return <span className="text-[10px] text-slate-400">—</span>
}

function statusCard(status: ApiV2StatusResponse | null, pollingTimedOut: boolean): {
  title: string
  body: string
  cls: string
  dot: string
  pulse: boolean
} {
  if (!status && pollingTimedOut) {
    return {
      title: 'Enrichment status unavailable',
      body: 'The portfolio was imported, but status polling did not complete. You can proceed; refresh dashboard or holdings to see the latest persisted data.',
      cls: 'border-amber-100 bg-amber-50 text-amber-700',
      dot: 'bg-amber-400',
      pulse: false,
    }
  }

  if (!status) {
    return {
      title: 'Checking enrichment status',
      body: 'The portfolio was imported. P-Insight is checking whether background enrichment has started.',
      cls: 'border-indigo-100 bg-indigo-50 text-indigo-700',
      dot: 'bg-indigo-400',
      pulse: true,
    }
  }

  if (pollingTimedOut && status.pending > 0) {
    return {
      title: 'Enrichment still running',
      body: 'Status polling timed out locally, but some holdings are still pending. You can proceed; downstream pages may show incomplete data until enrichment finishes.',
      cls: 'border-amber-100 bg-amber-50 text-amber-700',
      dot: 'bg-amber-400',
      pulse: false,
    }
  }

  if (status.overall === 'failed') {
    return {
      title: 'Enrichment failed',
      body: 'The portfolio was imported, but enrichment failed for every holding. Dashboard data may rely on uploaded fields and unavailable markers.',
      cls: 'border-red-100 bg-red-50 text-red-700',
      dot: 'bg-red-400',
      pulse: false,
    }
  }

  if (!status.enrichment_complete) {
    return {
      title: 'Enrichment running in background',
      body: `${status.pending} of ${status.total_holdings} holding${status.total_holdings !== 1 ? 's are' : ' is'} still pending. You can proceed, but sector, name, price, and fundamentals may still update.`,
      cls: 'border-indigo-100 bg-indigo-50 text-indigo-700',
      dot: 'bg-indigo-400',
      pulse: true,
    }
  }

  if (status.partial > 0 || status.failed > 0) {
    return {
      title: 'Enrichment finished with gaps',
      body: `${status.partial} partial and ${status.failed} failed holding${status.partial + status.failed !== 1 ? 's' : ''}. Static, unavailable, or unknown values are shown as degraded rather than full success.`,
      cls: 'border-amber-100 bg-amber-50 text-amber-700',
      dot: 'bg-amber-400',
      pulse: false,
    }
  }

  return {
    title: 'Enrichment complete',
    body: 'All holdings have completed enrichment. Dashboard and analytics can use the enriched fields with higher confidence.',
    cls: 'border-emerald-100 bg-emerald-50 text-emerald-700',
    dot: 'bg-emerald-400',
    pulse: false,
  }
}

function statusCountLabel(label: string, value: number, cls: string): React.ReactElement {
  return (
    <div className={`rounded-lg border px-3 py-2 text-center ${cls}`}>
      <p className="text-lg font-bold tabular-nums">{value}</p>
      <p className="text-[10px] font-medium uppercase tracking-wide">{label}</p>
    </div>
  )
}

function statusSourceLabel(status: string | null | undefined, kind: 'sector' | 'name'): React.ReactElement {
  const value = status ?? 'pending'
  const label =
    value === 'from_file' ? 'File'
    : value === 'yfinance' ? 'Yahoo Finance'
    : value === 'fmp' ? 'FMP'
    : value === 'static_map' ? 'Static map'
    : value === 'ticker_fallback' ? 'Ticker fallback'
    : value === 'unknown' ? 'Unknown'
    : 'Pending'

  const cls =
    value === 'yfinance' || value === 'fmp' || value === 'from_file'
      ? 'text-slate-600'
      : value === 'static_map'
      ? 'text-amber-600 font-medium'
      : value === 'unknown' || value === 'ticker_fallback'
      ? 'text-red-500 font-medium'
      : 'text-slate-400'

  const suffix = value === 'static_map'
    ? ' (fallback)'
    : kind === 'name' && value === 'ticker_fallback'
    ? ' (fallback)'
    : ''

  return <span className={`text-[10px] ${cls}`}>{label}{suffix}</span>
}

function v2FundamentalsBadge(status: string | null | undefined): React.ReactElement {
  if (status === 'fetched') {
    return <span className="text-[10px] text-emerald-600">Live</span>
  }
  if (status === 'not_applicable') {
    return <span className="text-[10px] text-slate-500">N/A</span>
  }
  if (status === 'unavailable') {
    return <span className="text-[10px] text-amber-600 font-medium">Unavailable</span>
  }
  return <span className="text-[10px] text-slate-400">Pending</span>
}

function v2PriceBadge(status: string | null | undefined, failureReason: string | null | undefined): React.ReactElement {
  const value = status ?? 'pending'
  const label =
    value === 'live' ? 'Live'
    : value === 'uploaded_current_price' ? 'Uploaded'
    : value === 'missing' ? 'Missing'
    : value === 'provider_failed' ? 'Provider failed'
    : value === 'stale' ? 'Stale'
    : value === 'fallback_average_cost' ? 'Cost basis'
    : value === 'unknown' ? 'Unknown'
    : 'Pending'

  const cls =
    value === 'live'
      ? 'text-emerald-600'
      : value === 'uploaded_current_price'
      ? 'text-indigo-600'
      : value === 'pending'
      ? 'text-slate-400'
      : 'text-amber-600 font-medium'

  return (
    <span className={`text-[10px] ${cls}`} title={failureReason ?? undefined}>
      {label}
    </span>
  )
}

function V2EnrichmentStatusPanel({
  status,
  pollingError,
  pollingTimedOut,
}: {
  status: ApiV2StatusResponse | null
  pollingError: string | null
  pollingTimedOut: boolean
}) {
  const [open, setOpen] = useState(false)
  const card = statusCard(status, pollingTimedOut)
  const holdings = status?.holdings ?? []

  return (
    <div className="w-full space-y-3">
      <div className={`w-full rounded-lg border px-4 py-3 text-left ${card.cls}`}>
        <p className="text-xs font-semibold flex items-center gap-2">
          <span className={cn('inline-block h-2 w-2 rounded-full', card.dot, card.pulse && 'animate-pulse')} />
          {card.title}
        </p>
        <p className="text-xs mt-1">{card.body}</p>
        {pollingError && (
          <p className="text-xs mt-2 text-amber-700">
            Status check failed: {pollingError}. The import succeeded; refresh dashboard or holdings if enrichment finishes later.
          </p>
        )}
      </div>

      {status && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {statusCountLabel('Enriched', status.enriched, 'border-emerald-100 bg-emerald-50 text-emerald-700')}
          {statusCountLabel('Partial', status.partial, 'border-amber-100 bg-amber-50 text-amber-700')}
          {statusCountLabel('Pending', status.pending, 'border-slate-200 bg-slate-50 text-slate-600')}
          {statusCountLabel('Failed', status.failed, 'border-red-100 bg-red-50 text-red-700')}
        </div>
      )}

      {holdings.length > 0 && (
        <div className="w-full rounded-lg border border-slate-200 overflow-hidden text-xs">
          <button
            onClick={() => setOpen(o => !o)}
            className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
          >
            <div className="flex items-center gap-2 font-medium text-slate-700">
              <span>Enrichment details — {holdings.length} holding{holdings.length !== 1 ? 's' : ''}</span>
              {status?.enrichment_complete
                ? <span className="rounded-full bg-slate-100 text-slate-600 px-2 py-0.5 text-[10px]">Finished</span>
                : <span className="rounded-full bg-indigo-100 text-indigo-700 px-2 py-0.5 text-[10px]">Polling</span>
              }
            </div>
            <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>

          {open && (
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50">
                    <th className="text-left px-3 py-2 font-medium text-slate-500 w-28">Ticker</th>
                    <th className="text-left px-3 py-2 font-medium text-slate-500">Status</th>
                    <th className="text-left px-3 py-2 font-medium text-slate-500">Sector</th>
                    <th className="text-left px-3 py-2 font-medium text-slate-500">Name</th>
                    <th className="text-left px-3 py-2 font-medium text-slate-500">Price</th>
                    <th className="text-left px-3 py-2 font-medium text-slate-500">Fundamentals</th>
                    <th className="text-left px-3 py-2 font-medium text-slate-500 hidden sm:table-cell">Note</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {holdings.map((h: V2HoldingEnrichmentStatus, index) => (
                    <tr key={`${h.ticker}-${index}`} className="hover:bg-slate-50/50">
                      <td className="px-3 py-1.5">
                        <div className="font-mono font-semibold text-slate-800">{h.ticker}</div>
                        {h.normalized_ticker && h.normalized_ticker !== h.ticker && (
                          <div className="text-[10px] text-slate-400">{h.normalized_ticker}</div>
                        )}
                      </td>
                      <td className="px-3 py-1.5">{statusBadge(h.enrichment_status)}</td>
                      <td className="px-3 py-1.5">{statusSourceLabel(h.sector_status, 'sector')}</td>
                      <td className="px-3 py-1.5">{statusSourceLabel(h.name_status, 'name')}</td>
                      <td className="px-3 py-1.5">{v2PriceBadge(h.price_status, h.price_failure_reason)}</td>
                      <td className="px-3 py-1.5">{v2FundamentalsBadge(h.fundamentals_status)}</td>
                      <td className="px-3 py-1.5 text-slate-400 max-w-[220px] truncate hidden sm:table-cell">
                        {h.failure_reason ?? (h.enrichment_status === 'enriched' ? 'Resolved' : '')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Expandable per-holding enrichment status table.
 * Uses enrichment_status and fundamentals_status directly from the backend
 * (via EnrichmentRecord.to_dict()) — NOT recomputed on the frontend.
 */
function EnrichmentStatusTable({
  details,
  rowsFullyEnriched,
  rowsPartiallyEnriched,
  rowsSectorUnknown,
}: {
  details:               EnrichmentDetail[]
  rowsFullyEnriched:     number
  rowsPartiallyEnriched: number
  rowsSectorUnknown:     number
}) {
  const [open, setOpen] = useState(false)

  if (details.length === 0) return null

  const allGood = rowsSectorUnknown === 0 && rowsPartiallyEnriched === 0

  return (
    <div className="w-full rounded-lg border border-slate-200 overflow-hidden text-xs">
      {/* Toggle header */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
      >
        <div className="flex items-center gap-2 font-medium text-slate-700">
          <span>Enrichment details — {details.length} holding{details.length !== 1 ? 's' : ''}</span>
          {allGood
            ? <span className="rounded-full bg-emerald-100 text-emerald-700 px-2 py-0.5 text-[10px]">All resolved</span>
            : <span className="rounded-full bg-amber-100 text-amber-700 px-2 py-0.5 text-[10px]">
                {rowsSectorUnknown > 0 ? `${rowsSectorUnknown} unknown sector` : `${rowsPartiallyEnriched} partial`}
              </span>
          }
        </div>
        <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50">
                <th className="text-left px-3 py-2 font-medium text-slate-500 w-28">Ticker</th>
                <th className="text-left px-3 py-2 font-medium text-slate-500">Status</th>
                <th className="text-left px-3 py-2 font-medium text-slate-500">Sector</th>
                <th className="text-left px-3 py-2 font-medium text-slate-500">Name</th>
                <th className="text-left px-3 py-2 font-medium text-slate-500">Fundamentals</th>
                <th className="text-left px-3 py-2 font-medium text-slate-500 hidden sm:table-cell">Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {details.map((d) => (
                <tr key={d.ticker} className="hover:bg-slate-50/50">
                  <td className="px-3 py-1.5 font-mono font-semibold text-slate-800">{d.ticker}</td>
                  {/* Use enrichment_status from backend directly — it factors in fundamentals */}
                  <td className="px-3 py-1.5">{statusBadge(d.enrichment_status)}</td>
                  <td className="px-3 py-1.5">{sectorBadge(d.sector_status)}</td>
                  <td className="px-3 py-1.5">
                    <span className={`text-[10px] ${d.name_status === 'ticker_fallback' ? 'text-red-500' : 'text-slate-500'}`}>
                      {d.name_status === 'from_file'    ? 'File'
                       : d.name_status === 'yfinance'   ? 'YF'
                       : d.name_status === 'fmp'        ? 'FMP'
                       : d.name_status === 'static_map' ? 'Map'
                       : '— ticker only'}
                    </span>
                  </td>
                  <td className="px-3 py-1.5">{fundamentalsBadge(d.fundamentals_status)}</td>
                  <td className="px-3 py-1.5 text-slate-400 max-w-[180px] truncate hidden sm:table-cell">
                    {d.enrichment_reason ?? (d.enrichment_status === 'enriched' ? '✓' : '')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rowsSectorUnknown > 0 && (
            <p className="px-4 py-2 text-[10px] text-amber-600 bg-amber-50 border-t border-amber-100">
              Unknown sector: add the exchange suffix (e.g.{' '}
              <code className="font-mono bg-amber-100 px-0.5 rounded">TCS.NS</code> for NSE) and
              re-upload to resolve.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Step indicator ───────────────────────────────────────────────────────────

const STEPS = ['Choose file', 'Map columns', 'Review data', 'Import'] as const

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
  const { setMode } = useDataModeStore()

  const [step,            setStep]           = useState<WizardStep>('drop')
  const [file,            setFile]           = useState<File | null>(null)
  const [parseResult,     setParseResult]    = useState<ParseResult | null>(null)
  const [mapping,         setMapping]        = useState<ColumnMappingState>({})
  const [confirmResult,   setConfirmResult]  = useState<ConfirmResult | null>(null)
  const [v2Result,        setV2Result]       = useState<V2ConfirmResult | null>(null)
  const [v2Status,        setV2Status]       = useState<ApiV2StatusResponse | null>(null)
  const [pollingError,    setPollingError]   = useState<string | null>(null)
  const [pollingTimedOut, setPollingTimedOut] = useState(false)
  const [errorMsg,        setErrorMsg]       = useState<string | null>(null)
  const [loading,         setLoading]        = useState(false)

  // ── Step 1: file selected → call /parse ─────────────────────────────────────

  const handleFile = useCallback(async (f: File) => {
    setFile(f)
    setErrorMsg(null)
    setLoading(true)

    try {
      const data = await uploadApi.parse<ParseResult>(f)
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

  // ── Step 3 → 4: confirm import (V2 fast path) ───────────────────────────────
  // Calls /upload/v2/confirm — returns in < 2 s; enrichment runs in background.

  const handleConfirm = useCallback(async () => {
    if (!file || !parseResult) return
    setLoading(true)
    setStep('importing')

    try {
      const data = await uploadApi.confirmV2<V2ConfirmResult>(file, mapping)
      setV2Result(data)
      setV2Status(null)
      setPollingError(null)
      setPollingTimedOut(false)
      setMode('uploaded')   // auto-activate uploaded data mode
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
    setV2Result(null)
    setV2Status(null)
    setPollingError(null)
    setPollingTimedOut(false)
    setErrorMsg(null)
  }, [])

  // ── Poll enrichment status after V2 import ─────────────────────────────────

  useEffect(() => {
    if (step !== 'done' || !v2Result?.portfolio_id) return

    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    const startedAt = Date.now()

    const poll = async () => {
      try {
        const status = await uploadApi.statusV2(v2Result.portfolio_id)
        if (cancelled) return

        setV2Status(status)
        setPollingError(null)

        const terminal = status.enrichment_complete || status.overall === 'failed'
        if (terminal) return

        if (Date.now() - startedAt >= ENRICHMENT_POLL_TIMEOUT_MS) {
          setPollingTimedOut(true)
          return
        }

        timer = setTimeout(poll, ENRICHMENT_POLL_INTERVAL_MS)
      } catch (e) {
        if (cancelled) return

        setPollingError(e instanceof Error ? e.message : 'Could not read enrichment status')
        if (Date.now() - startedAt >= ENRICHMENT_POLL_TIMEOUT_MS) {
          setPollingTimedOut(true)
          return
        }

        timer = setTimeout(poll, ENRICHMENT_POLL_INTERVAL_MS)
      }
    }

    poll()

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [step, v2Result?.portfolio_id])

  // ── Required fields check ───────────────────────────────────────────────────
  // name / sector / current_price are optional — enrichment fills them post-import

  const REQUIRED = ['ticker', 'quantity', 'average_cost']
  const missingRequired = REQUIRED.filter((f) => !mapping[f])
  const canProceed = missingRequired.length === 0

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-2xl mx-auto">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900">Upload Portfolio</h1>
        <p className="mt-1 text-sm text-slate-500">
          Import your holdings from a broker CSV or Excel export. Columns are
          auto-detected. Only <strong>ticker</strong>, <strong>quantity</strong>,
          and <strong>average cost</strong> are required — sector and company
          name are filled automatically.
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

            {/* Detailed error block (only shown in error step) */}
            {step === 'error' && errorMsg && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
                <p className="font-semibold mb-1 flex items-center gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" /> What went wrong
                </p>
                <p className="text-red-600 mb-2">{errorMsg}</p>
                <p className="text-red-500">
                  {errorMsg.toLowerCase().includes('fetch') || errorMsg.toLowerCase().includes('network')
                    ? 'Check that the backend service is running and reachable.'
                    : errorMsg.toLowerCase().includes('required')
                    ? 'Your file is missing one or more required columns: ticker, quantity, average cost. Check the column names and try again.'
                    : 'Try a different file, or check that it is a valid CSV or Excel file with at least ticker, quantity, and average cost columns.'}
                </p>
              </div>
            )}

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
                  Review the mapping below. Required fields must be mapped;
                  optional fields (sector, company name, current price) can be
                  left unmapped — they will be filled automatically after import.
                </p>
              </div>
            </div>

            {/* Field legend */}
            <div className="flex flex-wrap gap-3 text-[10px]">
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full bg-red-400" />
                <span className="text-slate-600 font-medium">Required:</span>
                <span className="text-slate-500">ticker, quantity, average cost</span>
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full bg-slate-300" />
                <span className="text-slate-600 font-medium">Optional:</span>
                <span className="text-slate-500">name, sector, current price</span>
              </span>
            </div>

            <ColumnMapper
              columnNames={parseResult.column_names}
              mapping={mapping}
              ambiguous={parseResult.ambiguous_fields}
              onChange={setMapping}
            />

            {/* Optional fields notice */}
            {parseResult.missing_optional.length > 0 && (
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-600 flex items-start gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-slate-400 mt-0.5 shrink-0" />
                <span>
                  <span className="font-medium">Missing optional columns: </span>
                  {parseResult.missing_optional.join(', ')}.
                  These will be filled automatically from Yahoo Finance after import.
                </span>
              </div>
            )}

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
                Map all required fields first: {missingRequired.map((f) =>
                  f === 'average_cost' ? 'average cost (buy price)' : f
                ).join(', ')}
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

            {/* Optional-fields enrichment notice */}
            {parseResult.missing_optional.length > 0 && (
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-600 flex items-start gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-slate-400 mt-0.5 shrink-0" />
                <span>
                  <span className="font-medium">
                    Optional fields not found in your file:{' '}
                  </span>
                  {parseResult.missing_optional.join(', ')}.
                  P-Insight will attempt to fill these from Yahoo Finance after import.
                  Your portfolio will be usable even if enrichment fails.
                </span>
              </div>
            )}

            <div className="rounded-lg border border-indigo-100 bg-indigo-50 px-4 py-3 text-xs text-indigo-700">
              <p className="font-semibold mb-0.5">What happens next</p>
              <p>
                All {parseResult.row_count} row{parseResult.row_count !== 1 ? 's' : ''} will be imported
                and the app will automatically switch to <span className="font-semibold">Uploaded</span> mode.
                You can then go straight to the Dashboard to see your portfolio.
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
              <p className="text-xs text-slate-400 mt-1">
                Saving holdings to database — this takes just a moment
              </p>
            </div>
          </div>
        )}

        {/* ── STEP: done (V2) ──────────────────────────────────────────────── */}
        {step === 'done' && v2Result && (
          <div className="flex flex-col items-center gap-5 py-6 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
              <CheckCircle2 className="h-9 w-9 text-emerald-500" />
            </div>

            <div>
              <h2 className="text-lg font-bold text-slate-900">Import complete</h2>
              <p className="text-sm text-slate-500 mt-1">{v2Result.message}</p>
            </div>

            {/* Stats row */}
            <div className="flex flex-wrap justify-center gap-3 text-sm">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-5 py-3 text-center">
                <p className="text-2xl font-bold text-emerald-700">
                  {v2Result.rows_valid + v2Result.rows_valid_with_warning}
                </p>
                <p className="text-xs text-emerald-600 mt-0.5">Holdings imported</p>
              </div>
              {v2Result.rows_valid_with_warning > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-5 py-3 text-center">
                  <p className="text-2xl font-bold text-amber-700">{v2Result.rows_valid_with_warning}</p>
                  <p className="text-xs text-amber-600 mt-0.5">Imported with warnings</p>
                </div>
              )}
              {v2Result.rows_invalid > 0 && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-5 py-3 text-center">
                  <p className="text-2xl font-bold text-red-700">{v2Result.rows_invalid}</p>
                  <p className="text-xs text-red-600 mt-0.5">Rows rejected</p>
                </div>
              )}
            </div>

            <V2EnrichmentStatusPanel
              status={v2Status}
              pollingError={pollingError}
              pollingTimedOut={pollingTimedOut}
            />

            {/* Warnings detail */}
            {v2Result.warning_rows.length > 0 && (
              <div className="w-full rounded-lg border border-amber-100 bg-amber-50 px-4 py-3 text-left text-xs text-amber-800">
                <p className="font-semibold mb-1">
                  {v2Result.warning_rows.length} row(s) imported with warnings
                </p>
                <ul className="space-y-1.5">
                  {v2Result.warning_rows.slice(0, 5).map((w, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="font-mono font-semibold text-amber-700 shrink-0">{w.ticker}</span>
                      <span className="text-amber-600">{w.warnings[0]}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Rejected rows detail */}
            {v2Result.rejected_rows.length > 0 && (
              <div className="w-full rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-left text-xs text-red-800">
                <p className="font-semibold mb-1">
                  {v2Result.rejected_rows.length} row(s) could not be imported
                </p>
                <ul className="space-y-1.5">
                  {v2Result.rejected_rows.slice(0, 5).map((r, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="font-mono font-semibold text-red-700 shrink-0">
                        {r.raw_ticker || `Row ${r.row_index + 2}`}
                      </span>
                      <span className="text-red-600">{r.reasons.join('; ')}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 text-left w-full">
              <p className="font-semibold flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" /> Data mode switched to Uploaded
              </p>
              <p className="text-xs text-emerald-600 mt-1">
                Your portfolio is active. You can proceed now; if enrichment is still pending or degraded,
                downstream pages may show uploaded, static, unknown, or unavailable values.
              </p>
            </div>

            {/* Primary action */}
            <button
              onClick={() => router.push('/dashboard')}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors"
            >
              <LayoutDashboard className="h-4 w-4" /> Go to Dashboard
            </button>

            {/* Secondary nav */}
            <div className="w-full grid grid-cols-2 sm:grid-cols-3 gap-2">
              <button
                onClick={() => router.push('/holdings')}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600 hover:bg-slate-50 transition-colors"
              >
                <ChevronRight className="h-3 w-3 text-slate-400" /> Holdings
              </button>
              <button
                onClick={() => router.push('/fundamentals')}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600 hover:bg-slate-50 transition-colors"
              >
                <ChevronRight className="h-3 w-3 text-slate-400" /> Fundamentals
              </button>
              <button
                onClick={() => router.push('/changes')}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600 hover:bg-slate-50 transition-colors"
              >
                <ChevronRight className="h-3 w-3 text-slate-400" /> Changes
              </button>
            </div>

            <button
              onClick={handleReset}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600"
            >
              <RotateCcw className="h-3 w-3" /> Upload a different file
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
