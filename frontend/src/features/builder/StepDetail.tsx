import {
  useBuilderEdges,
  useBuilderExamples,
  useBuilderFilters,
  useBuilderLayers,
  useBuilderLayoutAlgorithm,
  useBuilderRecipe,
  useBuilderSwatches,
  useBuilderActions,
} from '@/store/builderStore'
import type { RecipeStepKind } from './types'
import { LayersStep } from './steps/LayersStep'
import { ExamplesStep } from './steps/ExamplesStep'
import { TraversalStep } from './steps/TraversalStep'
import { FiltersStep } from './steps/FiltersStep'
import { StyleStep } from './steps/StyleStep'
import { LayoutStep } from './steps/LayoutStep'
import { PromoteStep } from './steps/PromoteStep'

interface StepDetailProps {
  kind: RecipeStepKind
}

export function StepDetail({ kind }: StepDetailProps) {
  const layers = useBuilderLayers()
  const examples = useBuilderExamples()
  const edges = useBuilderEdges()
  const filters = useBuilderFilters()
  const swatches = useBuilderSwatches()
  const layoutAlgorithm = useBuilderLayoutAlgorithm()
  const recipe = useBuilderRecipe()
  const { setLayoutAlgorithm } = useBuilderActions()

  switch (kind) {
    case 'layers':
      return <LayersStep layers={layers} />
    case 'examples':
      return <ExamplesStep examples={examples} />
    case 'traversal':
      return <TraversalStep edges={edges} />
    case 'filters':
      return <FiltersStep filters={filters} />
    case 'style':
      return <StyleStep swatches={swatches} />
    case 'layout':
      return (
        <LayoutStep selected={layoutAlgorithm} onSelect={setLayoutAlgorithm} />
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
