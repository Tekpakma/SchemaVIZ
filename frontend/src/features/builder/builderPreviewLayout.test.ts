import { describe, expect, it } from 'vitest'

import {
  getBuilderPreviewCanvasGraph,
  getBuilderPreviewColumns,
  getBuilderPreviewEdges,
  getBuilderPreviewNodes,
} from './builderPreviewLayout'
import type { RecipeData, RecipeModel } from './types'

function createRecipe(overrides: Partial<RecipeData> = {}): RecipeData {
  return {
    title: 'Preview',
    layers: [],
    models: [],
    examples: [],
    edges: [],
    filters: [],
    groupRules: [],
    swatches: ['#111111', '#222222'],
    layoutAlgorithm: 'Layered',
    promoteOrg: '',
    promoteVisibility: 'org-wide',
    promoteAudience: '',
    ...overrides,
  }
}

function createModel(overrides: Partial<RecipeModel>): RecipeModel {
  const id = overrides.id ?? 'model-service'
  const modelName = overrides.modelName ?? id.replace(/^model-/, '')

  return {
    id,
    appLabel: overrides.appLabel ?? 'app',
    appVerboseName: overrides.appVerboseName ?? 'App',
    modelName,
    modelId: overrides.modelId ?? `app.${modelName}`,
    displayName: overrides.displayName ?? modelName,
    layerId: overrides.layerId ?? 'service',
    alias: overrides.alias,
  }
}

describe('builder preview layout', () => {
  it('uses recipe models as preview nodes', () => {
    const nodes = getBuilderPreviewNodes(
      createRecipe({
        layers: [
          { id: 'service', label: 'Services' },
          { id: 'database', label: 'Data' },
        ],
        models: [
          createModel({
            id: 'service-model',
            displayName: 'Service',
            layerId: 'service',
          }),
          createModel({
            id: 'database-model',
            displayName: 'Database',
            layerId: 'database',
          }),
        ],
      }),
    )

    expect(nodes).toMatchObject([
      { accent: '#111111', index: 0, label: 'Service', layerId: 'service' },
      { accent: '#222222', index: 1, label: 'Database', layerId: 'database' },
    ])
  })

  it('produces one column per visual layer', () => {
    const columns = getBuilderPreviewColumns(
      createRecipe({
        layers: [
          { id: 'service', label: 'Services' },
          { id: 'database', label: 'Data' },
        ],
        models: [
          createModel({ id: 'service-model', layerId: 'service' }),
          createModel({ id: 'database-model', layerId: 'database' }),
        ],
      }),
    )

    expect(columns).toMatchObject([
      { index: 0, label: 'Services', nodeCount: 1 },
      { index: 1, label: 'Data', nodeCount: 1 },
    ])
  })

  it('supports multiple backend models in one layer', () => {
    const columns = getBuilderPreviewColumns(
      createRecipe({
        layers: [
          { id: 'services', label: 'Services' },
          { id: 'database', label: 'Data' },
        ],
        models: [
          createModel({
            id: 'svc-a',
            displayName: 'Service',
            layerId: 'services',
          }),
          createModel({
            id: 'svc-b',
            displayName: 'Endpoint',
            layerId: 'services',
          }),
          createModel({
            id: 'database',
            displayName: 'Database',
            layerId: 'database',
          }),
        ],
      }),
    )

    expect(columns).toHaveLength(2)
    expect(columns[0]).toMatchObject({ label: 'Services', nodeCount: 2 })
    expect(columns[1]).toMatchObject({ label: 'Data', nodeCount: 1 })
  })

  it('groups nodes by layer via shared layerId', () => {
    const nodes = getBuilderPreviewNodes(
      createRecipe({
        layers: [
          { id: 'services', label: 'Services' },
          { id: 'database', label: 'Data' },
        ],
        models: [
          createModel({
            id: 'svc-a',
            displayName: 'Service',
            layerId: 'services',
          }),
          createModel({
            id: 'svc-b',
            displayName: 'Endpoint',
            layerId: 'services',
          }),
          createModel({
            id: 'database',
            displayName: 'Database',
            layerId: 'database',
          }),
        ],
      }),
    )

    const serviceNodes = nodes.filter((n) => n.layerId === 'services')
    expect(serviceNodes).toHaveLength(2)
    expect(serviceNodes[0]!.layerLabel).toBe('Services')
    expect(serviceNodes[1]!.layerLabel).toBe('Services')
  })

  it('maps recipe edges to matching preview nodes', () => {
    const recipe = createRecipe({
      layers: [
        { id: 'service', label: 'Services' },
        { id: 'database', label: 'Data' },
      ],
      models: [
        createModel({
          id: 'service-model',
          displayName: 'Service',
          layerId: 'service',
        }),
        createModel({
          id: 'database-model',
          displayName: 'Data',
          layerId: 'database',
        }),
      ],
      edges: [
        {
          id: 'edge-service-data',
          from: 'Service',
          to: 'Data',
          fromModelId: 'service-model',
          toModelId: 'database-model',
          via: 'persists',
          auto: true,
          cost: 1,
        },
      ],
    })
    const nodes = getBuilderPreviewNodes(recipe)

    expect(getBuilderPreviewEdges(recipe, nodes)).toMatchObject([
      {
        id: 'edge-service-data',
        label: 'persists',
        from: { label: 'Service' },
        to: { label: 'Data' },
      },
    ])
  })

  it('adapts preview nodes and edges into canvas graph data', () => {
    const graph = getBuilderPreviewCanvasGraph(
      createRecipe({
        layers: [
          { id: 'service', label: 'Services' },
          { id: 'database', label: 'Data' },
        ],
        models: [
          createModel({
            id: 'service-model',
            displayName: 'Service',
            layerId: 'service',
          }),
          createModel({
            id: 'database-model',
            displayName: 'Data',
            layerId: 'database',
          }),
        ],
        edges: [
          {
            id: 'edge-service-data',
            from: 'Service',
            to: 'Data',
            fromModelId: 'service-model',
            toModelId: 'database-model',
            via: 'persists',
            auto: true,
            cost: 1,
          },
        ],
        filters: [
          {
            id: 'filter-service',
            layer: 'Service',
            expr: 'status = live',
            suggested: true,
          },
        ],
      }),
    )

    expect(graph.columns).toHaveLength(2)

    // First two nodes are ELK layer groups, then model nodes
    const groupNodes = graph.nodes.filter((n) => n.kind === 'group')
    const modelNodes = graph.nodes.filter((n) => n.kind === 'generation')
    expect(groupNodes).toHaveLength(2)
    expect(groupNodes).toMatchObject([
      { kind: 'group', shape: 'group', layoutMode: 'auto' },
      { kind: 'group', shape: 'group', layoutMode: 'auto' },
    ])
    expect(modelNodes).toMatchObject([
      { kind: 'generation', layoutMode: 'auto', shape: 'box' },
      { kind: 'generation', layoutMode: 'auto', shape: 'box' },
    ])
    // Model nodes reference their parent group
    expect(modelNodes[0]?.parentGroupId).toContain('service')
    expect(modelNodes[1]?.parentGroupId).toContain('database')
    expect(modelNodes[0]?.html).toContain('1 filter')

    expect(graph.edges).toMatchObject([
      {
        id: 'edge-service-data',
        kind: 'default',
        label: 'persists',
      },
    ])
    expect(graph.key).toContain('builder-preview-v3')
  })

  it('changes the canvas remount key only when preview graph inputs change', () => {
    const baseRecipe = createRecipe({
      layers: [{ id: 'service', label: 'Services' }],
      models: [
        createModel({
          id: 'service-model',
          displayName: 'Service',
          layerId: 'service',
        }),
      ],
      filters: [
        {
          id: 'filter-service',
          layer: 'Service',
          expr: 'status = live',
          suggested: true,
        },
      ],
    })

    const baseKey = getBuilderPreviewCanvasGraph(baseRecipe).key
    const changedFilterExpressionKey = getBuilderPreviewCanvasGraph({
      ...baseRecipe,
      filters: [
        {
          id: 'filter-service',
          layer: 'Service',
          expr: 'status = archived',
          suggested: true,
        },
      ],
    }).key
    const changedLayerKey = getBuilderPreviewCanvasGraph({
      ...baseRecipe,
      layers: [{ id: 'service', label: 'Applications' }],
    }).key

    expect(changedFilterExpressionKey).toBe(baseKey)
    expect(changedLayerKey).not.toBe(baseKey)
  })

  it('produces different key when model order changes within a layer', () => {
    const modelA = createModel({
      id: 'model-a',
      displayName: 'Alpha',
      layerId: 'layer-1',
    })
    const modelB = createModel({
      id: 'model-b',
      displayName: 'Beta',
      layerId: 'layer-1',
    })
    const modelC = createModel({
      id: 'model-c',
      displayName: 'Gamma',
      layerId: 'layer-1',
    })

    const originalRecipe = createRecipe({
      layers: [{ id: 'layer-1', label: 'L1' }],
      models: [modelA, modelB, modelC],
    })
    const reorderedRecipe = createRecipe({
      layers: [{ id: 'layer-1', label: 'L1' }],
      models: [modelB, modelA, modelC],
    })

    const originalGraph = getBuilderPreviewCanvasGraph(originalRecipe)
    const reorderedGraph = getBuilderPreviewCanvasGraph(reorderedRecipe)

    // Key must change so canvas remounts
    expect(reorderedGraph.key).not.toBe(originalGraph.key)

    // Model nodes (after group nodes) should swap: Alpha was first, now Beta is first
    const originalModels = originalGraph.nodes.filter(
      (n) => n.kind === 'generation',
    )
    const reorderedModels = reorderedGraph.nodes.filter(
      (n) => n.kind === 'generation',
    )
    expect(originalModels[0]?.html).toContain('Alpha')
    expect(originalModels[1]?.html).toContain('Beta')
    expect(reorderedModels[0]?.html).toContain('Beta')
    expect(reorderedModels[1]?.html).toContain('Alpha')
  })
})
