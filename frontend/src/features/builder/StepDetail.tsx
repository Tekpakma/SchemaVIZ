import type { BuilderDocumentActions } from './builderWorkbench'
import type { RecipeData, RecipeStepKind } from './types'
import { ModelsStep } from './steps/ModelsStep'
import { TraversalStep } from './steps/TraversalStep'
import { FiltersStep } from './steps/FiltersStep'
import { GroupingStep } from './steps/GroupingStep'
import { StyleStep } from './steps/StyleStep'
import { LayoutStep } from './steps/LayoutStep'
import { PromoteStep } from './steps/PromoteStep'

interface StepDetailProps {
  actions: Pick<
    BuilderDocumentActions,
    | 'addEdge'
    | 'addGroupRule'
    | 'addFilter'
    | 'addLayer'
    | 'addModel'
    | 'removeEdge'
    | 'removeFilter'
    | 'removeGroupRule'
    | 'removeLayer'
    | 'removeModel'
    | 'reorderModels'
    | 'setLayoutAlgorithm'
    | 'setModelLayer'
  >
  kind: RecipeStepKind
  recipe: RecipeData
}

export function StepDetail({
  actions,
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
      return (
        <FiltersStep
          actions={actions}
          filters={recipe.filters}
          models={recipe.models}
        />
      )
    case 'grouping':
      return (
        <GroupingStep
          actions={actions}
          edges={recipe.edges}
          groupRules={recipe.groupRules}
          models={recipe.models}
        />
      )
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
