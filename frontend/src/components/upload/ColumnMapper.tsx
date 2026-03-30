/**
 * ColumnMapper
 * -------------
 * Shows the auto-detected column mapping and lets the user correct it.
 * Renders a row per canonical field with a <select> dropdown of all original
 * column names (plus "— Not mapped —").
 *
 * Props:
 *   columnNames:     all original column names from the file
 *   mapping:         canonical_field → original_col (null = not mapped)
 *   ambiguous:       list of canonical fields where detection is uncertain
 *   onChange(m):     called whenever the user changes a mapping
 */

'use client'

import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export type ColumnMappingState = Record<string, string | null>

interface ColumnMapperProps {
  columnNames: string[]
  mapping:     ColumnMappingState
  ambiguous:   string[]
  onChange:    (updated: ColumnMappingState) => void
}

const FIELD_META: Record<string, { label: string; required: boolean; description: string }> = {
  ticker:        { label: 'Ticker / Symbol',   required: true,  description: 'Stock symbol or NSE/BSE code' },
  name:          { label: 'Company Name',       required: true,  description: 'Full company or security name' },
  quantity:      { label: 'Quantity',           required: true,  description: 'Number of shares held' },
  average_cost:  { label: 'Average Cost',       required: true,  description: 'Average purchase price per share' },
  current_price: { label: 'Current Price',      required: false, description: 'Optional: latest market price' },
  sector:        { label: 'Sector / Industry',  required: false, description: 'Optional: sector classification' },
}

const FIELD_ORDER = ['ticker', 'name', 'quantity', 'average_cost', 'current_price', 'sector']

export function ColumnMapper({ columnNames, mapping, ambiguous, onChange }: ColumnMapperProps) {
  const claimedByOthers = (fieldKey: string) =>
    new Set(
      Object.entries(mapping)
        .filter(([k, v]) => k !== fieldKey && v !== null)
        .map(([, v]) => v)
    )

  function handleChange(field: string, value: string) {
    onChange({ ...mapping, [field]: value === '' ? null : value })
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500 mb-3">
        Review the detected column mapping. Correct any mismatches before importing.
      </p>

      <div className="rounded-lg border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                Field
              </th>
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                Mapped to column
              </th>
              <th className="px-4 py-2.5 w-[28px]" />
            </tr>
          </thead>
          <tbody>
            {FIELD_ORDER.map((fieldKey, idx) => {
              const meta       = FIELD_META[fieldKey]
              const selected   = mapping[fieldKey] ?? ''
              const isAmbig    = ambiguous.includes(fieldKey)
              const isMapped   = !!selected
              const isMissing  = meta.required && !isMapped
              const taken      = claimedByOthers(fieldKey)

              return (
                <tr
                  key={fieldKey}
                  className={cn(
                    'border-b border-slate-50',
                    idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/30',
                  )}
                >
                  {/* Field label */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-800">{meta.label}</span>
                      {meta.required && (
                        <span className="text-[10px] text-red-500 font-semibold">required</span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">{meta.description}</p>
                  </td>

                  {/* Column selector */}
                  <td className="px-4 py-3">
                    <select
                      value={selected}
                      onChange={(e) => handleChange(fieldKey, e.target.value)}
                      className={cn(
                        'w-full rounded-md border px-2.5 py-1.5 text-sm',
                        'focus:outline-none focus:ring-2 focus:ring-indigo-400/50 transition-colors',
                        isMissing
                          ? 'border-red-300 bg-red-50 text-red-700'
                          : isAmbig && isMapped
                          ? 'border-amber-300 bg-amber-50 text-amber-800'
                          : isMapped
                          ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                          : 'border-slate-200 bg-white text-slate-500',
                      )}
                    >
                      <option value="">— Not mapped —</option>
                      {columnNames.map((col) => (
                        <option
                          key={col}
                          value={col}
                          disabled={taken.has(col) && col !== selected}
                        >
                          {col}{taken.has(col) && col !== selected ? ' (used)' : ''}
                        </option>
                      ))}
                    </select>
                  </td>

                  {/* Status icon */}
                  <td className="px-3 py-3 text-center">
                    {isMissing ? (
                      <span title="Required — please map this column">
                        <AlertTriangle className="h-4 w-4 text-red-400" />
                      </span>
                    ) : isAmbig ? (
                      <span title="Auto-detected (uncertain) — please verify">
                        <AlertTriangle className="h-4 w-4 text-amber-400" />
                      </span>
                    ) : isMapped ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <span className="h-4 w-4 block rounded-full bg-slate-200" />
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
