import { describe, expect, it } from 'vitest'

import {
  getBuilderPreviewCanvasGraph,
  getBuilderPreviewColumns,
  getBuilderPreviewEdges,
  getBuilderPreviewNodes,
} from './builderPreviewLayout'
import type { RecipeData } from './types'

function createRecipe(overrides: Partial<RecipeData> = {}): RecipeData {
  return {
    title: 'Preview',
    layers: [],
    examples: [],
    edges: [],
    filters: [],
    swatches: ['#111111', '#222222'],
    layoutAlgorithm: 'Layered',
    promoteOrg: '',
    promoteVisibility: 'org-wide',
    promoteAudience: '',
    ...overrides,
  }
}

describe('builder preview layout', () => {
  it('uses recipe layers as preview nodes', () => {
    const nodes = getBuilderPreviewNodes(
      createRecipe({
        layers: [
          { id: 'service', label: 'Services' },
          { id: 'database', label: 'Data' },
        ],
      }),
    )

    expect(nodes).toMatchObject([
      { accent: '#111111', index: 0, label: 'Services' },
      { accent: '#222222', index: 1, label: 'Data' },
    ])
    expect(nodes[0]?.x).toBeLessThan(nodes[1]?.x ?? 0)
  })

  it('produces one column per unique layer label', () => {
    const columns = getBuilderPreviewColumns(
      createRecipe({
        layers: [
          { id: 'service', label: 'Services' },
          { id: 'database', label: 'Data' },
        ],
      }),
    )

    expect(columns).toMatchObject([
      { index: 0, label: 'Services', nodeCount: 1 },
      { index: 1, label: 'Data', nodeCount: 1 },
    ])
    expect(columns[0]?.x).toBeLessThan(columns[1]?.x ?? 0)
  })

  it('groups duplicate layer labels into a single column with multiple nodes', () => {
    const columns = getBuilderPreviewColumns(
      createRecipe({
        layers: [
          { id: 'svc-a', label: 'Services' },
          { id: 'svc-b', label: 'Services' },
          { id: 'database', label: 'Data' },
        ],
      }),
    )

    expect(columns).toHaveLength(2)
    expect(columns[0]).toMatchObject({ label: 'Services', nodeCount: 2 })
    expect(columns[1]).toMatchObject({ label: 'Data', nodeCount: 1 })
  })

  it('stacks nodes vertically when multiple models share a layer', () => {
    const nodes = getBuilderPreviewNodes(
      createRecipe({
        layers: [
          { id: 'svc-a', label: 'Services' },
          { id: 'svc-b', label: 'Services' },
          { id: 'database', label: 'Data' },
        ],
      }),
    )

    const serviceNodes = nodes.filter((n) => n.label.startsWith('Services'))
    expect(serviceNodes).toHaveLength(2)
    expect(serviceNodes[0]!.x).toBe(serviceNodes[1]!.x)
    expect(serviceNodes[0]!.y).toBeLessThan(serviceNodes[1]!.y)
  })

  it('maps recipe edges to matching preview nodes', () => {
    const recipe = createRecipe({
      layers: [
        { id: 'service', label: 'Services' },
        { id: 'database', label: 'Data' },
      ],
      edges: [
        {
          id: 'edge-service-data',
          from: 'Service',
          to: 'Data',
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
        from: { label: 'Services' },
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
        edges: [
          {
            id: 'edge-service-data',
            from: 'Service',
            to: 'Data',
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
    expect(graph.nodes).toMatchObject([
      {
        kind: 'generation',
        layoutMode: 'manual',
        shape: 'box',
      },
      {
        kind: 'generation',
        layoutMode: 'manual',
        shape: 'box',
      },
    ])
    expect(graph.nodes[0]?.html).toContain('1 filter')
    expect(graph.edges).toMatchObject([
      {
        id: 'edge-service-data',
        kind: 'default',
        label: 'persists',
      },
    ])
    expect(graph.key).toContain('builder-preview-v1')
  })

  it('changes the canvas remount key only when preview graph inputs change', () => {
    const baseRecipe = createRecipe({
      layers: [{ id: 'service', label: 'Services' }],
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
})
