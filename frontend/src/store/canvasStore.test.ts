import { beforeEach, describe, expect, it } from 'vitest'

import {
  getCanvasActionsSnapshot,
  getCanvasLayoutSnapshot,
} from './canvasStore'
import type { CanvasEdge, CanvasNode } from '@/features/canvas/model/types'

const nodes: Array<CanvasNode> = [
  {
    id: 'a',
    shape: 'box',
    layoutMode: 'auto',
    appLabel: 'inventory',
    modelName: 'product',
    x: 0,
    y: 0,
    width: 100,
    height: 80,
    lexicalJson: '',
    html: '',
    contentHeight: 0,
    version: 1,
  },
  {
    id: 'b',
    shape: 'box',
    layoutMode: 'auto',
    appLabel: 'inventory',
    modelName: 'category',
    x: 200,
    y: 0,
    width: 100,
    height: 80,
    lexicalJson: '',
    html: '',
    contentHeight: 0,
    version: 1,
  },
]

const edges: Array<CanvasEdge> = [
  {
    id: 'a-b',
    sourceNodeId: 'a',
    targetNodeId: 'b',
    kind: 'default',
    routePoints: [
      { x: 100, y: 40 },
      { x: 200, y: 40 },
    ],
  },
]

describe('canvasStore graph layout actions', () => {
  beforeEach(() => {
    getCanvasActionsSnapshot().setGraph({
      nodes,
      edges,
    })
  })

  it('replaces graph nodes and edges', () => {
    const snapshot = getCanvasLayoutSnapshot()

    expect(snapshot.nodeOrder).toEqual(['a', 'b'])
    expect(snapshot.edgeOrder).toEqual(['a-b'])
    expect(snapshot.edgesById['a-b']?.sourceNodeId).toBe('a')
  })

  it('applies node frames and edge routes', () => {
    getCanvasActionsSnapshot().applyGraphLayout({
      nodeFrames: [
        {
          id: 'a',
          x: 20,
          y: 30,
          width: 120,
          height: 90,
        },
      ],
      edgeRoutes: [
        {
          id: 'a-b',
          points: [
            { x: 140, y: 75 },
            { x: 220, y: 75 },
          ],
        },
      ],
    })

    const snapshot = getCanvasLayoutSnapshot()
    expect(snapshot.nodesById.a).toMatchObject({
      x: 20,
      y: 30,
      width: 120,
      height: 90,
      layoutMode: 'auto',
    })
    expect(snapshot.edgesById['a-b']?.routePoints).toEqual([
      { x: 140, y: 75 },
      { x: 220, y: 75 },
    ])
  })

  it('clears connected edge routes and materializes fixed ports when a node moves', () => {
    getCanvasActionsSnapshot().moveNode({
      id: 'a',
      x: 40,
      y: 50,
    })

    const snapshot = getCanvasLayoutSnapshot()

    expect(snapshot.edgesById['a-b']?.routePoints).toBeUndefined()
    expect(snapshot.nodesById.a?.layoutMode).toBe('manual')
    expect(snapshot.edgesById['a-b']).toMatchObject({
      sourcePort: {
        side: 'RIGHT',
        slot: 0,
        slotCount: 1,
      },
      targetPort: {
        side: 'LEFT',
        slot: 0,
        slotCount: 1,
      },
    })
  })

  it('keeps sliding ports when routing authority is auto', () => {
    const actions = getCanvasActionsSnapshot()

    actions.setRoutingAuthority('auto')
    actions.moveNode({
      id: 'a',
      x: 40,
      y: 50,
    })

    const snapshot = getCanvasLayoutSnapshot()

    expect(snapshot.nodesById.a?.layoutMode).toBe('manual')
    expect(snapshot.edgesById['a-b']?.sourcePort).toBeUndefined()
    expect(snapshot.edgesById['a-b']?.targetPort).toBeUndefined()
  })

  it('recomputes routes and explicit ports when routing authority changes', () => {
    getCanvasActionsSnapshot().setGraph({
      nodes,
      edges: [
        {
          id: 'a-b',
          sourceNodeId: 'a',
          targetNodeId: 'b',
          kind: 'default',
          routePoints: [
            { x: 100, y: 40 },
            { x: 200, y: 40 },
          ],
          sourcePort: {
            side: 'RIGHT',
            slot: 0,
            slotCount: 1,
          },
          targetPort: {
            side: 'LEFT',
            slot: 0,
            slotCount: 1,
          },
        },
      ],
    })

    const actions = getCanvasActionsSnapshot()

    actions.setRoutingAuthority('auto')

    let snapshot = getCanvasLayoutSnapshot()

    expect(snapshot.edgesById['a-b']?.routePoints).toBeUndefined()
    expect(snapshot.edgesById['a-b']?.sourcePort).toBeUndefined()
    expect(snapshot.edgesById['a-b']?.targetPort).toBeUndefined()

    actions.setRoutingAuthority('manual')

    snapshot = getCanvasLayoutSnapshot()

    expect(snapshot.edgesById['a-b']?.sourcePort).toEqual({
      side: 'RIGHT',
      slot: 0,
      slotCount: 1,
    })
    expect(snapshot.edgesById['a-b']?.targetPort).toEqual({
      side: 'LEFT',
      slot: 0,
      slotCount: 1,
    })
  })

  it('returns nodes to auto layout and clears fixed ports after applying graph layout', () => {
    getCanvasActionsSnapshot().moveNode({
      id: 'a',
      x: 40,
      y: 50,
    })

    getCanvasActionsSnapshot().applyGraphLayout({
      nodeFrames: [
        {
          id: 'a',
          x: 10,
          y: 20,
          width: 100,
          height: 80,
        },
        {
          id: 'b',
          x: 200,
          y: 0,
          width: 100,
          height: 80,
        },
      ],
      edgeRoutes: [
        {
          id: 'a-b',
          points: [
            { x: 110, y: 60 },
            { x: 200, y: 40 },
          ],
        },
      ],
    })

    const snapshot = getCanvasLayoutSnapshot()

    expect(snapshot.nodesById.a?.layoutMode).toBe('auto')
    expect(snapshot.nodesById.b?.layoutMode).toBe('auto')
    expect(snapshot.edgesById['a-b']?.sourcePort).toBeUndefined()
    expect(snapshot.edgesById['a-b']?.targetPort).toBeUndefined()
  })
})
