import { describe, expect, it } from 'vitest'
import type { ElkNode } from 'elkjs/lib/elk-api'

import {
  createFallbackEdgeRoute,
  createCanvasLayoutInputFromGraph,
  createElkGraph,
  createGraphLayoutResult,
  createSchemaCanvasGraph,
  getCanvasFlowDirection,
} from './layoutAdapters'
import type { CanvasEditableNode, CanvasEdge, CanvasNode } from './model/types'

const baseNode = {
  kind: 'editable',
  shape: 'box',
  layoutMode: 'auto',
  appLabel: 'inventory',
  modelName: 'product',
  lexicalJson: '',
  html: '',
  contentHeight: 0,
  version: 1,
} satisfies Pick<
  CanvasEditableNode,
  | 'kind'
  | 'appLabel'
  | 'contentHeight'
  | 'html'
  | 'layoutMode'
  | 'lexicalJson'
  | 'modelName'
  | 'shape'
  | 'version'
>

describe('layoutAdapters', () => {
  it('derives flow direction from ELK layout options', () => {
    expect(getCanvasFlowDirection()).toBe('LR')
    expect(getCanvasFlowDirection('BT')).toBe('BT')
    expect(getCanvasFlowDirection(undefined, { 'elk.direction': 'LEFT' })).toBe(
      'RL',
    )
    expect(getCanvasFlowDirection(undefined, { 'elk.direction': 'DOWN' })).toBe(
      'TB',
    )
    expect(getCanvasFlowDirection(undefined, { 'elk.direction': 'UP' })).toBe(
      'BT',
    )
  })

  it('creates ELK children and edges from flat canvas state', () => {
    const nodes: Array<CanvasNode> = [
      {
        ...baseNode,
        id: 'a',
        x: 0,
        y: 0,
        width: 100,
        height: 80,
      },
      {
        ...baseNode,
        id: 'b',
        x: 200,
        y: 0,
        width: 100,
        height: 80,
      },
    ]
    const edges: Array<CanvasEdge> = [
      {
        id: 'a-b',
        sourceNodeId: 'a',
        targetNodeId: 'b',
        kind: 'default',
      },
    ]

    const graph = createElkGraph(
      createCanvasLayoutInputFromGraph({ nodes, edges }, 'LR'),
    )

    expect(graph.children?.map((node) => node.id)).toEqual(['a', 'b'])
    expect(graph.layoutOptions?.['elk.direction']).toBe('RIGHT')
    expect(graph.children?.[0]?.layoutOptions).toEqual({
      'org.eclipse.elk.portConstraints': 'FIXED_SIDE',
    })
    expect(graph.children?.[0]?.ports?.map((port) => port.id)).toEqual([
      'a:port:LEFT',
      'a:port:RIGHT',
      'a:port:TOP',
      'a:port:BOTTOM',
    ])
    expect(graph.edges).toEqual([
      {
        id: 'a-b',
        sources: ['a:port:RIGHT'],
        targets: ['b:port:LEFT'],
      },
    ])
  })

  it('maps explicit flow direction to ELK direction independent of layout options', () => {
    const nodes: Array<CanvasNode> = [
      {
        ...baseNode,
        id: 'a',
        x: 0,
        y: 0,
        width: 100,
        height: 80,
      },
      {
        ...baseNode,
        id: 'b',
        x: 0,
        y: 200,
        width: 100,
        height: 80,
      },
    ]
    const edges: Array<CanvasEdge> = [
      {
        id: 'a-b',
        sourceNodeId: 'a',
        targetNodeId: 'b',
        kind: 'default',
      },
    ]

    const graph = createElkGraph(
      createCanvasLayoutInputFromGraph({ nodes, edges }, 'TB', {
        'elk.direction': 'LEFT',
      }),
    )

    expect(graph.layoutOptions?.['elk.direction']).toBe('DOWN')
    expect(graph.edges).toEqual([
      {
        id: 'a-b',
        sources: ['a:port:BOTTOM'],
        targets: ['b:port:TOP'],
      },
    ])
  })

  it('omits ancestor-descendant containment edges from ELK layout input', () => {
    const nodes: Array<CanvasNode> = [
      {
        id: 'group',
        kind: 'group',
        shape: 'group',
        layoutMode: 'auto',
        x: 0,
        y: 0,
        width: 220,
        height: 160,
        lexicalJson: '',
        html: '',
        contentHeight: 0,
        version: 1,
      },
      {
        ...baseNode,
        id: 'child',
        parentGroupId: 'group',
        x: 0,
        y: 0,
        width: 100,
        height: 80,
      },
    ]
    const edges: Array<CanvasEdge> = [
      {
        id: 'group-child',
        sourceNodeId: 'group',
        targetNodeId: 'child',
        kind: 'default',
      },
    ]

    const graph = createElkGraph(
      createCanvasLayoutInputFromGraph({ nodes, edges }, 'LR'),
    )

    expect(graph.edges).toEqual([])
  })

  it('delegates group child layout to ELK via SEPARATE_CHILDREN + rectpacking', () => {
    const childNodes: Array<CanvasNode> = Array.from(
      { length: 5 },
      (_, index) => ({
        ...baseNode,
        id: `child-${index + 1}`,
        parentGroupId: 'group',
        x: 0,
        y: 0,
        width: 100,
        height: 80,
      }),
    )
    const nodes: Array<CanvasNode> = [
      {
        id: 'group',
        kind: 'group',
        shape: 'group',
        layoutMode: 'auto',
        x: 0,
        y: 0,
        width: 220,
        height: 160,
        lexicalJson: '',
        html: '',
        contentHeight: 0,
        version: 1,
      },
      ...childNodes,
    ]

    const graph = createElkGraph(
      createCanvasLayoutInputFromGraph({ nodes, edges: [] }, 'LR'),
    )
    const group = graph.children?.[0]

    // Group sizing is now ELK's job — we don't preset width/height so ELK
    // computes them from the rectpacking pass during layout.
    expect(group).toMatchObject({
      id: 'group',
      layoutOptions: {
        'elk.algorithm': 'rectpacking',
        'elk.hierarchyHandling': 'SEPARATE_CHILDREN',
        'elk.aspectRatio': '1.35',
      },
    })
    expect(group?.width).toBeUndefined()
    expect(group?.height).toBeUndefined()
    expect(group?.children?.map((child) => child.id)).toEqual([
      'child-1',
      'child-2',
      'child-3',
      'child-4',
      'child-5',
    ])
  })

  it('uses layered algorithm when group children have internal edges', () => {
    const childNodes: Array<CanvasNode> = Array.from(
      { length: 3 },
      (_, index) => ({
        ...baseNode,
        id: `child-${index + 1}`,
        parentGroupId: 'group',
        x: 0,
        y: 0,
        width: 100,
        height: 80,
      }),
    )
    const nodes: Array<CanvasNode> = [
      {
        id: 'group',
        kind: 'group',
        shape: 'group',
        layoutMode: 'auto',
        x: 0,
        y: 0,
        width: 220,
        height: 160,
        lexicalJson: '',
        html: '',
        contentHeight: 0,
        version: 1,
      },
      ...childNodes,
    ]
    const internalEdge: CanvasEdge = {
      id: 'child-1-child-2',
      sourceNodeId: 'child-1',
      targetNodeId: 'child-2',
      kind: 'relation',
    }

    const graph = createElkGraph(
      createCanvasLayoutInputFromGraph(
        { nodes, edges: [internalEdge] },
        'LR',
      ),
    )
    const group = graph.children?.[0]

    expect(group?.layoutOptions).toMatchObject({
      'elk.algorithm': 'layered',
      'elk.hierarchyHandling': 'SEPARATE_CHILDREN',
    })
  })

  it('creates fallback routes from flow-direction-based default sides', () => {
    const nodes: Record<string, CanvasNode> = {
      source: {
        ...baseNode,
        id: 'source',
        x: 0,
        y: 0,
        width: 100,
        height: 80,
      },
      target: {
        ...baseNode,
        id: 'target',
        x: 0,
        y: 200,
        width: 100,
        height: 80,
      },
    }
    const edge: CanvasEdge = {
      id: 'source-target',
      sourceNodeId: 'source',
      targetNodeId: 'target',
      kind: 'default',
    }

    expect(
      createFallbackEdgeRoute(edge, nodes, 'TB', { 'elk.direction': 'LEFT' }),
    ).toEqual([
      { x: 50, y: 80 },
      { x: 50, y: 140 },
      { x: 50, y: 200 },
    ])
  })

  it('prefers explicit edge port sides over flow defaults', () => {
    const nodes: Record<string, CanvasNode> = {
      source: {
        ...baseNode,
        id: 'source',
        x: 0,
        y: 0,
        width: 100,
        height: 80,
      },
      target: {
        ...baseNode,
        id: 'target',
        x: 200,
        y: 200,
        width: 100,
        height: 80,
      },
    }
    const edge: CanvasEdge = {
      id: 'source-target',
      sourceNodeId: 'source',
      targetNodeId: 'target',
      kind: 'default',
      sourcePort: {
        side: 'BOTTOM',
      },
      targetPort: {
        side: 'TOP',
      },
    }

    expect(createFallbackEdgeRoute(edge, nodes)).toEqual([
      { x: 50, y: 80 },
      { x: 150, y: 80 },
      { x: 150, y: 200 },
      { x: 250, y: 200 },
    ])
  })

  it('distributes explicit ports across side lanes when slots are assigned', () => {
    const nodes: Record<string, CanvasNode> = {
      source: {
        ...baseNode,
        id: 'source',
        x: 0,
        y: 0,
        width: 100,
        height: 90,
      },
      target: {
        ...baseNode,
        id: 'target',
        x: 200,
        y: 0,
        width: 100,
        height: 90,
      },
    }
    const edge: CanvasEdge = {
      id: 'source-target',
      sourceNodeId: 'source',
      targetNodeId: 'target',
      kind: 'default',
      sourcePort: {
        side: 'RIGHT',
        slot: 0,
        slotCount: 2,
      },
      targetPort: {
        side: 'LEFT',
        slot: 1,
        slotCount: 2,
      },
    }

    expect(createFallbackEdgeRoute(edge, nodes)).toEqual([
      { x: 100, y: 30 },
      { x: 150, y: 30 },
      { x: 150, y: 60 },
      { x: 200, y: 60 },
    ])
  })

  it('accumulates compound node offsets from ELK output', () => {
    const laidOutGraph: ElkNode = {
      id: 'root',
      children: [
        {
          id: 'group',
          x: 40,
          y: 60,
          width: 300,
          height: 220,
          children: [
            {
              id: 'child',
              x: 24,
              y: 36,
              width: 120,
              height: 80,
            },
          ],
        },
      ],
      edges: [
        {
          id: 'edge',
          sources: ['child'],
          targets: ['target'],
          sections: [
            {
              id: 'section',
              startPoint: { x: 164, y: 136 },
              bendPoints: [{ x: 220, y: 136 }],
              endPoint: { x: 220, y: 300 },
            },
          ],
        },
      ],
    }

    expect(createGraphLayoutResult(laidOutGraph)).toEqual({
      nodeFrames: [
        {
          id: 'group',
          x: 40,
          y: 60,
          width: 300,
          height: 220,
        },
        {
          id: 'child',
          x: 64,
          y: 96,
          width: 120,
          height: 80,
        },
      ],
      edgeRoutes: [
        {
          id: 'edge',
          points: [
            { x: 184, y: 136 },
            { x: 220, y: 136 },
            { x: 220, y: 300 },
          ],
        },
      ],
    })
  })

  it('preserves ELK edge label positions as canvas label points', () => {
    const laidOutGraph: ElkNode = {
      id: 'root',
      edges: [
        {
          id: 'edge',
          sources: ['source'],
          targets: ['target'],
          labels: [
            {
              id: 'edge:label',
              text: 'relates',
              x: 150,
              y: 88,
              width: 30,
              height: 14,
            },
          ],
          sections: [
            {
              id: 'section',
              startPoint: { x: 100, y: 100 },
              endPoint: { x: 240, y: 100 },
            },
          ],
        },
      ],
    }

    expect(createGraphLayoutResult(laidOutGraph).edgeRoutes).toEqual([
      {
        id: 'edge',
        labelPoint: { x: 165, y: 95 },
        points: [
          { x: 100, y: 100 },
          { x: 240, y: 100 },
        ],
      },
    ])
  })

  it('ignores placeholder ELK edge label positions so route midpoint fallback can render labels', () => {
    const laidOutGraph: ElkNode = {
      id: 'root',
      edges: [
        {
          id: 'edge',
          sources: ['source'],
          targets: ['target'],
          labels: [
            {
              id: 'edge:label',
              text: 'relates',
              x: 0,
              y: 0,
              width: 30,
              height: 14,
            },
          ],
          sections: [
            {
              id: 'section',
              startPoint: { x: 100, y: 100 },
              endPoint: { x: 240, y: 100 },
            },
          ],
        },
      ],
    }

    expect(createGraphLayoutResult(laidOutGraph).edgeRoutes).toEqual([
      {
        id: 'edge',
        points: [
          { x: 100, y: 100 },
          { x: 240, y: 100 },
        ],
      },
    ])
  })

  it('clips edge route endpoints to node boundaries', () => {
    const laidOutGraph: ElkNode = {
      id: 'root',
      children: [
        {
          id: 'source',
          x: 40,
          y: 60,
          width: 100,
          height: 80,
        },
        {
          id: 'target',
          x: 240,
          y: 60,
          width: 100,
          height: 80,
        },
      ],
      edges: [
        {
          id: 'edge',
          sources: ['source'],
          targets: ['target'],
          sections: [
            {
              id: 'section',
              startPoint: { x: 90, y: 100 },
              bendPoints: [{ x: 160, y: 100 }],
              endPoint: { x: 290, y: 100 },
            },
          ],
        },
      ],
    }

    expect(createGraphLayoutResult(laidOutGraph).edgeRoutes).toEqual([
      {
        id: 'edge',
        points: [
          { x: 140, y: 100 },
          { x: 160, y: 100 },
          { x: 240, y: 100 },
        ],
      },
    ])
  })

  it('adapts schema graph groups, model nodes, and relation kinds', () => {
    const graph = createSchemaCanvasGraph({
      schemaHash: 'hash',
      groups: [{ id: 'inventory', name: 'inventory' }],
      nodes: [
        {
          id: 'inventory.Product',
          name: 'Product',
          group: 'inventory',
          isProxy: false,
          isAbstract: false,
          primaryKey: 'id',
          appLabel: 'inventory',
          modelName: 'product',
          fields: [['id', 'AutoField']],
        },
        {
          id: 'inventory.Category',
          name: 'Category',
          group: 'inventory',
          isProxy: false,
          isAbstract: false,
          primaryKey: 'id',
          appLabel: 'inventory',
          modelName: 'category',
          fields: [['id', 'AutoField']],
        },
      ],
      edges: [
        {
          source: 'inventory.Product',
          target: 'inventory.Category',
          sourceField: 'category',
          isForeignKey: true,
        },
      ],
    })

    expect(graph.nodes.map((node) => node.id)).toEqual([
      'schema-group:inventory',
      'inventory.Product',
      'inventory.Category',
    ])
    expect(graph.nodes[1]?.parentGroupId).toBe('schema-group:inventory')
    expect(graph.nodes[0]?.html).toContain('inventory')
    expect(graph.nodes[0]?.contentHeight).toBeGreaterThan(0)
    expect(graph.edges[0]).toMatchObject({
      sourceNodeId: 'inventory.Product',
      targetNodeId: 'inventory.Category',
      kind: 'foreign-key',
      label: 'category',
    })
  })
})
