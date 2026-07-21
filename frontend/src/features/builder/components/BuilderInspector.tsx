import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { StepDetail } from '../StepDetail'
import type { BuilderStepStatus } from '../builderStepStatus'
import type { BuilderDocumentActions } from '../builderWorkbench'
import type { RecipeData, RecipeStep } from '../types'

type BuilderInspectorProps = {
  actions: BuilderDocumentActions
  activeStep: RecipeStep
  activeStepIndex: number
  activeStepStatus: BuilderStepStatus
  recipe: RecipeData
  selectedCanvasNodeId?: string | null
  stepCount: number
}

export function BuilderInspector({
  actions,
  activeStep,
  activeStepIndex,
  activeStepStatus,
  recipe,
  selectedCanvasNodeId,
  stepCount,
}: BuilderInspectorProps) {
  const { t } = useTranslation()

  return (
    <aside className="flex h-full min-h-0 w-[480px] shrink-0 flex-col overflow-hidden border-l border-border bg-background">
      <div className="shrink-0 border-b border-border px-5 py-4">
        <div className="mb-1 text-[12px] text-muted-foreground">
          {t('builder.inspector.stepProgress', {
            current: activeStepIndex + 1,
            total: stepCount,
          })}
        </div>
        <div className="flex items-start justify-between gap-3">
          <h2 className="min-w-0 text-[15px] font-semibold tracking-tight">
            {t(activeStep.title)}
          </h2>
          <span
            className={cn(
              'inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-medium',
              activeStepStatus.kind === 'configured' &&
                'border-emerald-600/20 bg-emerald-600/10 text-emerald-700 dark:text-emerald-300',
              activeStepStatus.kind === 'needs-input' &&
                'border-amber-600/20 bg-amber-600/10 text-amber-700 dark:text-amber-300',
              (activeStepStatus.kind === 'ready' ||
                activeStepStatus.kind === 'default') &&
                'border-border bg-muted text-muted-foreground',
            )}
          >
            {t(activeStepStatus.labelKey)}
          </span>
        </div>
        <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
          {t(activeStep.detail)}
        </p>
        <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
          {t(activeStepStatus.hintKey)}
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
        <StepDetail
          actions={actions}
          kind={activeStep.kind}
          recipe={recipe}
          selectedCanvasNodeId={selectedCanvasNodeId}
        />
      </div>

      <footer className="z-10 flex shrink-0 items-center justify-between border-t border-border bg-background px-5 py-3">
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
