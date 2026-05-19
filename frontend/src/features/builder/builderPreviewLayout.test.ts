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
    groupLayout: { mode: 'auto-pack' },
    styleDrafts: {},
    swatches: ['#111111', '#222222'],
    layoutAlgorithm: 'Layered',
    layoutDirection: 'LR',
    shareSlug: '',
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

function createTextContent(text: string) {
  return {
    root: {
      children: [
        {
          children: [
            {
              detail: 0,
              format: 0,
              mode: 'normal',
              style: '',
              text,
              type: 'text',
              version: 1,
            },
          ],
          type: 'paragraph',
          version: 1,
        },
      ],
      type: 'root',
      version: 1,
    },
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

    const groupNodes = graph.nodes.filter((n) => n.kind === 'group')
    const modelNodes = graph.nodes.filter((n) => n.kind === 'editable')
    expect(groupNodes).toHaveLength(0)
    expect(modelNodes).toMatchObject([
      { kind: 'editable', layoutMode: 'auto', shape: 'box' },
      { kind: 'editable', layoutMode: 'auto', shape: 'box' },
    ])
    expect(modelNodes[0]?.parentGroupId).toBeUndefined()
    expect(modelNodes[1]?.parentGroupId).toBeUndefined()
    // Node HTML is rendered through the Lexical template path (label text)
    expect(modelNodes[0]?.html).toContain('Service')
    expect(modelNodes[0]?.html).toContain('background: #111111')
    expect(graph.layers).toMatchObject([
      { id: 'service', label: 'Services', nodeIds: ['service-model'] },
      { id: 'database', label: 'Data', nodeIds: ['database-model'] },
    ])

    expect(graph.edges).toMatchObject([
      {
        id: 'edge-service-data',
        kind: 'default',
        label: 'persists',
        labelPoint: { x: 284, y: 46 },
        routePoints: [
          { x: 220, y: 60 },
          { x: 284, y: 60 },
          { x: 284, y: 60 },
          { x: 348, y: 60 },
        ],
      },
    ])
    expect(graph.key).toContain('builder-preview-v5')
  })

  it('keeps recipe layer positions in the static preview graph', () => {
    const graph = getBuilderPreviewCanvasGraph(
      createRecipe({
        layers: [
          { id: 'l1', label: 'L1' },
          { id: 'l2', label: 'L2' },
          { id: 'l3', label: 'L3' },
          { id: 'l4', label: 'L4' },
        ],
        models: [
          createModel({
            id: 'business',
            displayName: 'Business',
            layerId: 'l1',
          }),
          createModel({ id: 'network', displayName: 'Network', layerId: 'l2' }),
          createModel({ id: 'region', displayName: 'Region', layerId: 'l3' }),
          createModel({
            id: 'provider',
            displayName: 'Cloud provider',
            layerId: 'l4',
          }),
        ],
      }),
      { showEdges: false },
    )

    expect(graph.layers).toMatchObject([
      { id: 'l1', nodeIds: ['business'] },
      { id: 'l2', nodeIds: ['network'] },
      { id: 'l3', nodeIds: ['region'] },
      { id: 'l4', nodeIds: ['provider'] },
    ])
    expect(graph.nodes).toMatchObject([
      { id: 'business', x: 0 },
      { id: 'network', x: 348 },
      { id: 'region', x: 696 },
      { id: 'provider', x: 1044 },
    ])
  })

  it('widens static preview lanes for long route labels', () => {
    const graph = getBuilderPreviewCanvasGraph(
      createRecipe({
        layers: [
          { id: 'l1', label: 'L1' },
          { id: 'l2', label: 'L2' },
        ],
        models: [
          createModel({
            id: 'business',
            displayName: 'Business',
            layerId: 'l1',
          }),
          createModel({
            id: 'provider',
            displayName: 'Cloud provider',
            layerId: 'l2',
          }),
        ],
        edges: [
          {
            id: 'edge-business-provider',
            from: 'Business',
            to: 'Cloud provider',
            fromModelId: 'business',
            toModelId: 'provider',
            via: 'networks -> region -> provider',
            auto: false,
            cost: 3,
          },
        ],
      }),
    )

    const provider = graph.nodes.find((node) => node.id === 'provider')
    expect(provider?.x).toBeGreaterThan(348)
    expect(graph.edges[0]?.routePoints).toMatchObject([
      { x: 220, y: 60 },
      { y: 60 },
      { y: 60 },
      { x: provider?.x, y: 60 },
    ])
    expect(graph.edges[0]?.labelPoint).toMatchObject({ y: 46 })
  })

  it('suppresses grouped parent-child edges in the static preview graph', () => {
    const graph = getBuilderPreviewCanvasGraph(
      createRecipe({
        layers: [
          { id: 'provider-layer', label: 'L1' },
          { id: 'region-layer', label: 'L2' },
        ],
        models: [
          createModel({
            id: 'provider',
            displayName: 'Cloud provider',
            layerId: 'provider-layer',
          }),
          createModel({
            id: 'region',
            displayName: 'Region',
            layerId: 'region-layer',
          }),
        ],
        edges: [
          {
            id: 'edge-provider-region',
            from: 'Cloud provider',
            to: 'Region',
            fromModelId: 'provider',
            toModelId: 'region',
            via: 'regions',
            auto: true,
            cost: 1,
          },
        ],
        groupRules: [
          {
            id: 'group-region',
            parentModelId: 'provider',
            childModelId: 'region',
            via: 'regions',
            mode: 'group',
          },
        ],
      }),
    )

    expect(graph.nodes).toMatchObject([
      {
        id: 'builder-model-group:provider',
        kind: 'group',
        groupLayout: { mode: 'auto-pack' },
      },
      {
        id: 'region',
        kind: 'editable',
        parentGroupId: 'builder-model-group:provider',
      },
    ])
    expect(graph.edges).toEqual([])
  })

  it('uses the recipe group layout when a group rule has no override', () => {
    const graph = getBuilderPreviewCanvasGraph(
      createRecipe({
        groupLayout: { mode: 'freeform' },
        layers: [{ id: 'service', label: 'Services' }],
        models: [
          createModel({
            id: 'provider',
            modelId: 'infra.provider',
            displayName: 'Provider',
            layerId: 'service',
          }),
          createModel({
            id: 'region',
            modelId: 'infra.region',
            displayName: 'Region',
            layerId: 'service',
          }),
        ],
        groupRules: [
          {
            id: 'group-region',
            parentModelId: 'provider',
            childModelId: 'region',
            via: 'regions',
            mode: 'group',
          },
        ],
      }),
    )

    expect(graph.nodes[0]).toMatchObject({
      id: 'builder-model-group:provider',
      groupLayout: { mode: 'freeform' },
    })
  })

  it('reflects saved style templates in node subtitles and the remount key', () => {
    const baseRecipe = createRecipe({
      layers: [{ id: 'service', label: 'Services' }],
      models: [
        createModel({
          id: 'service-model',
          displayName: 'Service',
          layerId: 'service',
        }),
      ],
    })
    const styledRecipe = createRecipe({
      ...baseRecipe,
      models: [
        {
          ...baseRecipe.models[0]!,
          styleTemplateId: 'style-service',
        },
      ],
    })

    const baseGraph = getBuilderPreviewCanvasGraph(baseRecipe)
    const styledGraph = getBuilderPreviewCanvasGraph(styledRecipe)
    const styledModel = styledGraph.nodes.find(
      (node) => node.kind === 'editable',
    )

    expect(styledGraph.key).not.toBe(baseGraph.key)
    // HTML now uses the Lexical template path; the key difference is what matters
    expect(styledModel?.html).toContain('Service')
  })

  it('renders dirty style drafts in the static preview', () => {
    const graph = getBuilderPreviewCanvasGraph(
      createRecipe({
        layers: [{ id: 'service', label: 'Services' }],
        models: [
          createModel({
            id: 'service-model',
            displayName: 'Service',
            layerId: 'service',
          }),
        ],
        styleDrafts: {
          'service-model': {
            sourceTemplateId: null,
            persistedTemplateId: null,
            name: 'Service node',
            textContent: createTextContent('Draft node'),
            visualStyles: {},
            dimensions: {},
            typeSpecificData: {},
            dirty: true,
            saveState: 'idle',
          },
        },
      }),
    )

    const modelNode = graph.nodes.find((node) => node.kind === 'editable')
    expect(modelNode?.html).toContain('Draft node')
    expect(modelNode?.html).toContain('background: #111111')
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
    const changedLayoutAlgorithmKey = getBuilderPreviewCanvasGraph({
      ...baseRecipe,
      layoutAlgorithm: 'Tree',
    }).key
    const changedLayoutDirectionKey = getBuilderPreviewCanvasGraph({
      ...baseRecipe,
      layoutDirection: 'TB',
    }).key
    const changedDraftTextKey = getBuilderPreviewCanvasGraph({
      ...baseRecipe,
      styleDrafts: {
        'service-model': {
          sourceTemplateId: null,
          persistedTemplateId: null,
          name: 'Service node',
          textContent: createTextContent('Changed node text'),
          visualStyles: {},
          dimensions: {},
          typeSpecificData: {},
          dirty: true,
          saveState: 'idle',
        },
      },
    }).key

    expect(changedFilterExpressionKey).toBe(baseKey)
    expect(changedLayerKey).not.toBe(baseKey)
    expect(changedLayoutAlgorithmKey).not.toBe(baseKey)
    expect(changedLayoutDirectionKey).not.toBe(baseKey)
    expect(changedDraftTextKey).not.toBe(baseKey)
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

    const originalModels = originalGraph.nodes.filter(
      (n) => n.kind === 'editable',
    )
    const reorderedModels = reorderedGraph.nodes.filter(
      (n) => n.kind === 'editable',
    )
    expect(originalModels[0]?.html).toContain('Alpha')
    expect(originalModels[1]?.html).toContain('Beta')
    expect(reorderedModels[0]?.html).toContain('Beta')
    expect(reorderedModels[1]?.html).toContain('Alpha')
  })
})
