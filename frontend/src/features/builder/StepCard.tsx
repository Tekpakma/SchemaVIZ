import { AlertCircle, CheckCircle2, CircleDot } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'
import type { BuilderStepStatus } from './builderStepStatus'
import type { RecipeStep } from './types'

interface StepCardProps {
  active: boolean
  step: RecipeStep
  status: BuilderStepStatus
  index: number
  onPick: (index: number) => void
}

function StepStatusIcon({ status }: { status: BuilderStepStatus }) {
  if (status.kind === 'configured') {
    return <CheckCircle2 className="size-3.5 text-emerald-600" />
  }
  if (status.kind === 'needs-input') {
    return <AlertCircle className="size-3.5 text-amber-600" />
  }
  return <CircleDot className="size-3.5 text-muted-foreground" />
}

export function StepCard({
  step,
  status,
  index,
  active,
  onPick,
}: StepCardProps) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      onClick={() => onPick(index)}
      aria-current={active ? 'step' : undefined}
      className={cn(
        'flex w-full items-start gap-3 rounded-[10px] border px-3.5 py-3 text-left transition-colors',
        active
          ? 'border-brand/30 bg-brand-muted'
          : 'border-transparent hover:bg-muted',
      )}
    >
      <span
        className={cn(
          'mt-px font-mono text-[11px] tabular-nums tracking-wider',
          active ? 'text-brand' : 'text-muted-foreground',
        )}
      >
        {String(index + 1).padStart(2, '0')}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-start justify-between gap-2">
          <h4 className="min-w-0 truncate text-[13.5px] font-semibold leading-snug text-foreground">
            {t(step.title)}
          </h4>
          <span
            className={cn(
              'inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10.5px] font-medium leading-none',
              status.kind === 'configured' &&
                'border-emerald-600/20 bg-emerald-600/10 text-emerald-700 dark:text-emerald-300',
              status.kind === 'needs-input' &&
                'border-amber-600/20 bg-amber-600/10 text-amber-700 dark:text-amber-300',
              (status.kind === 'ready' || status.kind === 'default') &&
                'border-border bg-background text-muted-foreground',
            )}
          >
            <StepStatusIcon status={status} />
            {t(status.labelKey)}
          </span>
        </div>
        <p className="mt-0.5 line-clamp-2 text-[12px] leading-relaxed text-muted-foreground">
          {t(step.detail)}
        </p>
      </div>
    </button>
  )
}
