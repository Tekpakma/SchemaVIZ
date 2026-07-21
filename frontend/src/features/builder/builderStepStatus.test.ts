import { describe, expect, it } from 'vitest'

import { createTemplateTextContent } from '@/features/lexical/templateTextContent'
import { getRecipeStepStatuses } from './builderStepStatus'
import type { RecipeData, RecipeStep } from './types'
import { DEFAULT_RECIPE_GROUP_LAYOUT } from './types'

const steps: RecipeStep[] = [
  {
    id: 's1',
    kind: 'layers',
    title: 'builder.steps.layers.title',
    detail: 'builder.steps.layers.detail',
  },
  {
    id: 's2',
    kind: 'traversal',
    title: 'builder.steps.traversal.title',
    detail: 'builder.steps.traversal.detail',
  },
  {
    id: 's3',
    kind: 'filters',
    title: 'builder.steps.filters.title',
    detail: 'builder.steps.filters.detail',
  },
  {
    id: 's4',
    kind: 'style',
    title: 'builder.steps.style.title',
    detail: 'builder.steps.style.detail',
  },
  {
    id: 's5',
    kind: 'layout',
    title: 'builder.steps.layout.title',
    detail: 'builder.steps.layout.detail',
  },
]

function createRecipe(overrides: Partial<RecipeData> = {}): RecipeData {
  return {
    title: '',
    layers: [{ id: 'layer-1', label: 'L1' }],
    models: [],
    examples: [],
    edges: [],
    filters: [],
    groupRules: [],
    groupLayout: { ...DEFAULT_RECIPE_GROUP_LAYOUT },
    styleDrafts: {},
    swatches: ['#c4006a'],
    layoutAlgorithm: 'Layered',
    layoutDirection: 'LR',
    shareSlug: '',
    promoteTarget: '',
    promoteVisibility: 'shared',
    promoteAudience: '',
    ...overrides,
  }
}

const providerModel = {
  id: 'provider',
  appLabel: 'cloud',
  appVerboseName: 'Cloud',
  modelName: 'provider',
  modelId: 'cloud.provider',
  displayName: 'Provider',
  layerId: 'layer-1',
}

describe('getRecipeStepStatuses', () => {
  it('marks an empty recipe as needing a start model with optional defaults neutral', () => {
    expect(
      getRecipeStepStatuses(createRecipe(), steps).map((s) => s.kind),
    ).toEqual(['needs-input', 'ready', 'default', 'default', 'default'])
  })

  it('marks traversal as needing input once multiple models exist without edges', () => {
    const recipe = createRecipe({
      layers: [
        { id: 'layer-1', label: 'L1' },
        { id: 'layer-2', label: 'L2' },
      ],
      models: [
        providerModel,
        {
          id: 'region',
          appLabel: 'cloud',
          appVerboseName: 'Cloud',
          modelName: 'region',
          modelId: 'cloud.region',
          displayName: 'Region',
          layerId: 'layer-2',
        },
      ],
    })

    expect(getRecipeStepStatuses(recipe, steps).map((s) => s.kind)).toEqual([
      'configured',
      'needs-input',
      'default',
      'default',
      'default',
    ])
  })

  it('marks model selection as needing input when a layer has no node context', () => {
    const recipe = createRecipe({
      layers: [
        { id: 'layer-1', label: 'L1' },
        { id: 'layer-2', label: 'L2' },
      ],
      models: [providerModel],
    })

    expect(getRecipeStepStatuses(recipe, steps)[0]?.kind).toBe('needs-input')
  })

  it('does not mark auto-created quick style drafts as configured', () => {
    const recipe = createRecipe({
      models: [providerModel],
      styleDrafts: {
        provider: {
          sourceTemplateId: null,
          persistedTemplateId: null,
          name: 'Provider node',
          textContent: createTemplateTextContent('Provider'),
          visualStyles: {},
          dimensions: {},
          typeSpecificData: {},
          dirty: true,
          saveState: 'idle',
        },
      },
    })

    expect(getRecipeStepStatuses(recipe, steps).map((s) => s.kind)).toEqual([
      'configured',
      'ready',
      'default',
      'default',
      'default',
    ])
  })

  it('marks optional recipe refinements as configured after explicit changes', () => {
    const recipe = createRecipe({
      layoutDirection: 'TB',
      models: [
        {
          ...providerModel,
          styleTemplateId: 'style-provider',
        },
      ],
      filters: [
        {
          id: 'active',
          expr: 'active=True',
          layer: 'L1',
          suggested: false,
        },
      ],
    })

    expect(getRecipeStepStatuses(recipe, steps).map((s) => s.kind)).toEqual([
      'configured',
      'ready',
      'configured',
      'configured',
      'configured',
    ])
  })
})
