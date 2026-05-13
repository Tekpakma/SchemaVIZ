import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import type {
  CanvasEdge,
  CanvasFlowDirection,
  CanvasGraphLayoutResult,
  CanvasNode,
  CanvasNodeLayoutMode,
  CanvasPortSide,
  CanvasRoutingAuthorityMode,
  EdgeId,
  NodeId,
} from '@/features/canvas/model/types'
import { useShallow } from 'zustand/react/shallow'
import { getCanvasNodeShapeDefinition } from '@/features/canvas/nodeShapes'
import type { CanvasLayoutInput } from '@/features/canvas/layout.schemas'
import {
  DEFAULT_CANVAS_EDGES,
  DEFAULT_CANVAS_NODES,
} from '@/features/canvas/constants'
import {
  DEFAULT_CANVAS_FLOW_DIRECTION,
  DEFAULT_ELK_LAYOUT_OPTIONS,
  resolveEdgePortSide,
} from '@/features/canvas/layoutAdapters'
import type { LayoutOptions } from 'elkjs/lib/elk-api'
import * as R from 'remeda'

const GROUP_NODE_PADDING = 24
const MAIN_CANVAS_TAB_ID = 'main'
const INITIAL_CANVAS_TAB_LABEL = 'Untitled 1'

function createNodeId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`
}

function createCanvasTabId() {
  return `canvas-${crypto.randomUUID().slice(0, 8)}`
}

/** Computes the axis-aligned bounding box enclosing all given nodes. */
function getNodeBounds(nodes: Array<CanvasNode>) {
  let left = Number.POSITIVE_INFINITY
  let top = Number.POSITIVE_INFINITY
  let right = Number.NEGATIVE_INFINITY
  let bottom = Number.NEGATIVE_INFINITY

  for (const node of nodes) {
    left = Math.min(left, node.x)
    top = Math.min(top, node.y)
    right = Math.max(right, node.x + node.width)
    bottom = Math.max(bottom, node.y + node.height)
  }

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  }
}

/** Builds a lookup from group node ID to its direct child node IDs. */
function getChildIdsByGroupId(nodes: Array<CanvasNode>) {
  const childIdsByGroupId: Record<NodeId, Array<NodeId>> = {}

  for (const node of nodes) {
    if (!node.parentGroupId) continue

    const childIds = childIdsByGroupId[node.parentGroupId] ?? []
    childIds.push(node.id)
    childIdsByGroupId[node.parentGroupId] = childIds
  }

  return childIdsByGroupId
}

/** Removes cached edge routes for any edge connected to the given node IDs. */
function clearConnectedEdgeRoutes(
  state: CanvasDocumentState,
  nodeIds: Array<NodeId>,
) {
  const nodeIdSet = new Set(nodeIds)

  for (const edge of Object.values(state.edgesById)) {
    if (
      !nodeIdSet.has(edge.sourceNodeId) &&
      !nodeIdSet.has(edge.targetNodeId)
    ) {
      continue
    }

    delete edge.routePoints
  }
}

function clearAllExplicitEdgePorts(state: CanvasDocumentState) {
  for (const edge of Object.values(state.edgesById)) {
    delete edge.sourcePort
    delete edge.targetPort
  }
}

function clearConnectedEdgePorts(
  state: CanvasDocumentState,
  nodeIds: Array<NodeId>,
) {
  const nodeIdSet = new Set(nodeIds)

  for (const edge of Object.values(state.edgesById)) {
    if (
      !nodeIdSet.has(edge.sourceNodeId) &&
      !nodeIdSet.has(edge.targetNodeId)
    ) {
      continue
    }

    delete edge.sourcePort
    delete edge.targetPort
  }
}

function getNodeCenterPoint(node: CanvasNode) {
  return {
    x: node.x + node.width / 2,
    y: node.y + node.height / 2,
  }
}

function getPortSlotSortValue(
  state: CanvasDocumentState,
  otherNodeId: NodeId,
  side: CanvasPortSide,
) {
  const otherNode = state.nodesById[otherNodeId]
  if (!otherNode) {
    return 0
  }

  const otherCenter = getNodeCenterPoint(otherNode)

  return side === 'LEFT' || side === 'RIGHT' ? otherCenter.y : otherCenter.x
}

function assignExplicitPortSlots(state: CanvasDocumentState) {
  const endpointGroups = new Map<
    string,
    Array<{
      edge: CanvasEdge
      endpoint: 'source' | 'target'
      sortValue: number
    }>
  >()

  for (const edge of Object.values(state.edgesById)) {
    const sourceSide = edge.sourcePort?.side
    if (sourceSide) {
      const key = `${edge.sourceNodeId}:${sourceSide}`
      const group = endpointGroups.get(key) ?? []
      group.push({
        edge,
        endpoint: 'source',
        sortValue: getPortSlotSortValue(state, edge.targetNodeId, sourceSide),
      })
      endpointGroups.set(key, group)
    }

    const targetSide = edge.targetPort?.side
    if (targetSide) {
      const key = `${edge.targetNodeId}:${targetSide}`
      const group = endpointGroups.get(key) ?? []
      group.push({
        edge,
        endpoint: 'target',
        sortValue: getPortSlotSortValue(state, edge.sourceNodeId, targetSide),
      })
      endpointGroups.set(key, group)
    }
  }

  for (const group of endpointGroups.values()) {
    group.sort((left, right) => {
      if (left.sortValue !== right.sortValue) {
        return left.sortValue - right.sortValue
      }

      return left.edge.id.localeCompare(right.edge.id)
    })

    const slotCount = group.length

    for (const [index, entry] of group.entries()) {
      if (entry.endpoint === 'source' && entry.edge.sourcePort?.side) {
        entry.edge.sourcePort = {
          side: entry.edge.sourcePort.side,
          slot: index,
          slotCount,
        }
      }

      if (entry.endpoint === 'target' && entry.edge.targetPort?.side) {
        entry.edge.targetPort = {
          side: entry.edge.targetPort.side,
          slot: index,
          slotCount,
        }
      }
    }
  }
}

function setNodeLayoutMode(
  state: CanvasDocumentState,
  nodeIds: Array<NodeId>,
  layoutMode: CanvasNodeLayoutMode,
) {
  for (const nodeId of nodeIds) {
    const node = state.nodesById[nodeId]
    if (!node) continue

    node.layoutMode = layoutMode
  }
}

/** Materializes both edge endpoints once a connected node is manually transformed so anchors stop sliding. */
function materializeConnectedEdgePorts(
  state: CanvasDocumentState,
  nodeIds: Array<NodeId>,
) {
  const nodeIdSet = new Set(nodeIds)

  for (const edge of Object.values(state.edgesById)) {
    if (
      !nodeIdSet.has(edge.sourceNodeId) &&
      !nodeIdSet.has(edge.targetNodeId)
    ) {
      continue
    }

    edge.sourcePort ??= {
      side: resolveEdgePortSide(
        edge.sourcePort,
        'source',
        state.flowDirection,
        state.layoutOptions,
      ),
    }
    edge.targetPort ??= {
      side: resolveEdgePortSide(
        edge.targetPort,
        'target',
        state.flowDirection,
        state.layoutOptions,
      ),
    }
  }

  assignExplicitPortSlots(state)
}

/** Recursively collects a node's ID and all its descendant IDs in the group hierarchy. */
function getNodeAndDescendantIds(
  state: CanvasDocumentState,
  id: NodeId,
): Array<NodeId> {
  const ids = [id]
  const childIds = state.childIdsByGroupId[id] ?? []

  for (const childId of childIds) {
    ids.push(...getNodeAndDescendantIds(state, childId))
  }

  return ids
}

function prepareNodeTransform(state: CanvasDocumentState, id: NodeId) {
  const affectedNodeIds = getNodeAndDescendantIds(state, id)

  clearConnectedEdgeRoutes(state, affectedNodeIds)
  setNodeLayoutMode(state, affectedNodeIds, 'manual')

  if (state.routingAuthority === 'manual') {
    materializeConnectedEdgePorts(state, affectedNodeIds)
  } else {
    clearConnectedEdgePorts(state, affectedNodeIds)
    assignExplicitPortSlots(state)
  }

  return affectedNodeIds
}

/** Translates a node (and its group children) by a delta, invalidating connected edge routes. */
function moveNodeByDelta(
  state: CanvasDocumentState,
  id: NodeId,
  deltaX: number,
  deltaY: number,
) {
  const node = state.nodesById[id]
  if (!node) return

  prepareNodeTransform(state, id)

  node.x += deltaX
  node.y += deltaY

  if (node.kind !== 'group') return

  const childIds = state.childIdsByGroupId[id] ?? []
  for (const childId of childIds) {
    const childNode = state.nodesById[childId]
    if (!childNode) continue

    childNode.x += deltaX
    childNode.y += deltaY
  }
}

export type CanvasTabId = string

export type CanvasDocumentState = {
  nodesById: Record<NodeId, CanvasNode>
  nodeOrder: Array<NodeId>
  edgesById: Record<EdgeId, CanvasEdge>
  edgeOrder: Array<EdgeId>
  childIdsByGroupId: Record<NodeId, Array<NodeId>>
  selectedNodeId: NodeId | null
  selectedNodeIds: Array<NodeId>
  viewport: CanvasViewport
  flowDirection: CanvasFlowDirection
  routingAuthority: CanvasRoutingAuthorityMode
  layoutOptions: LayoutOptions
  isSeeded: boolean
}

export type CanvasTab = {
  id: CanvasTabId
  label: string
  closable: boolean
  dirty: boolean
  document: CanvasDocumentState
}

type CanvasState = {
  tabsById: Record<CanvasTabId, CanvasTab>
  tabOrder: Array<CanvasTabId>
  activeTabId: CanvasTabId
  nextUntitledIndex: number
  isMarqueeSelecting: boolean
  editingNodeId: NodeId | null
  isStageMounted: boolean
  stageSize: CanvasStageSize
  showResolvedReferences: boolean
  actions: CanvasActions
  tabActions: CanvasTabActions
}

export type CanvasViewport = {
  x: number
  y: number
  scale: number
}

export type CanvasStageSize = {
  width: number
  height: number
}

export type CanvasExportSnapshot = {
  nodesById: Record<NodeId, CanvasNode>
  nodeOrder: Array<NodeId>
  edgesById: Record<EdgeId, CanvasEdge>
  edgeOrder: Array<EdgeId>
  viewport: CanvasViewport
  flowDirection: CanvasFlowDirection
  layoutOptions: LayoutOptions
}

export type MoveNodePayload = {
  id: NodeId
  x: number
  y: number
}

export type MoveSelectedNodesPayload = {
  deltaX: number
  deltaY: number
}

export type ResizeNodePayload = {
  id: NodeId
  width: number
  height: number
}

export type UpdateNodeFramePayload = {
  id: NodeId
  x: number
  y: number
  width: number
  height: number
}

export type CommitNodeTextPayload = {
  id: NodeId
  lexicalJson: string
  html: string
  contentHeight: number
}

export type SetGraphPayload = {
  nodes: Array<CanvasNode>
  edges: Array<CanvasEdge>
}

type TargetTabOptions = {
  tabId?: CanvasTabId
  markDirty?: boolean
}

type CreateCanvasTabPayload = {
  label?: string
  nodes?: Array<CanvasNode>
  edges?: Array<CanvasEdge>
  viewport?: CanvasViewport
  closable?: boolean
}

export type CanvasBounds = {
  x: number
  y: number
  width: number
  height: number
}

export type CanvasSelectedNodeBounds = CanvasBounds & {
  selectedCount: number
  selectedNodeIds: Array<NodeId>
}

/** Computes the union bounding box of an array of rectangles. */
function getCanvasBounds(items: Array<CanvasBounds>): CanvasBounds | null {
  if (items.length === 0) return null

  let left = Number.POSITIVE_INFINITY
  let top = Number.POSITIVE_INFINITY
  let right = Number.NEGATIVE_INFINITY
  let bottom = Number.NEGATIVE_INFINITY

  for (const item of items) {
    left = Math.min(left, item.x)
    top = Math.min(top, item.y)
    right = Math.max(right, item.x + item.width)
    bottom = Math.max(bottom, item.y + item.height)
  }

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  }
}

type CanvasActions = {
  addNode: (node: CanvasNode) => void
  setGraph: (payload: SetGraphPayload, options?: TargetTabOptions) => void
  seedActiveDocument: (payload: SetGraphPayload) => void
  applyGraphLayout: (
    payload: CanvasGraphLayoutResult,
    options?: TargetTabOptions,
  ) => void
  setStageMounted: (isMounted: boolean) => void
  setStageSize: (stageSize: CanvasStageSize) => void
  selectNode: (id: NodeId | null) => void
  selectNodes: (ids: Array<NodeId>) => void
  selectNodesFromMarquee: (ids: Array<NodeId>) => void
  groupSelectedNodes: () => void
  ungroupNode: (id: NodeId) => void
  setMarqueeSelecting: (isSelecting: boolean) => void
  startEditing: (id: NodeId) => void
  stopEditing: () => void
  setViewport: (viewport: CanvasViewport, options?: TargetTabOptions) => void
  moveNode: (payload: MoveNodePayload) => void
  moveSelectedNodes: (payload: MoveSelectedNodesPayload) => void
  resizeNode: (payload: ResizeNodePayload) => void
  updateNodeFrame: (payload: UpdateNodeFramePayload) => void
  commitNodeText: (payload: CommitNodeTextPayload) => void
  toggleResolvedReferences: () => void
  setFlowDirection: (flowDirection: CanvasFlowDirection) => void
  setRoutingAuthority: (routingAuthority: CanvasRoutingAuthorityMode) => void
  setLayoutOptions: (options: Partial<LayoutOptions>) => void
}

type CanvasTabActions = {
  createTab: (payload?: CreateCanvasTabPayload) => CanvasTabId
  switchTab: (tabId: CanvasTabId) => void
  closeTab: (tabId: CanvasTabId) => void
  renameTab: (tabId: CanvasTabId, label: string) => void
  markTabDirty: (tabId: CanvasTabId) => void
}

function cloneCanvasNode(node: CanvasNode): CanvasNode {
  return { ...node }
}

function cloneCanvasEdge(edge: CanvasEdge): CanvasEdge {
  const clone: CanvasEdge = {
    ...edge,
  }

  if (edge.sourcePort) clone.sourcePort = { ...edge.sourcePort }
  if (edge.targetPort) clone.targetPort = { ...edge.targetPort }
  if (edge.routePoints) {
    clone.routePoints = edge.routePoints.map((point) => ({ ...point }))
  }

  return clone
}

function createCanvasDocumentState({
  nodes = [],
  edges = [],
  viewport = { x: 0, y: 0, scale: 1 },
  isSeeded = nodes.length > 0 || edges.length > 0,
}: {
  nodes?: Array<CanvasNode>
  edges?: Array<CanvasEdge>
  viewport?: CanvasViewport
  isSeeded?: boolean
} = {}): CanvasDocumentState {
  const clonedNodes = nodes.map(cloneCanvasNode)
  const clonedEdges = edges.map(cloneCanvasEdge)

  return {
    nodesById: R.indexBy(clonedNodes, R.prop('id')),
    nodeOrder: clonedNodes.map((node) => node.id),
    edgesById: R.indexBy(clonedEdges, R.prop('id')),
    edgeOrder: clonedEdges.map((edge) => edge.id),
    childIdsByGroupId: getChildIdsByGroupId(clonedNodes),
    selectedNodeId: null,
    selectedNodeIds: [],
    viewport: { ...viewport },
    flowDirection: DEFAULT_CANVAS_FLOW_DIRECTION,
    routingAuthority: 'manual',
    layoutOptions: { ...DEFAULT_ELK_LAYOUT_OPTIONS },
    isSeeded,
  }
}

function createCanvasTab({
  id,
  label,
  closable,
  document,
}: {
  id: CanvasTabId
  label: string
  closable: boolean
  document: CanvasDocumentState
}): CanvasTab {
  return {
    id,
    label,
    closable,
    dirty: false,
    document,
  }
}

function getActiveDocument(state: CanvasState): CanvasDocumentState {
  return state.tabsById[state.activeTabId]!.document
}

function getTargetDocument(
  state: CanvasState,
  tabId?: CanvasTabId,
): CanvasDocumentState | null {
  return state.tabsById[tabId ?? state.activeTabId]?.document ?? null
}

function markTabDirty(
  state: CanvasState,
  tabId: CanvasTabId,
  markDirty = true,
) {
  if (markDirty) {
    const tab = state.tabsById[tabId]
    if (tab) tab.dirty = true
  }
}

function resetDocumentGraph(
  document: CanvasDocumentState,
  { nodes, edges }: SetGraphPayload,
) {
  const clonedNodes = nodes.map(cloneCanvasNode)
  const clonedEdges = edges.map(cloneCanvasEdge)

  document.nodesById = R.indexBy(clonedNodes, R.prop('id'))
  document.nodeOrder = clonedNodes.map((node) => node.id)
  document.edgesById = R.indexBy(clonedEdges, R.prop('id'))
  document.edgeOrder = clonedEdges.map((edge) => edge.id)
  document.childIdsByGroupId = getChildIdsByGroupId(clonedNodes)
  document.selectedNodeId = null
  document.selectedNodeIds = []
  document.isSeeded = true
}

function createInitialCanvasState() {
  const mainTab = createCanvasTab({
    id: MAIN_CANVAS_TAB_ID,
    label: INITIAL_CANVAS_TAB_LABEL,
    closable: false,
    document: createCanvasDocumentState({ isSeeded: false }),
  })

  return {
    tabsById: {
      [mainTab.id]: mainTab,
    },
    tabOrder: [mainTab.id],
    activeTabId: mainTab.id,
    nextUntitledIndex: 2,
    isMarqueeSelecting: false,
    editingNodeId: null,
    isStageMounted: false,
    stageSize: {
      width: 0,
      height: 0,
    },
    showResolvedReferences: true,
  }
}
const useCanvasStore = create<CanvasState>()(
  devtools(
    immer((set) => ({
      ...createInitialCanvasState(),
      actions: {
        addNode: (node) =>
          set(
            (state) => {
              const document = getActiveDocument(state)
              document.nodesById[node.id] = cloneCanvasNode(node)
              if (!document.nodeOrder.includes(node.id)) {
                document.nodeOrder.push(node.id)
              }

              if (node.parentGroupId) {
                const childIds =
                  document.childIdsByGroupId[node.parentGroupId] ?? []
                if (!childIds.includes(node.id)) {
                  childIds.push(node.id)
                }
                document.childIdsByGroupId[node.parentGroupId] = childIds
              }

              markTabDirty(state, state.activeTabId)
            },
            false,
            'canvas/addNode',
          ),

        setGraph: (payload, options = {}) =>
          set(
            (state) => {
              const tabId = options.tabId ?? state.activeTabId
              const document = getTargetDocument(state, tabId)
              if (!document) return

              resetDocumentGraph(document, payload)
              state.editingNodeId = null
              markTabDirty(state, tabId, options.markDirty)
            },
            false,
            'canvas/setGraph',
          ),

        seedActiveDocument: (payload) =>
          set(
            (state) => {
              const document = getActiveDocument(state)
              if (document.isSeeded) return

              resetDocumentGraph(document, payload)
            },
            false,
            'canvas/seedActiveDocument',
          ),

        applyGraphLayout: ({ nodeFrames, edgeRoutes }, options = {}) =>
          set(
            (state) => {
              const tabId = options.tabId ?? state.activeTabId
              const document = getTargetDocument(state, tabId)
              if (!document) return

              setNodeLayoutMode(document, document.nodeOrder, 'auto')

              for (const frame of nodeFrames) {
                const node = document.nodesById[frame.id]
                if (!node) continue

                const didChange =
                  node.x !== frame.x ||
                  node.y !== frame.y ||
                  node.width !== frame.width ||
                  node.height !== frame.height

                node.x = frame.x
                node.y = frame.y
                node.width = frame.width
                node.height = frame.height
                if (didChange) {
                  node.version += 1
                }
              }

              clearAllExplicitEdgePorts(document)

              for (const edgeRoute of edgeRoutes) {
                const edge = document.edgesById[edgeRoute.id]
                if (!edge) continue

                edge.routePoints = edgeRoute.points
              }

              markTabDirty(state, tabId, options.markDirty)
            },
            false,
            'canvas/applyGraphLayout',
          ),

        setStageMounted: (isMounted) =>
          set(
            (state) => {
              state.isStageMounted = isMounted

              if (isMounted) {
                return
              }

              state.stageSize = {
                width: 0,
                height: 0,
              }
            },
            false,
            'canvas/setStageMounted',
          ),

        setStageSize: (stageSize) =>
          set(
            (state) => {
              state.stageSize = stageSize
            },
            false,
            'canvas/setStageSize',
          ),

        selectNode: (id) =>
          set(
            (state) => {
              const document = getActiveDocument(state)
              document.selectedNodeId = id
              document.selectedNodeIds = id ? [id] : []
            },
            false,
            'canvas/selectNode',
          ),

        selectNodes: (ids) =>
          set(
            (state) => {
              const document = getActiveDocument(state)
              document.selectedNodeIds = ids
              document.selectedNodeId =
                ids.length === 1 ? (ids[0] ?? null) : null
            },
            false,
            'canvas/selectNodes',
          ),

        selectNodesFromMarquee: (ids) =>
          set(
            (state) => {
              const document = getActiveDocument(state)
              document.selectedNodeIds = ids
              document.selectedNodeId = null
            },
            false,
            'canvas/selectNodesFromMarquee',
          ),

        groupSelectedNodes: () =>
          set(
            (state) => {
              const document = getActiveDocument(state)
              const selectedNodes = document.selectedNodeIds.flatMap((id) => {
                const node = document.nodesById[id]
                if (!node || node.kind === 'group' || node.parentGroupId) {
                  return []
                }

                return [node]
              })

              if (selectedNodes.length < 2) return

              const bounds = getNodeBounds(selectedNodes)
              const groupId = createNodeId('group')
              const groupNode: CanvasNode = {
                id: groupId,
                kind: 'group',
                shape: 'group',
                layoutMode: 'manual',
                x: bounds.x - GROUP_NODE_PADDING,
                y: bounds.y - GROUP_NODE_PADDING,
                width: bounds.width + GROUP_NODE_PADDING * 2,
                height: bounds.height + GROUP_NODE_PADDING * 2,
                lexicalJson: '',
                html: '',
                contentHeight: 0,
                version: 1,
              }

              document.nodesById[groupId] = groupNode
              document.nodeOrder.unshift(groupId)
              document.childIdsByGroupId[groupId] = selectedNodes.map(
                (node) => node.id,
              )
              for (const node of selectedNodes) {
                node.parentGroupId = groupId
              }
              clearConnectedEdgeRoutes(
                document,
                selectedNodes.map((node) => node.id),
              )
              document.selectedNodeId = groupId
              document.selectedNodeIds = [groupId]
              markTabDirty(state, state.activeTabId)
            },
            false,
            'canvas/groupSelectedNodes',
          ),

        ungroupNode: (id) =>
          set(
            (state) => {
              const document = getActiveDocument(state)
              const groupNode = document.nodesById[id]
              if (!groupNode || groupNode.kind !== 'group') return

              const childIds = document.childIdsByGroupId[id] ?? []

              for (const childId of childIds) {
                const node = document.nodesById[childId]
                if (!node) continue

                delete node.parentGroupId
              }
              clearConnectedEdgeRoutes(document, childIds)

              delete document.nodesById[id]
              delete document.childIdsByGroupId[id]
              document.nodeOrder = document.nodeOrder.filter(
                (nodeId) => nodeId !== id,
              )
              document.selectedNodeId =
                childIds.length === 1 ? (childIds[0] ?? null) : null
              document.selectedNodeIds = childIds
              markTabDirty(state, state.activeTabId)
            },
            false,
            'canvas/ungroupNode',
          ),

        setMarqueeSelecting: (isSelecting) =>
          set(
            (state) => {
              state.isMarqueeSelecting = isSelecting
            },
            false,
            'canvas/setMarqueeSelecting',
          ),

        startEditing: (id) =>
          set(
            (state) => {
              const document = getActiveDocument(state)
              state.editingNodeId = id
              document.selectedNodeId = id
              document.selectedNodeIds = [id]
            },
            false,
            'canvas/startEditing',
          ),

        stopEditing: () =>
          set(
            (state) => {
              state.editingNodeId = null
            },
            false,
            'canvas/stopEditing',
          ),

        setViewport: ({ x, y, scale }, options = {}) =>
          set(
            (state) => {
              const tabId = options.tabId ?? state.activeTabId
              const document = getTargetDocument(state, tabId)
              if (!document) return

              document.viewport.x = x
              document.viewport.y = y
              document.viewport.scale = scale
              markTabDirty(state, tabId, options.markDirty)
            },
            false,
            'canvas/setViewport',
          ),

        moveNode: ({ id, x, y }) =>
          set(
            (state) => {
              const document = getActiveDocument(state)
              const node = document.nodesById[id]
              if (!node) return

              const deltaX = x - node.x
              const deltaY = y - node.y
              prepareNodeTransform(document, id)

              node.x = x
              node.y = y
              markTabDirty(state, state.activeTabId)

              if (node.kind !== 'group') return

              const childIds = document.childIdsByGroupId[id] ?? []
              for (const childId of childIds) {
                const childNode = document.nodesById[childId]
                if (!childNode) continue

                childNode.x += deltaX
                childNode.y += deltaY
              }
              markTabDirty(state, state.activeTabId)
            },
            false,
            'canvas/moveNode',
          ),

        moveSelectedNodes: ({ deltaX, deltaY }) =>
          set(
            (state) => {
              const document = getActiveDocument(state)
              const selectedRootIds = document.selectedNodeIds.filter((id) => {
                const node = document.nodesById[id]
                if (!node?.parentGroupId) return Boolean(node)

                return !document.selectedNodeIds.includes(node.parentGroupId)
              })

              for (const id of selectedRootIds) {
                moveNodeByDelta(document, id, deltaX, deltaY)
              }
              if (selectedRootIds.length > 0) {
                markTabDirty(state, state.activeTabId)
              }
            },
            false,
            'canvas/moveSelectedNodes',
          ),

        resizeNode: ({ id, width, height }) =>
          set(
            (state) => {
              const document = getActiveDocument(state)
              const node = document.nodesById[id]
              if (!node) return

              const shapeDefinition = getCanvasNodeShapeDefinition(node)
              prepareNodeTransform(document, id)

              node.width = Math.max(shapeDefinition.minSize.width, width)
              node.height = Math.max(shapeDefinition.minSize.height, height)
              node.version += 1
              markTabDirty(state, state.activeTabId)
            },
            false,
            'canvas/resizeNode',
          ),

        updateNodeFrame: ({ id, x, y, width, height }) =>
          set(
            (state) => {
              const document = getActiveDocument(state)
              const node = document.nodesById[id]
              if (!node) return

              const shapeDefinition = getCanvasNodeShapeDefinition(node)
              prepareNodeTransform(document, id)
              const deltaX = x - node.x
              const deltaY = y - node.y
              const nextWidth = Math.max(shapeDefinition.minSize.width, width)
              const nextHeight = Math.max(
                shapeDefinition.minSize.height,
                height,
              )
              const scaleX = node.width === 0 ? 1 : nextWidth / node.width
              const scaleY = node.height === 0 ? 1 : nextHeight / node.height
              const didResize = scaleX !== 1 || scaleY !== 1
              const previousX = node.x
              const previousY = node.y

              node.x = x
              node.y = y
              node.width = nextWidth
              node.height = nextHeight
              node.version += 1
              markTabDirty(state, state.activeTabId)

              if (node.kind !== 'group') return

              const childIds = document.childIdsByGroupId[id] ?? []
              for (const childId of childIds) {
                const childNode = document.nodesById[childId]
                if (!childNode) continue

                if (!didResize) {
                  childNode.x += deltaX
                  childNode.y += deltaY
                  continue
                }

                childNode.x = x + (childNode.x - previousX) * scaleX
                childNode.y = y + (childNode.y - previousY) * scaleY
                childNode.width *= scaleX
                childNode.height *= scaleY
                childNode.version += 1
              }
            },
            false,
            'canvas/updateNodeFrame',
          ),

        commitNodeText: ({ id, lexicalJson, html, contentHeight }) =>
          set(
            (state) => {
              const document = getActiveDocument(state)
              const node = document.nodesById[id]
              if (!node) return

              node.lexicalJson = lexicalJson
              node.html = html
              node.contentHeight = contentHeight
              node.version += 1
              markTabDirty(state, state.activeTabId)
            },
            false,
            'canvas/commitNodeText',
          ),

        toggleResolvedReferences: () =>
          set(
            (state) => {
              state.showResolvedReferences = !state.showResolvedReferences
            },
            false,
            'canvas/toggleResolvedReferences',
          ),

        setFlowDirection: (flowDirection) =>
          set(
            (state) => {
              const document = getActiveDocument(state)
              document.flowDirection = flowDirection
              clearConnectedEdgeRoutes(document, document.nodeOrder)
              clearAllExplicitEdgePorts(document)
              markTabDirty(state, state.activeTabId)
            },
            false,
            'canvas/setFlowDirection',
          ),

        setRoutingAuthority: (routingAuthority) =>
          set(
            (state) => {
              const document = getActiveDocument(state)
              document.routingAuthority = routingAuthority
              clearConnectedEdgeRoutes(document, document.nodeOrder)

              if (routingAuthority === 'manual') {
                materializeConnectedEdgePorts(document, document.nodeOrder)
                markTabDirty(state, state.activeTabId)
                return
              }

              clearAllExplicitEdgePorts(document)
              markTabDirty(state, state.activeTabId)
            },
            false,
            'canvas/setRoutingAuthority',
          ),

        setLayoutOptions: (options) =>
          set(
            (state) => {
              const document = getActiveDocument(state)
              Object.assign(document.layoutOptions, options)
              markTabDirty(state, state.activeTabId)
            },
            false,
            'canvas/setLayoutOptions',
          ),
      },
      tabActions: {
        createTab: (payload = {}) => {
          const id = createCanvasTabId()
          set(
            (state) => {
              const label =
                payload.label ?? `Untitled ${state.nextUntitledIndex}`
              state.nextUntitledIndex += 1

              const tab = createCanvasTab({
                id,
                label,
                closable: payload.closable ?? true,
                document: createCanvasDocumentState({
                  nodes: payload.nodes ?? DEFAULT_CANVAS_NODES,
                  edges: payload.edges ?? DEFAULT_CANVAS_EDGES,
                  viewport: payload.viewport,
                  isSeeded: true,
                }),
              })

              state.tabsById[id] = tab
              state.tabOrder.push(id)
              state.activeTabId = id
              state.editingNodeId = null
              state.isMarqueeSelecting = false
            },
            false,
            'canvasTab/create',
          )

          return id
        },

        switchTab: (tabId) =>
          set(
            (state) => {
              if (!state.tabsById[tabId] || state.activeTabId === tabId) return

              state.activeTabId = tabId
              state.editingNodeId = null
              state.isMarqueeSelecting = false
            },
            false,
            'canvasTab/switch',
          ),

        closeTab: (tabId) =>
          set(
            (state) => {
              const tab = state.tabsById[tabId]
              if (!tab?.closable) return

              const closingIndex = state.tabOrder.indexOf(tabId)
              const nextTabId =
                state.tabOrder[closingIndex - 1] ??
                state.tabOrder[closingIndex + 1] ??
                MAIN_CANVAS_TAB_ID

              delete state.tabsById[tabId]
              state.tabOrder = state.tabOrder.filter((id) => id !== tabId)

              if (state.activeTabId === tabId) {
                state.activeTabId = nextTabId
                state.editingNodeId = null
                state.isMarqueeSelecting = false
              }
            },
            false,
            'canvasTab/close',
          ),

        renameTab: (tabId, label) =>
          set(
            (state) => {
              const tab = state.tabsById[tabId]
              const nextLabel = label.trim()
              if (!tab || !nextLabel) return

              tab.label = nextLabel
            },
            false,
            'canvasTab/rename',
          ),

        markTabDirty: (tabId) =>
          set(
            (state) => {
              markTabDirty(state, tabId)
            },
            false,
            'canvasTab/markDirty',
          ),
      },
    })),
    {
      name: 'CanvasStore',
      enabled: import.meta.env.DEV,
    },
  ),
)

/** Returns the current viewport outside of React (for use in callbacks). */
export function getCanvasViewportSnapshot() {
  return getActiveDocument(useCanvasStore.getState()).viewport
}

/** Returns the current nodes map outside of React (for use in callbacks). */
export function getCanvasNodesSnapshot() {
  return getActiveDocument(useCanvasStore.getState()).nodesById
}

export function getCanvasNodeIdsSnapshot() {
  return getActiveDocument(useCanvasStore.getState()).nodeOrder
}

export function getActiveCanvasTabIdSnapshot() {
  return useCanvasStore.getState().activeTabId
}

/** Snapshots the full layout input (nodes, edges, groups, options) for sending to the server. */
export function getCanvasLayoutSnapshot(
  tabId?: CanvasTabId,
): CanvasLayoutInput {
  const state = useCanvasStore.getState()
  const document = getTargetDocument(state, tabId) ?? getActiveDocument(state)

  return {
    nodesById: document.nodesById,
    nodeOrder: document.nodeOrder,
    childIdsByGroupId: document.childIdsByGroupId,
    edgesById: document.edgesById,
    edgeOrder: document.edgeOrder,
    flowDirection: document.flowDirection,
    layoutOptions: document.layoutOptions,
  }
}

export function getCanvasExportSnapshot(
  tabId?: CanvasTabId,
): CanvasExportSnapshot {
  const state = useCanvasStore.getState()
  const document = getTargetDocument(state, tabId) ?? getActiveDocument(state)

  return {
    nodesById: document.nodesById,
    nodeOrder: document.nodeOrder,
    edgesById: document.edgesById,
    edgeOrder: document.edgeOrder,
    viewport: document.viewport,
    flowDirection: document.flowDirection,
    layoutOptions: document.layoutOptions,
  }
}

export function getCanvasActionsSnapshot() {
  return useCanvasStore.getState().actions
}

export function getCanvasTabActionsSnapshot() {
  return useCanvasStore.getState().tabActions
}

export function resetCanvasStoreForTests() {
  useCanvasStore.setState((state) => ({
    ...state,
    ...createInitialCanvasState(),
  }))
}

export const useCanvasActions = () => useCanvasStore((state) => state.actions)
export const useCanvasTabActions = () =>
  useCanvasStore((state) => state.tabActions)

export const useCanvasTabs = () =>
  useCanvasStore(
    useShallow((state) =>
      state.tabOrder.flatMap((id) => {
        const tab = state.tabsById[id]
        return tab ? [tab] : []
      }),
    ),
  )
export const useActiveCanvasTabId = () =>
  useCanvasStore((state) => state.activeTabId)

export const useCanvasNodes = () =>
  useCanvasStore((state) => getActiveDocument(state).nodesById)
export const useCanvasEdges = () =>
  useCanvasStore((state) => getActiveDocument(state).edgesById)
export const useCanvasNode: (id: NodeId) => CanvasNode | undefined = (id) =>
  useCanvasStore((state) => getActiveDocument(state).nodesById[id])
export const useCanvasNodeWidth = (id: NodeId) =>
  useCanvasStore((state) => getActiveDocument(state).nodesById[id]?.width)

export const useCanvasNodeIds = () =>
  useCanvasStore(useShallow((state) => getActiveDocument(state).nodeOrder))
export const useCanvasEdgeIds = () =>
  useCanvasStore(useShallow((state) => getActiveDocument(state).edgeOrder))
export const useCanvasSelectedNodeBounds = () =>
  useCanvasStore(
    useShallow((state): CanvasSelectedNodeBounds | null => {
      const document = getActiveDocument(state)
      const selectedBounds = document.selectedNodeIds.flatMap((id) => {
        const node = document.nodesById[id]
        if (!node) return []

        return [
          {
            x: node.x,
            y: node.y,
            width: node.width,
            height: node.height,
          },
        ]
      })

      const bounds = getCanvasBounds(selectedBounds)
      if (!bounds) return null

      return {
        ...bounds,
        selectedCount: document.selectedNodeIds.length,
        selectedNodeIds: document.selectedNodeIds,
      }
    }),
  )
export const useSelectedNodeId = () =>
  useCanvasStore((state) => getActiveDocument(state).selectedNodeId)
export const useSelectedNodeIds = () =>
  useCanvasStore(
    useShallow((state) => getActiveDocument(state).selectedNodeIds),
  )
export const useIsMarqueeSelecting = () =>
  useCanvasStore((state) => state.isMarqueeSelecting)
export const useCanvasEditingNodeId = () =>
  useCanvasStore((state) => state.editingNodeId)
export const useCanvasIsStageMounted = () =>
  useCanvasStore((state) => state.isStageMounted)
export const useCanvasStageSizeValue = () =>
  useCanvasStore((state) => state.stageSize)
export const useCanvasViewport = () =>
  useCanvasStore((state) => getActiveDocument(state).viewport)
export const useCanvasFlowDirection = () =>
  useCanvasStore((state) => getActiveDocument(state).flowDirection)
export const useCanvasRoutingAuthority = () =>
  useCanvasStore((state) => getActiveDocument(state).routingAuthority)
export const useCanvasLayoutOptions = () =>
  useCanvasStore((state) => getActiveDocument(state).layoutOptions)
export const useShowResolvedReferences = () =>
  useCanvasStore((state) => state.showResolvedReferences)
