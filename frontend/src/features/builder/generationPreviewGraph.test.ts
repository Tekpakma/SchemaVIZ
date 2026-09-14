import { describe, expect, it } from 'vitest'

import type { GenerationRunResponse } from './generationPreviewQuery'
import {
  bundleSharedLookupEdges,
  getGenerationPreviewCanvasGraph,
} from './generationPreviewGraph'
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

describe('bundleSharedLookupEdges', () => {
  const node = (
    id: string,
    modelName: string,
    parentId: string | null,
    isGroup = false,
  ) => ({
    id,
    appLabel: 'infra',
    modelName,
    recordPk: id,
    label: id,
    displayName: id,
    fields: {},
    styleTemplateId: null,
    parentId,
    isGroup,
    stepUiIds: [],
  })
  // Engineering > Production > {Subnet A > app, Subnet B > web}
  //             > Development > Subnet C > dev
  // All three servers run the same template, only two use the same owner.
  const nodes = [
    node('eng', 'businessgroup', null, true),
    node('prod', 'environment', 'eng', true),
    node('dev', 'environment', 'eng', true),
    node('subnet-a', 'subnet', 'prod', true),
    node('subnet-b', 'subnet', 'prod', true),
    node('subnet-c', 'subnet', 'dev', true),
    node('app', 'server', 'subnet-a'),
    node('web', 'server', 'subnet-b'),
    node('dev-01', 'server', 'subnet-c'),
    node('ubuntu', 'servertemplate', null),
    node('alice', 'person', null),
    node('bob', 'person', null),
  ]

  it('lifts a link shared by every record of a container to the outermost container', () => {
    const edges = bundleSharedLookupEdges(
      [
        { source: 'app', target: 'ubuntu', relationship: 'template' },
        { source: 'web', target: 'ubuntu', relationship: 'template' },
        { source: 'dev-01', target: 'ubuntu', relationship: 'template' },
      ],
      nodes,
    )

    expect(edges).toEqual([
      { source: 'eng', target: 'ubuntu', relationship: 'template' },
    ])
  })

  it('stops at the container whose records disagree and keeps lone edges', () => {
    const edges = bundleSharedLookupEdges(
      [
        { source: 'app', target: 'alice', relationship: 'owner' },
        { source: 'web', target: 'alice', relationship: 'owner' },
        { source: 'dev-01', target: 'bob', relationship: 'owner' },
      ],
      nodes,
    )

    expect(edges).toEqual([
      { source: 'prod', target: 'alice', relationship: 'owner' },
      { source: 'dev-01', target: 'bob', relationship: 'owner' },
    ])
  })

  it('leaves links to nested records and from root-level records alone', () => {
    const input = [
      { source: 'app', target: 'subnet-b', relationship: 'peer' },
      { source: 'alice', target: 'ubuntu', relationship: 'favourite' },
    ]

    expect(bundleSharedLookupEdges(input, nodes)).toEqual(input)
  })
})

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
    // The edge crosses the container wall, so it keeps its exact endpoints
    // and every container switches to the nested strategy that lets ELK
    // route between hierarchy levels.
    expect(graph.edges).toMatchObject([
      {
        sourceNodeId: 'network:1@business:1@root:group:group',
        targetNodeId: 'provider:1@root:node',
        label: 'provider',
      },
    ])
    expect(
      graph.nodes
        .filter((node) => node.kind === 'group')
        .map((node) => node.groupLayout),
    ).toEqual([{ strategy: 'nested' }, { strategy: 'nested' }])
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
