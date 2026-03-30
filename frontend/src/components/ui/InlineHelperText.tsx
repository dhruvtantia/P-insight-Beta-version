/**
 * InlineHelperText — small contextual hint line.
 *
 * Usage:
 *   <InlineHelperText text="Click a sector slice to filter the holdings table." />
 *   <InlineHelperText icon={Info} text="Simulation is for analysis only." variant="info" />
 */

import { Info, AlertTriangle, CheckCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

type Variant = 'info' | 'warning' | 'success'

const VARIANT_CONFIG: Record<Variant, { icon: React.ElementType; cls: string }> = {
  info:    { icon: Info,          cls: 'text-slate-400'  },
  warning: { icon: AlertTriangle, cls: 'text-amber-500'  },
  success: { icon: CheckCircle,   cls: 'text-emerald-500' },
}

interface InlineHelperTextProps {
  text: string
  variant?: Variant
  icon?: React.ElementType
  className?: string
}

export function InlineHelperText({
  text,
  variant = 'info',
  icon,
  className,
}: InlineHelperTextProps) {
  const { icon: DefaultIcon, cls } = VARIANT_CONFIG[variant]
  const Icon = icon ?? DefaultIcon

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <Icon className={cn('h-3 w-3 shrink-0', cls)} />
      <p className="text-[11px] text-slate-400 leading-tight">{text}</p>
    </div>
  )
}
