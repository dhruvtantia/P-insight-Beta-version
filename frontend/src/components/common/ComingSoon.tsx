import { Construction } from 'lucide-react'

interface ComingSoonProps {
  feature: string
  phase?: string
  description?: string
}

/**
 * ComingSoon — placeholder for features not yet implemented.
 * Used in scaffold pages so the app doesn't show blank screens.
 */
export function ComingSoon({ feature, phase = 'Phase 2', description }: ComingSoonProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] rounded-xl border-2 border-dashed border-slate-200 bg-white p-12 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50 mb-4">
        <Construction className="h-8 w-8 text-indigo-400" />
      </div>
      <div className="inline-flex items-center rounded-full bg-amber-50 border border-amber-200 px-3 py-1 mb-4">
        <span className="text-xs font-semibold text-amber-700 uppercase tracking-wider">
          {phase}
        </span>
      </div>
      <h2 className="text-xl font-bold text-slate-800 mb-2">{feature}</h2>
      <p className="text-sm text-slate-500 max-w-md leading-relaxed">
        {description ??
          `${feature} is scaffolded and ready to be built in ${phase}. The architecture and routing are in place.`}
      </p>
    </div>
  )
}
