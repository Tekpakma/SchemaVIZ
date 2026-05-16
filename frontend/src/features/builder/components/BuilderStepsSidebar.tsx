import { useTranslation } from 'react-i18next'

import { StepCard } from '../StepCard'
import type { RecipeStep } from '../types'

type BuilderStepsSidebarProps = {
  activeStepIndex: number
  onPickStep: (index: number) => void
  steps: RecipeStep[]
}

export function BuilderStepsSidebar({
  activeStepIndex,
  onPickStep,
  steps,
}: BuilderStepsSidebarProps) {
  const { t } = useTranslation()

  return (
    <aside className="flex w-[300px] shrink-0 flex-col border-r border-border bg-background">
      <div className="border-b border-border px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[14px] font-semibold tracking-tight">
            {t('builder.sidebar.title')}
          </h2>
          <span className="text-[12px] text-muted-foreground">
            {t('builder.sidebar.stepCount', { count: steps.length })}
          </span>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-1 overflow-y-auto p-2">
        {steps.map((step, index) => (
          <StepCard
            key={step.id}
            step={step}
            index={index}
            active={index === activeStepIndex}
            onPick={onPickStep}
          />
        ))}
      </div>
    </aside>
  )
}
