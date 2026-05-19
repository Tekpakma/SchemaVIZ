import type { BuilderDocumentActions } from './builderWorkbench'
import type { RecipeData, RecipeStepKind } from './types'
import { ModelsStep } from './steps/ModelsStep'
import { TraversalStep } from './steps/TraversalStep'
import { FiltersStep } from './steps/FiltersStep'
import { GroupingStep } from './steps/GroupingStep'
import { StyleStep } from './steps/StyleStep'
import { LayoutStep } from './steps/LayoutStep'

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
    | 'setLayoutDirection'
    | 'setGroupLayout'
    | 'setModelLayer'
    | 'setModelStyleTemplate'
    | 'setStyleDraft'
    | 'setStyleDraftSaveState'
    | 'markStyleDraftSaved'
  >
  kind: RecipeStepKind
  recipe: RecipeData
  selectedCanvasNodeId?: string | null
}

export function StepDetail({
  actions,
  kind,
  recipe,
  selectedCanvasNodeId,
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
          groupLayout={recipe.groupLayout}
          groupRules={recipe.groupRules}
          models={recipe.models}
        />
      )
    case 'style':
      return (
        <StyleStep
          actions={actions}
          layers={recipe.layers}
          models={recipe.models}
          selectedCanvasNodeId={selectedCanvasNodeId}
          styleDrafts={recipe.styleDrafts}
          swatches={recipe.swatches}
        />
      )
    case 'layout':
      return (
        <LayoutStep
          groupLayout={recipe.groupLayout}
          groupLayoutEnabled={recipe.groupRules.some(
            (rule) => rule.mode === 'group',
          )}
          layoutDirection={recipe.layoutDirection}
          selected={recipe.layoutAlgorithm}
          onGroupLayoutChange={actions.setGroupLayout}
          onLayoutDirectionChange={actions.setLayoutDirection}
          onSelect={actions.setLayoutAlgorithm}
        />
      )
    default:
      return null
  }
}
