import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { StepDetail } from '../StepDetail'
import type { BuilderDocumentActions } from '../builderWorkbench'
import type { RecipeData, RecipeStep } from '../types'

type BuilderInspectorProps = {
  actions: BuilderDocumentActions
  activeExampleId: string | null
  activeStep: RecipeStep
  activeStepIndex: number
  recipe: RecipeData
  stepCount: number
}

export function BuilderInspector({
  actions,
  activeExampleId,
  activeStep,
  activeStepIndex,
  recipe,
  stepCount,
}: BuilderInspectorProps) {
  const { t } = useTranslation()

  return (
    <aside className="flex w-[480px] shrink-0 flex-col border-l border-border bg-background">
      <div className="border-b border-border px-5 py-4">
        <div className="mb-1 text-[12px] text-muted-foreground">
          {t('builder.inspector.stepProgress', {
            current: activeStepIndex + 1,
            total: stepCount,
          })}
        </div>
        <h2 className="text-[15px] font-semibold tracking-tight">
          {t(activeStep.title)}
        </h2>
        <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
          {t(activeStep.detail)}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        <StepDetail
          actions={actions}
          activeExampleId={activeExampleId}
          kind={activeStep.kind}
          recipe={recipe}
        />
      </div>

      <footer className="flex items-center justify-between border-t border-border px-5 py-3">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1 text-[13px]"
          disabled={activeStepIndex === 0}
          onClick={actions.prevStep}
        >
          <ChevronLeft className="size-3.5" />
          {t('builder.inspector.prev')}
        </Button>
        <Button
          size="sm"
          className="gap-1 text-[13px]"
          disabled={activeStepIndex === stepCount - 1}
          onClick={actions.nextStep}
        >
          {t('builder.inspector.next')}
          <ChevronRight className="size-3.5" />
        </Button>
      </footer>
    </aside>
  )
}
