import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import type { RecipeStep } from './types'

interface StepCardProps {
  step: RecipeStep
  index: number
  active: boolean
  onPick: (index: number) => void
}

export function StepCard({ step, index, active, onPick }: StepCardProps) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      onClick={() => onPick(index)}
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
        <h4
          className={cn(
            'text-[13.5px] font-semibold leading-snug',
            active ? 'text-foreground' : 'text-foreground',
          )}
        >
          {t(step.title)}
        </h4>
        <p className="mt-0.5 line-clamp-2 text-[12px] leading-relaxed text-muted-foreground">
          {t(step.detail)}
        </p>
      </div>
      <span className="mt-1 text-[10px]">
        {active ? (
          <span className="text-brand">●</span>
        ) : (
          <span className="text-transparent">●</span>
        )}
      </span>
    </button>
  )
}
