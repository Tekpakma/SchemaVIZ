import type { WorkbenchTabId } from '@/store/workbenchStore'
import { BuilderHeader } from './components/BuilderHeader'
import { BuilderInspector } from './components/BuilderInspector'
import { BuilderPreviewPane } from './components/BuilderPreviewPane'
import { BuilderStepsSidebar } from './components/BuilderStepsSidebar'
import { useBuilderDocumentView } from './builderWorkbench'

export function BuilderPage({ tabId }: { tabId: WorkbenchTabId }) {
  const builder = useBuilderDocumentView(tabId)

  if (!builder) {
    return null
  }

  const { actions, activeExampleId, activeStep, activeStepIndex, recipe, steps } =
    builder

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <BuilderHeader title={recipe.title} onTitleChange={actions.setTitle} />

      <div className="flex min-h-0 flex-1">
        <BuilderStepsSidebar
          activeStepIndex={activeStepIndex}
          onPickStep={actions.setActiveStep}
          steps={steps}
        />
        <BuilderPreviewPane
          activeExampleId={activeExampleId}
          activeStepKind={activeStep.kind}
          recipe={recipe}
        />
        <BuilderInspector
          actions={actions}
          activeExampleId={activeExampleId}
          activeStep={activeStep}
          activeStepIndex={activeStepIndex}
          recipe={recipe}
          stepCount={steps.length}
        />
      </div>
    </div>
  )
}
