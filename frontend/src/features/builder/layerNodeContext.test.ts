import { describe, expect, it } from 'vitest'

import type { RecipeLayer, RecipeModel } from './types'
import {
  getLayersWithoutNodeContext,
  hasCompleteLayerNodeContext,
} from './layerNodeContext'

const layers: RecipeLayer[] = [
  { id: 'layer-1', label: 'L1' },
  { id: 'layer-2', label: 'L2' },
  { id: 'layer-3', label: 'Details' },
]

const models: RecipeModel[] = [
  {
    id: 'server',
    appLabel: 'infra',
    appVerboseName: 'Infrastructure',
    displayName: 'Server',
    layerId: 'layer-1',
    modelId: 'infra.server',
    modelName: 'server',
  },
  {
    id: 'environment',
    appLabel: 'infra',
    appVerboseName: 'Infrastructure',
    displayName: 'Environment',
    layerId: 'layer-2',
    modelId: 'infra.environment',
    modelName: 'environment',
  },
]

describe('layer node context', () => {
  it('reports every layer without a model-backed node', () => {
    expect(getLayersWithoutNodeContext(layers, models)).toEqual([layers[2]])
    expect(hasCompleteLayerNodeContext(layers, models)).toBe(false)
  })

  it('is complete once every layer contains at least one model', () => {
    expect(
      hasCompleteLayerNodeContext(layers, [
        ...models,
        { ...models[0]!, id: 'region', layerId: 'layer-3' },
      ]),
    ).toBe(true)
  })
})
