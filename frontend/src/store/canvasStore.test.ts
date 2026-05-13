import { beforeEach, describe, expect, it } from 'vitest'

import {
  getActiveCanvasTabIdSnapshot,
  getCanvasActionsSnapshot,
  getCanvasExportSnapshot,
  getCanvasLayoutSnapshot,
  getCanvasTabActionsSnapshot,
  resetCanvasStoreForTests,
} from './canvasStore'
import type { CanvasEdge, CanvasNode } from '@/features/canvas/model/types'

const nodes: Array<CanvasNode> = [
  {
    id: 'a',
    kind: 'editable',
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
    kind: 'editable',
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
    resetCanvasStoreForTests()
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

describe('canvasStore document tabs', () => {
  beforeEach(() => {
    resetCanvasStoreForTests()
    getCanvasActionsSnapshot().setGraph({
      nodes,
      edges,
    })
  })

  it('creates, switches, renames, marks, and closes canvas tabs', () => {
    const tabActions = getCanvasTabActionsSnapshot()
    const firstTabId = getActiveCanvasTabIdSnapshot()
    const secondTabId = tabActions.createTab({
      label: 'Schema draft',
      nodes: [],
      edges: [],
    })

    expect(getActiveCanvasTabIdSnapshot()).toBe(secondTabId)

    tabActions.renameTab(secondTabId, 'Schema draft v2')
    tabActions.markTabDirty(secondTabId)
    expect(getCanvasExportSnapshot().nodeOrder).toEqual([])

    tabActions.switchTab(firstTabId)
    expect(getActiveCanvasTabIdSnapshot()).toBe(firstTabId)
    expect(getCanvasExportSnapshot().nodeOrder).toEqual(['a', 'b'])

    tabActions.closeTab(firstTabId)
    expect(getActiveCanvasTabIdSnapshot()).toBe(firstTabId)

    tabActions.closeTab(secondTabId)
    expect(getActiveCanvasTabIdSnapshot()).toBe(firstTabId)
    expect(getCanvasExportSnapshot().nodeOrder).toEqual(['a', 'b'])
  })

  it('isolates graph and viewport state by tab', () => {
    const tabActions = getCanvasTabActionsSnapshot()
    const firstTabId = getActiveCanvasTabIdSnapshot()
    const secondTabId = tabActions.createTab({
      nodes: [
        {
          ...nodes[0]!,
          id: 'c',
          x: 10,
          y: 20,
        },
      ],
      edges: [],
      viewport: {
        x: 25,
        y: 35,
        scale: 1.5,
      },
    })

    getCanvasActionsSnapshot().moveNode({
      id: 'c',
      x: 80,
      y: 90,
    })
    getCanvasActionsSnapshot().setViewport({
      x: 100,
      y: 120,
      scale: 2,
    })

    expect(getCanvasExportSnapshot().nodesById.c).toMatchObject({
      x: 80,
      y: 90,
    })
    expect(getCanvasExportSnapshot().viewport).toEqual({
      x: 100,
      y: 120,
      scale: 2,
    })

    tabActions.switchTab(firstTabId)
    expect(getCanvasExportSnapshot().nodesById.a).toMatchObject({
      x: 0,
      y: 0,
    })
    expect(getCanvasExportSnapshot().viewport).toEqual({
      x: 0,
      y: 0,
      scale: 1,
    })

    tabActions.switchTab(secondTabId)
    expect(getCanvasExportSnapshot().nodeOrder).toEqual(['c'])
  })

  it('returns active-document snapshots only', () => {
    const tabActions = getCanvasTabActionsSnapshot()
    const firstTabId = getActiveCanvasTabIdSnapshot()
    const secondTabId = tabActions.createTab({
      label: 'Other canvas',
      nodes: [
        {
          ...nodes[0]!,
          id: 'other',
        },
      ],
      edges: [],
    })

    expect(getCanvasLayoutSnapshot().nodeOrder).toEqual(['other'])
    expect(getCanvasExportSnapshot().nodeOrder).toEqual(['other'])

    tabActions.switchTab(firstTabId)
    expect(getCanvasLayoutSnapshot().nodeOrder).toEqual(['a', 'b'])
    expect(getCanvasExportSnapshot(secondTabId).nodeOrder).toEqual(['other'])
  })

  it('can apply stale layout results back to their source tab', () => {
    const tabActions = getCanvasTabActionsSnapshot()
    const firstTabId = getActiveCanvasTabIdSnapshot()
    const secondTabId = tabActions.createTab({
      nodes: [
        {
          ...nodes[0]!,
          id: 'c',
        },
      ],
      edges: [],
    })

    expect(getActiveCanvasTabIdSnapshot()).toBe(secondTabId)

    getCanvasActionsSnapshot().applyGraphLayout(
      {
        nodeFrames: [
          {
            id: 'a',
            x: 300,
            y: 400,
            width: 140,
            height: 100,
          },
        ],
        edgeRoutes: [],
      },
      { tabId: firstTabId },
    )

    expect(getActiveCanvasTabIdSnapshot()).toBe(secondTabId)
    expect(getCanvasExportSnapshot().nodesById.c).toBeDefined()
    expect(getCanvasExportSnapshot().nodesById.a).toBeUndefined()

    tabActions.switchTab(firstTabId)
    expect(getCanvasExportSnapshot().nodesById.a).toMatchObject({
      x: 300,
      y: 400,
      width: 140,
      height: 100,
    })
  })
})
