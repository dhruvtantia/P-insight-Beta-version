import { ComingSoon } from '@/components/common/ComingSoon'
import { TooltipHelp } from '@/components/common/TooltipHelp'

export default function FrontierPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-slate-700">Efficient Frontier Optimisation</h2>
        <TooltipHelp metric="efficient_frontier" />
      </div>
      <ComingSoon
        feature="Efficient Frontier"
        phase="Phase 2"
        description="Portfolio optimisation using Modern Portfolio Theory. Requires historical return data from Live API mode. Will show the risk/return frontier, minimum variance portfolio, and maximum Sharpe portfolio."
      />
    </div>
  )
}
