/**
 * UploadDropzone
 * ---------------
 * Drag-and-drop (or click-to-browse) file selector for CSV and Excel uploads.
 *
 * Props:
 *   onFile(file: File) — called once the user selects or drops a valid file
 *   disabled           — locks the dropzone while a parse/confirm is in flight
 *   error              — optional error string shown in the drop area
 */

'use client'

import { useCallback, useState } from 'react'
import { Upload, FileSpreadsheet, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface UploadDropzoneProps {
  onFile:   (file: File) => void
  disabled?: boolean
  error?:    string | null
}

const ACCEPTED = '.csv, .xlsx, .xls'
const ACCEPTED_TYPES = new Set(['text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'])
const ACCEPTED_EXTS  = new Set(['.csv', '.xlsx', '.xls'])

function isValidFile(file: File) {
  const ext = '.' + (file.name.split('.').pop() ?? '').toLowerCase()
  return ACCEPTED_EXTS.has(ext) || ACCEPTED_TYPES.has(file.type)
}

export function UploadDropzone({ onFile, disabled = false, error = null }: UploadDropzoneProps) {
  const [isDragOver, setIsDragOver] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  const handleFile = useCallback((file: File) => {
    setLocalError(null)
    if (!isValidFile(file)) {
      setLocalError(`"${file.name}" is not a supported format. Please upload a CSV or Excel file.`)
      return
    }
    onFile(file)
  }, [onFile])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    if (disabled) return
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [disabled, handleFile])

  const onInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    // Reset so same file can be re-uploaded
    e.target.value = ''
  }, [handleFile])

  const displayError = localError || error

  return (
    <div className="space-y-2">
      <label
        className={cn(
          'relative flex flex-col items-center justify-center gap-4',
          'rounded-xl border-2 border-dashed px-8 py-12 text-center transition-all duration-150',
          disabled
            ? 'cursor-not-allowed border-slate-200 bg-slate-50'
            : isDragOver
            ? 'cursor-copy border-indigo-400 bg-indigo-50'
            : displayError
            ? 'cursor-pointer border-red-300 bg-red-50 hover:border-red-400'
            : 'cursor-pointer border-slate-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/40',
        )}
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setIsDragOver(true) }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={onDrop}
      >
        <input
          type="file"
          accept={ACCEPTED}
          className="sr-only"
          disabled={disabled}
          onChange={onInputChange}
        />

        {/* Icon */}
        <div className={cn(
          'flex h-14 w-14 items-center justify-center rounded-xl transition-colors',
          isDragOver ? 'bg-indigo-100' : displayError ? 'bg-red-100' : 'bg-slate-100',
        )}>
          {displayError
            ? <AlertCircle className="h-7 w-7 text-red-400" />
            : <FileSpreadsheet className={cn('h-7 w-7', isDragOver ? 'text-indigo-500' : 'text-slate-400')} />
          }
        </div>

        {/* Text */}
        <div>
          <p className={cn(
            'text-sm font-semibold',
            isDragOver ? 'text-indigo-700' : displayError ? 'text-red-700' : 'text-slate-700',
          )}>
            {isDragOver ? 'Drop it here' : 'Drop your portfolio file here'}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            or <span className="text-indigo-500 font-medium">click to browse</span>
            {' '}· CSV or Excel (.xlsx, .xls)
          </p>
          <p className="mt-2 text-[11px] text-slate-300">Max 10 MB</p>
        </div>

        {/* Drag overlay icon */}
        {isDragOver && (
          <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-indigo-50/60 pointer-events-none">
            <Upload className="h-10 w-10 text-indigo-400 animate-bounce" />
          </div>
        )}
      </label>

      {/* Error message */}
      {displayError && (
        <p className="flex items-center gap-1.5 text-xs text-red-600">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {displayError}
        </p>
      )}

      {/* Format hints */}
      <div className="rounded-lg border border-slate-100 bg-slate-50 px-4 py-3 text-xs text-slate-500 space-y-1">
        <p className="font-semibold text-slate-600">Expected columns</p>
        <p>
          <span className="font-medium text-slate-700">Required:</span>{' '}
          Ticker / Symbol, Company Name, Quantity, Average Cost / Buy Price
        </p>
        <p>
          <span className="font-medium text-slate-700">Optional:</span>{' '}
          Current Price, Sector / Industry
        </p>
        <p className="text-slate-400 mt-1">
          Column names are detected automatically — exact names don't matter.
        </p>
      </div>
    </div>
  )
}
