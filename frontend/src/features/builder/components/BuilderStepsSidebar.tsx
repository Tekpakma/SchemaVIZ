import { useTranslation } from 'react-i18next'

import { StepCard } from '../StepCard'
import type { BuilderStepStatus } from '../builderStepStatus'
import type { RecipeStep } from '../types'

type BuilderStepsSidebarProps = {
  activeStepIndex: number
  onPickStep: (index: number) => void
  statuses: BuilderStepStatus[]
  steps: RecipeStep[]
}

export function BuilderStepsSidebar({
  activeStepIndex,
  onPickStep,
  statuses,
  steps,
}: BuilderStepsSidebarProps) {
  const { t } = useTranslation()

  return (
    <aside className="flex h-full min-h-0 w-[300px] shrink-0 flex-col overflow-hidden border-r border-border bg-background">
      <div className="shrink-0 border-b border-border px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[14px] font-semibold tracking-tight">
            {t('builder.sidebar.title')}
          </h2>
          <span className="text-[12px] text-muted-foreground">
            {t('builder.sidebar.stepCount', { count: steps.length })}
          </span>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overscroll-contain p-2">
        {steps.map((step, index) => (
          <StepCard
            key={step.id}
            step={step}
            status={statuses[index]!}
            index={index}
            active={index === activeStepIndex}
            onPick={onPickStep}
          />
        ))}
      </div>
    </aside>
  )
}
