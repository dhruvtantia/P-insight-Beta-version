/**
 * PortfolioPreviewTable
 * ----------------------
 * Shows a subset of parsed rows so the user can visually confirm the data
 * looks correct before importing.
 *
 * Each row is a canonical dict from the /parse endpoint's preview_rows array:
 *   { ticker, name, quantity, average_cost, current_price, sector, _error? }
 *
 * Rows with _error are highlighted in red.
 */

'use client'

import { AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PreviewRow {
  ticker?:        string | null
  name?:          string | null
  quantity?:      number | null
  average_cost?:  number | null
  current_price?: number | null
  sector?:        string | null
  _error?:        string
  [key: string]:  unknown
}

interface PortfolioPreviewTableProps {
  rows:      PreviewRow[]
  rowCount:  number          // total rows in file (preview may be truncated)
}

function fmt(val: number | null | undefined, prefix = '₹'): string {
  if (val == null) return '—'
  return prefix + val.toLocaleString('en-IN', { maximumFractionDigits: 2 })
}

export function PortfolioPreviewTable({ rows, rowCount }: PortfolioPreviewTableProps) {
  if (!rows.length) return null

  const truncated = rowCount > rows.length

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs font-semibold text-slate-700">
          Preview — {rows.length} of {rowCount} row{rowCount !== 1 ? 's' : ''}
        </p>
        {truncated && (
          <p className="text-[11px] text-slate-400">Only the first {rows.length} rows shown</p>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-3 py-2.5 text-left font-semibold text-slate-500">Ticker</th>
              <th className="px-3 py-2.5 text-left font-semibold text-slate-500">Name</th>
              <th className="px-3 py-2.5 text-right font-semibold text-slate-500">Qty</th>
              <th className="px-3 py-2.5 text-right font-semibold text-slate-500">Avg Cost</th>
              <th className="px-3 py-2.5 text-right font-semibold text-slate-500">Current ₹</th>
              <th className="px-3 py-2.5 text-left font-semibold text-slate-500">Sector</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const hasError = !!row._error
              return (
                <tr
                  key={i}
                  className={cn(
                    'border-b border-slate-100',
                    hasError ? 'bg-red-50' : i % 2 === 0 ? 'bg-white' : 'bg-slate-50/30',
                  )}
                >
                  <td className="px-3 py-2">
                    <span className={cn(
                      'font-mono font-bold text-[12px]',
                      hasError ? 'text-red-600' : 'text-indigo-700',
                    )}>
                      {row.ticker ?? '—'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-slate-600 max-w-[180px] truncate">
                    {row.name ?? <span className="text-slate-300 italic">—</span>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                    {row.quantity != null ? row.quantity.toLocaleString('en-IN') : '—'}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                    {fmt(row.average_cost)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                    {row.current_price != null ? fmt(row.current_price) : '—'}
                  </td>
                  <td className="px-3 py-2 text-slate-500">
                    {row.sector ?? <span className="text-slate-300">—</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Error summary */}
      {rows.some((r) => r._error) && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Some preview rows have parse issues</p>
            <p className="mt-0.5 text-amber-700">
              Check your column mapping — these rows will be skipped during import.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
