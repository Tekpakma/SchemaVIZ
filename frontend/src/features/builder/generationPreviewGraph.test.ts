import { describe, expect, it } from 'vitest'

import type { GenerationRunResponse } from './generationPreviewQuery'
import { getGenerationPreviewCanvasGraph } from './generationPreviewGraph'
import type { RecipeData } from './types'

function createRecipe(overrides: Partial<RecipeData> = {}): RecipeData {
  return {
    title: 'Preview',
    layers: [{ id: 'service', label: 'Services' }],
    models: [
      {
        id: 'model-service',
        appLabel: 'infra',
        appVerboseName: 'Infrastructure',
        modelName: 'server',
        modelId: 'infra.server',
        displayName: 'Server',
        layerId: 'service',
      },
    ],
    examples: [],
    edges: [],
    filters: [],
    groupRules: [],
    groupLayout: { mode: 'auto-pack' },
    styleDrafts: {},
    swatches: ['#111111'],
    layoutAlgorithm: 'Layered',
    layoutDirection: 'LR',
    shareSlug: '',
    promoteTarget: '',
    promoteVisibility: 'shared',
    promoteAudience: '',
    ...overrides,
  }
}

function createGenerationResponse(): GenerationRunResponse {
  return {
    mode: 'live',
    result: {
      nodes: [
        {
          id: 'node-server-1',
          appLabel: 'infra',
          modelName: 'server',
          recordPk: '1',
          label: 'Server 1',
          displayName: 'Server 1',
          fields: {
            hostname: 'api-01',
          },
          styleTemplateId: null,
          parentId: null,
          stepUiIds: ['model-service'],
        },
      ],
      edges: [],
    },
    sourceVersion: {
      kind: 'inline',
      selection: 'record',
      versionId: null,
      versionNumber: null,
      rootModel: 'infra.server',
    },
    styleTemplates: [],
    groupTemplates: [],
  } as unknown as GenerationRunResponse
}

describe('generation preview graph', () => {
  it('includes layout algorithm changes in the remount key', () => {
    const baseGraph = getGenerationPreviewCanvasGraph(
      createGenerationResponse(),
      createRecipe({ layoutAlgorithm: 'Layered' }),
    )
    const treeGraph = getGenerationPreviewCanvasGraph(
      createGenerationResponse(),
      createRecipe({ layoutAlgorithm: 'Tree' }),
    )

    expect(treeGraph.key).not.toBe(baseGraph.key)
  })

  it('includes layout direction changes in the remount key', () => {
    const baseGraph = getGenerationPreviewCanvasGraph(
      createGenerationResponse(),
      createRecipe({ layoutDirection: 'LR' }),
    )
    const topBottomGraph = getGenerationPreviewCanvasGraph(
      createGenerationResponse(),
      createRecipe({ layoutDirection: 'TB' }),
    )

    expect(topBottomGraph.key).not.toBe(baseGraph.key)
  })

  it('renders current style drafts over live generation nodes', () => {
    const recipe = createRecipe({
      styleDrafts: {
        'model-service': {
          sourceTemplateId: null,
          persistedTemplateId: null,
          name: 'Server node',
          textContent: {
            root: {
              children: [
                {
                  children: [
                    {
                      detail: 0,
                      format: 0,
                      mode: 'normal',
                      style: '',
                      text: 'Host ',
                      type: 'text',
                      version: 1,
                    },
                    {
                      path: 'hostname',
                      styles: {},
                      type: 'data-reference',
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
          },
          visualStyles: {},
          dimensions: { width: 260, height: 140 },
          typeSpecificData: {},
          dirty: true,
          saveState: 'idle',
        },
      },
    })

    const graph = getGenerationPreviewCanvasGraph(
      createGenerationResponse(),
      recipe,
    )
    const node = graph.nodes.find(
      (candidate) => candidate.id === 'node-server-1',
    )

    expect(node?.html).toContain('Host')
    expect(node?.html).toContain('api-01')
    expect(node?.html).toContain('background: #111111')
    expect(node).toMatchObject({ width: 260, height: 140 })
    expect(graph.layers).toMatchObject([
      { id: 'service', label: 'Services', nodeIds: ['node-server-1'] },
    ])
  })

  it('suppresses generated edges where grouping already expresses containment', () => {
    const response = createGenerationResponse()
    response.result.nodes = [
      {
        id: 'provider:1@root:group',
        appLabel: 'infra',
        modelName: 'cloudprovider',
        recordPk: '1',
        label: 'Provider',
        displayName: 'Provider',
        fields: {},
        styleTemplateId: null,
        parentId: null,
        isGroup: true,
        stepUiIds: ['provider'],
      },
      {
        id: 'region:1@provider:1@root:group:node',
        appLabel: 'infra',
        modelName: 'region',
        recordPk: '1',
        label: 'Region',
        displayName: 'Region',
        fields: {},
        styleTemplateId: null,
        parentId: 'provider:1@root:group',
        isGroup: false,
        stepUiIds: ['region'],
      },
    ]
    response.result.edges = [
      {
        source: 'provider:1@root:group',
        target: 'region:1@provider:1@root:group:node',
        relationship: 'regions',
      },
    ]

    const graph = getGenerationPreviewCanvasGraph(response)

    expect(graph.nodes).toMatchObject([
      { id: 'provider:1@root:group', kind: 'group' },
      {
        id: 'region:1@provider:1@root:group:node',
        parentGroupId: 'provider:1@root:group',
      },
    ])
    expect(graph.edges).toEqual([])
  })

  it('renders nested live groups while keeping breakout children at the root', () => {
    const response = createGenerationResponse()
    response.result.nodes = [
      {
        id: 'business:1@root:group',
        appLabel: 'infra',
        modelName: 'business',
        recordPk: '1',
        label: 'Business',
        displayName: 'Business',
        fields: {},
        styleTemplateId: null,
        parentId: null,
        isGroup: true,
        stepUiIds: ['business'],
      },
      {
        id: 'network:1@business:1@root:group:group',
        appLabel: 'infra',
        modelName: 'network',
        recordPk: '1',
        label: 'Network',
        displayName: 'Network',
        fields: {},
        styleTemplateId: null,
        parentId: 'business:1@root:group',
        isGroup: true,
        stepUiIds: ['network'],
      },
      {
        id: 'provider:1@root:node',
        appLabel: 'infra',
        modelName: 'provider',
        recordPk: '1',
        label: 'Provider',
        displayName: 'Provider',
        fields: {},
        styleTemplateId: null,
        parentId: null,
        isGroup: false,
        stepUiIds: ['provider'],
      },
    ]
    response.result.edges = [
      {
        source: 'business:1@root:group',
        target: 'network:1@business:1@root:group:group',
        relationship: 'networks',
      },
      {
        source: 'network:1@business:1@root:group:group',
        target: 'provider:1@root:node',
        relationship: 'provider',
      },
    ]

    const graph = getGenerationPreviewCanvasGraph(response)

    expect(graph.nodes).toMatchObject([
      {
        id: 'business:1@root:group',
        kind: 'group',
      },
      {
        id: 'network:1@business:1@root:group:group',
        kind: 'group',
        parentGroupId: 'business:1@root:group',
      },
      {
        id: 'provider:1@root:node',
        kind: 'generation',
      },
    ])
    expect(
      graph.nodes.find((node) => node.id === 'provider:1@root:node')
        ?.parentGroupId,
    ).toBeUndefined()
    expect(graph.edges).toMatchObject([
      {
        sourceNodeId: 'network:1@business:1@root:group:group',
        targetNodeId: 'provider:1@root:node',
        label: 'provider',
      },
    ])
  })
  it('attaches recipe group layout policy to live generated group nodes', () => {
    const recipe = createRecipe({
      models: [
        {
          id: 'business-group',
          appLabel: 'infra',
          appVerboseName: 'Infrastructure',
          modelName: 'businessgroup',
          modelId: 'infra.businessgroup',
          displayName: 'Business group',
          layerId: 'service',
        },
        {
          id: 'cloud-provider',
          appLabel: 'infra',
          appVerboseName: 'Infrastructure',
          modelName: 'cloudprovider',
          modelId: 'infra.cloudprovider',
          displayName: 'Cloud provider',
          layerId: 'service',
        },
      ],
      groupRules: [
        {
          id: 'group-cloud-providers',
          parentModelId: 'business-group',
          childModelId: 'cloud-provider',
          via: 'providers',
          mode: 'group',
          layout: {
            mode: 'auto-pack',
            maxColumns: 2,
            gapX: 16,
          },
        },
      ],
    })
    const response = createGenerationResponse()
    response.result.nodes = [
      {
        id: 'business-group:1@root:group',
        appLabel: 'infra',
        modelName: 'businessgroup',
        recordPk: '1',
        label: 'Business group',
        displayName: 'Business group',
        fields: {},
        styleTemplateId: null,
        parentId: null,
        isGroup: true,
        stepUiIds: ['business-group'],
      },
    ]

    const graph = getGenerationPreviewCanvasGraph(response, recipe)

    expect(graph.nodes[0]).toMatchObject({
      id: 'business-group:1@root:group',
      kind: 'group',
      groupLayout: {
        mode: 'auto-pack',
        maxColumns: 2,
        gapX: 16,
      },
    })
  })

  it('renders live generated group labels from recipe style drafts', () => {
    const recipe = createRecipe({
      models: [
        {
          id: 'business-group',
          appLabel: 'infra',
          appVerboseName: 'Infrastructure',
          modelName: 'businessgroup',
          modelId: 'infra.businessgroup',
          displayName: 'Business group',
          layerId: 'service',
        },
      ],
      styleDrafts: {
        'business-group': {
          sourceTemplateId: null,
          persistedTemplateId: null,
          name: 'Business group label',
          textContent: {
            root: {
              children: [
                {
                  children: [
                    {
                      detail: 0,
                      format: 0,
                      mode: 'normal',
                      style: '',
                      text: 'Group ',
                      type: 'text',
                      version: 1,
                    },
                    {
                      path: 'name',
                      styles: {},
                      type: 'data-reference',
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
          },
          visualStyles: {},
          dimensions: {},
          typeSpecificData: {},
          dirty: true,
          saveState: 'idle',
        },
      },
    })
    const response = createGenerationResponse()
    response.result.nodes = [
      {
        id: 'business-group:1@root:group',
        appLabel: 'infra',
        modelName: 'businessgroup',
        recordPk: '1',
        label: 'Business group',
        displayName: 'Business group',
        fields: { name: 'T-Systems' },
        styleTemplateId: null,
        parentId: null,
        isGroup: true,
        stepUiIds: ['business-group'],
      },
    ]

    const graph = getGenerationPreviewCanvasGraph(response, recipe)

    expect(graph.nodes[0]).toMatchObject({
      appLabel: 'infra',
      kind: 'group',
      modelName: 'businessgroup',
      recordId: '1',
    })
    expect(graph.nodes[0]?.html).toContain('Group')
    expect(graph.nodes[0]?.html).toContain('T-Systems')
    expect(graph.nodes[0]?.lexicalJson).toContain('data-reference')
  })
})
