import type { LayoutAlgorithm, RecipeData, RecipeStepKind } from './types'
import { LayersStep } from './steps/LayersStep'
import { ExamplesStep } from './steps/ExamplesStep'
import { TraversalStep } from './steps/TraversalStep'
import { FiltersStep } from './steps/FiltersStep'
import { StyleStep } from './steps/StyleStep'
import { LayoutStep } from './steps/LayoutStep'
import { PromoteStep } from './steps/PromoteStep'

interface StepDetailProps {
  actions: {
    setLayoutAlgorithm: (algorithm: LayoutAlgorithm) => void
  }
  kind: RecipeStepKind
  recipe: RecipeData
}

export function StepDetail({ actions, kind, recipe }: StepDetailProps) {
  switch (kind) {
    case 'layers':
      return <LayersStep layers={recipe.layers} />
    case 'examples':
      return <ExamplesStep examples={recipe.examples} />
    case 'traversal':
      return <TraversalStep edges={recipe.edges} />
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
