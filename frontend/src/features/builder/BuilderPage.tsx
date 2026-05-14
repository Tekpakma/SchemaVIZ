import { useNavigate } from '@tanstack/react-router'
import { ArrowLeft, Star } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { WorkbenchTabId } from '@/store/workbenchStore'
import { StepCard } from './StepCard'
import { StepDetail } from './StepDetail'
import { BuilderPreview } from './BuilderPreview'
import { useBuilderDocumentView } from './builderWorkbench'

export function BuilderPage({ tabId }: { tabId: WorkbenchTabId }) {
  const navigate = useNavigate()
  const builder = useBuilderDocumentView(tabId)
  const { t } = useTranslation()

  if (!builder) {
    return null
  }

  const { actions, activeStep, activeStepIndex, recipe, steps } = builder

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* Header */}
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-4">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-[13px] text-muted-foreground"
          onClick={() => navigate({ to: '/' })}
        >
          <ArrowLeft className="size-3.5" />
          Back
        </Button>

        <div className="ml-2 flex min-w-0 flex-1 flex-col justify-center">
          <span className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-muted-foreground">
            EDITING TEMPLATE
          </span>
          <Input
            className="h-6 border-none bg-transparent p-0 text-[14px] font-semibold shadow-none focus-visible:ring-0"
            value={recipe.title}
            onChange={(e) => actions.setTitle(e.target.value)}
            placeholder="Untitled template"
          />
        </div>

        <div className="flex items-center gap-2">
          {/* TODO: Wire to preview mode — render the template with the active starting record */}
          <Button variant="ghost" size="sm" className="text-[13px]">
            Preview
          </Button>
          {/* TODO: Wire to save API — persist recipe draft */}
          <Button variant="ghost" size="sm" className="text-[13px]">
            Save recipe
          </Button>
          {/* TODO: Wire to promote flow — publish template org-wide */}
          <Button size="sm" className="gap-1.5 text-[13px]">
            <Star className="size-3.5" />
            Promote
          </Button>
        </div>
      </header>

      {/* Three-panel body */}
      <div className="flex min-h-0 flex-1">
        {/* Left: recipe steps */}
        <aside className="flex w-[300px] shrink-0 flex-col border-r border-border">
          <div className="px-4 pb-2 pt-5">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              RECIPE · {steps.length} steps
            </span>
            <h3 className="mt-1 text-[15px] font-semibold tracking-tight">
              Build a generation template
            </h3>
          </div>
          <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 pb-4">
            {steps.map((step, i) => (
              <StepCard
                key={step.id}
                step={step}
                index={i}
                active={i === activeStepIndex}
                onPick={actions.setActiveStep}
              />
            ))}
          </div>
        </aside>

        {/* Center: canvas preview */}
        <div className="relative flex min-w-0 flex-1 items-center justify-center overflow-hidden bg-muted/30">
          <div className="absolute left-3 top-3">
            <span className="rounded-full border border-border bg-card px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground shadow-sm">
              Live preview
            </span>
          </div>
          <div className="w-full max-w-[960px] px-6">
            <BuilderPreview recipe={recipe} />
          </div>
        </div>

        {/* Right: step detail / inspector */}
        <aside className="flex w-[320px] shrink-0 flex-col border-l border-border">
          <div className="border-b border-border px-5 pb-4 pt-5">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              STEP {activeStepIndex + 1} OF {steps.length}
            </span>
            <h3 className="mt-1.5 text-[15px] font-semibold tracking-tight">
              {t(activeStep.title)}
            </h3>
            <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
              {t(activeStep.detail)}
            </p>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            <StepDetail
              actions={actions}
              kind={activeStep.kind}
              recipe={recipe}
            />
          </div>

          <footer className="flex items-center justify-between border-t border-border px-5 py-3">
            <Button
              variant="ghost"
              size="sm"
              className="text-[13px]"
              disabled={activeStepIndex === 0}
              onClick={actions.prevStep}
            >
              ← Prev
            </Button>
            <Button
              size="sm"
              className="text-[13px]"
              disabled={activeStepIndex === steps.length - 1}
              onClick={actions.nextStep}
            >
              Next step →
            </Button>
          </footer>
        </aside>
      </div>
    </div>
  )
}
