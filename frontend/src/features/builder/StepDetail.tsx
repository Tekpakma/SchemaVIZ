import type { BuilderDocumentActions } from './builderWorkbench'
import type { RecipeData, RecipeStepKind } from './types'
import { ModelsStep } from './steps/ModelsStep'
import { ExamplesStep } from './steps/ExamplesStep'
import { TraversalStep } from './steps/TraversalStep'
import { FiltersStep } from './steps/FiltersStep'
import { StyleStep } from './steps/StyleStep'
import { LayoutStep } from './steps/LayoutStep'
import { PromoteStep } from './steps/PromoteStep'

interface StepDetailProps {
  actions: Pick<
    BuilderDocumentActions,
    | 'addEdge'
    | 'addExample'
    | 'addLayer'
    | 'addModel'
    | 'removeEdge'
    | 'removeExample'
    | 'removeLayer'
    | 'removeModel'
    | 'reorderModels'
    | 'setActiveExample'
    | 'setDefaultExample'
    | 'setLayoutAlgorithm'
    | 'setModelLayer'
  >
  activeExampleId: string | null
  kind: RecipeStepKind
  recipe: RecipeData
}

export function StepDetail({
  actions,
  activeExampleId,
  kind,
  recipe,
}: StepDetailProps) {
  switch (kind) {
    case 'layers':
      return (
        <ModelsStep
          actions={actions}
          layers={recipe.layers}
          models={recipe.models}
        />
      )
    case 'examples':
      return (
        <ExamplesStep
          actions={actions}
          activeExampleId={activeExampleId}
          examples={recipe.examples}
          models={recipe.models}
        />
      )
    case 'traversal':
      return (
        <TraversalStep
          actions={actions}
          edges={recipe.edges}
          layers={recipe.layers}
          models={recipe.models}
        />
      )
    case 'filters':
      return <FiltersStep filters={recipe.filters} />
    case 'style':
      return <StyleStep swatches={recipe.swatches} />
    case 'layout':
      return (
        <LayoutStep
          selected={recipe.layoutAlgorithm}
          onSelect={actions.setLayoutAlgorithm}
        />
      )
    case 'promote':
      return (
        <PromoteStep
          org={recipe.promoteOrg}
          visibility={recipe.promoteVisibility}
          audience={recipe.promoteAudience}
        />
      )
    default:
      return null
  }
}
