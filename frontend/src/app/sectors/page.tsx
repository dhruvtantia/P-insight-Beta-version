'use client'

import { useState }               from 'react'
import { usePortfolio }            from '@/hooks/usePortfolio'
import { PageLoader }              from '@/components/common/LoadingSpinner'
import { TooltipHelp }             from '@/components/common/TooltipHelp'
import { SectorAllocationChart }   from '@/components/charts/SectorAllocationChart'
import { formatCurrency, SECTOR_COLORS, DEFAULT_SECTOR_COLOR } from '@/constants'
import { cn }                      from '@/lib/utils'

export default function SectorsPage() {
  const { sectors, loading, error } = usePortfolio()
  const [selectedSector, setSelectedSector] = useState<string | null>(null)

  if (loading) return <PageLoader />
  if (error) return <p className="text-red-500 text-sm">{error}</p>

  function handleSectorClick(sector: string) {
    setSelectedSector((prev) => prev === sector ? null : sector)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Sector Allocation</h1>
        <p className="text-sm text-slate-500 mt-1">
          Portfolio exposure broken down by sector. Click a sector to highlight it.
        </p>
      </div>

      {/* Donut chart */}
      <SectorAllocationChart
        sectors={sectors}
        loading={loading}
        selectedSector={selectedSector}
        onSectorClick={handleSectorClick}
      />

      {/* Sector breakdown table */}
      <div className="card overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-800">Sector Breakdown</h3>
          <TooltipHelp metric="sector_concentration" />
          {selectedSector && (
            <button
              onClick={() => setSelectedSector(null)}
              className="ml-auto text-xs text-indigo-600 hover:text-indigo-800 font-medium"
            >
              Clear filter ✕
            </button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                {['Sector', 'Holdings', 'Value (₹)', 'Weight %', 'Bar'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {sectors
                .slice()
                .sort((a, b) => b.weight_pct - a.weight_pct)
                .map((s) => {
                  const isSelected = selectedSector === s.sector
                  const isFaded    = !!selectedSector && !isSelected
                  return (
                    <tr
                      key={s.sector}
                      onClick={() => handleSectorClick(s.sector)}
                      className={cn(
                        'cursor-pointer transition-colors',
                        isSelected ? 'bg-indigo-50' : 'hover:bg-slate-50',
                        isFaded && 'opacity-40',
                      )}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div
                            className="h-3 w-3 rounded-full shrink-0"
                            style={{ backgroundColor: SECTOR_COLORS[s.sector] ?? DEFAULT_SECTOR_COLOR }}
                          />
                          <span className={cn(
                            'text-xs font-medium',
                            isSelected ? 'text-indigo-800 font-semibold' : 'text-slate-800',
                          )}>
                            {s.sector}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">{s.num_holdings}</td>
                      <td className="px-4 py-3 text-xs text-slate-700 font-medium tabular-nums">
                        {formatCurrency(s.value)}
                      </td>
                      <td className="px-4 py-3 text-xs font-bold text-slate-800 tabular-nums">
                        {s.weight_pct.toFixed(1)}%
                      </td>
                      <td className="px-4 py-3 w-48">
                        <div className="h-2 w-full rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${s.weight_pct}%`,
                              backgroundColor: SECTOR_COLORS[s.sector] ?? DEFAULT_SECTOR_COLOR,
                            }}
                          />
                        </div>
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
