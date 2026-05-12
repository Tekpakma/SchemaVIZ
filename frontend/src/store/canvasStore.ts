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
  DEFAULT_CANVAS_FLOW_DIRECTION,
  DEFAULT_ELK_LAYOUT_OPTIONS,
  resolveEdgePortSide,
} from '@/features/canvas/layoutAdapters'
import type { LayoutOptions } from 'elkjs/lib/elk-api'
import * as R from 'remeda'

const GROUP_NODE_PADDING = 24

function createNodeId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`
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
function clearConnectedEdgeRoutes(state: CanvasState, nodeIds: Array<NodeId>) {
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

function clearAllExplicitEdgePorts(state: CanvasState) {
  for (const edge of Object.values(state.edgesById)) {
    delete edge.sourcePort
    delete edge.targetPort
  }
}

function clearConnectedEdgePorts(state: CanvasState, nodeIds: Array<NodeId>) {
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
  state: CanvasState,
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

function assignExplicitPortSlots(state: CanvasState) {
  const endpointGroups = new Map<
    string,
    Array<{ edge: CanvasEdge; endpoint: 'source' | 'target'; sortValue: number }>
  >()

  for (const edge of Object.values(state.edgesById)) {
    const sourceSide = edge.sourcePort?.side
    if (sourceSide) {
      const key = `${edge.sourceNodeId}:${sourceSide}`
      const group = endpointGroups.get(key) ?? []
      group.push({
        edge,
        endpoint: 'source',
        sortValue: getPortSlotSortValue(
          state,
          edge.targetNodeId,
          sourceSide,
        ),
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
        sortValue: getPortSlotSortValue(
          state,
          edge.sourceNodeId,
          targetSide,
        ),
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
  state: CanvasState,
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
  state: CanvasState,
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
  state: CanvasState,
  id: NodeId,
): Array<NodeId> {
  const ids = [id]
  const childIds = state.childIdsByGroupId[id] ?? []

  for (const childId of childIds) {
    ids.push(...getNodeAndDescendantIds(state, childId))
  }

  return ids
}

function prepareNodeTransform(state: CanvasState, id: NodeId) {
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
  state: CanvasState,
  id: NodeId,
  deltaX: number,
  deltaY: number,
) {
  const node = state.nodesById[id]
  if (!node) return

  prepareNodeTransform(state, id)

  node.x += deltaX
  node.y += deltaY

  if (node.shape !== 'group') return

  const childIds = state.childIdsByGroupId[id] ?? []
  for (const childId of childIds) {
    const childNode = state.nodesById[childId]
    if (!childNode) continue

    childNode.x += deltaX
    childNode.y += deltaY
  }
}

type CanvasState = {
  nodesById: Record<NodeId, CanvasNode>
  nodeOrder: Array<NodeId>
  edgesById: Record<EdgeId, CanvasEdge>
  edgeOrder: Array<EdgeId>
  childIdsByGroupId: Record<NodeId, Array<NodeId>>
  selectedNodeId: NodeId | null
  selectedNodeIds: Array<NodeId>
  isMarqueeSelecting: boolean
  editingNodeId: NodeId | null
  isStageMounted: boolean
  stageSize: CanvasStageSize
  viewport: CanvasViewport
  showResolvedReferences: boolean
  flowDirection: CanvasFlowDirection
  routingAuthority: CanvasRoutingAuthorityMode
  layoutOptions: LayoutOptions
  actions: CanvasActions
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
  setGraph: (payload: SetGraphPayload) => void
  applyGraphLayout: (payload: CanvasGraphLayoutResult) => void
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
  setViewport: (viewport: CanvasViewport) => void
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
const useCanvasStore = create<CanvasState>()(
  devtools(
    immer((set) => ({
      nodesById: {},
      nodeOrder: [],
      edgesById: {},
      edgeOrder: [],
      childIdsByGroupId: {},
      selectedNodeId: null,
      selectedNodeIds: [],
      isMarqueeSelecting: false,
      editingNodeId: null,
      isStageMounted: false,
      stageSize: {
        width: 0,
        height: 0,
      },
      showResolvedReferences: true,
      flowDirection: DEFAULT_CANVAS_FLOW_DIRECTION,
      routingAuthority: 'manual',
      layoutOptions: DEFAULT_ELK_LAYOUT_OPTIONS,
      viewport: {
        x: 0,
        y: 0,
        scale: 1,
      },
      actions: {
        addNode: (node) =>
          set(
            (state) => {
              state.nodesById[node.id] = node
              if (!state.nodeOrder.includes(node.id)) {
                state.nodeOrder.push(node.id)
              }

              if (node.parentGroupId) {
                const childIds =
                  state.childIdsByGroupId[node.parentGroupId] ?? []
                if (!childIds.includes(node.id)) {
                  childIds.push(node.id)
                }
                state.childIdsByGroupId[node.parentGroupId] = childIds
              }
            },
            false,
            'canvas/addNode',
          ),

        setGraph: ({ nodes, edges }) =>
          set(
            (state) => {
              state.nodesById = R.indexBy(nodes, R.prop('id'))
              state.nodeOrder = nodes.map((node) => node.id)
              state.edgesById = R.indexBy(edges, R.prop('id'))
              state.edgeOrder = edges.map((edge) => edge.id)
              state.childIdsByGroupId = getChildIdsByGroupId(nodes)
              state.selectedNodeId = null
              state.selectedNodeIds = []
              state.editingNodeId = null
            },
            false,
            'canvas/setGraph',
          ),

        applyGraphLayout: ({ nodeFrames, edgeRoutes }) =>
          set(
            (state) => {
              setNodeLayoutMode(state, state.nodeOrder, 'auto')

              for (const frame of nodeFrames) {
                const node = state.nodesById[frame.id]
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

              clearAllExplicitEdgePorts(state)

              for (const edgeRoute of edgeRoutes) {
                const edge = state.edgesById[edgeRoute.id]
                if (!edge) continue

                edge.routePoints = edgeRoute.points
              }
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
              state.selectedNodeId = id
              state.selectedNodeIds = id ? [id] : []
            },
            false,
            'canvas/selectNode',
          ),

        selectNodes: (ids) =>
          set(
            (state) => {
              state.selectedNodeIds = ids
              state.selectedNodeId = ids.length === 1 ? (ids[0] ?? null) : null
            },
            false,
            'canvas/selectNodes',
          ),

        selectNodesFromMarquee: (ids) =>
          set(
            (state) => {
              state.selectedNodeIds = ids
              state.selectedNodeId = null
            },
            false,
            'canvas/selectNodesFromMarquee',
          ),

        groupSelectedNodes: () =>
          set(
            (state) => {
              const selectedNodes = state.selectedNodeIds.flatMap((id) => {
                const node = state.nodesById[id]
                if (!node || node.shape === 'group' || node.parentGroupId) {
                  return []
                }

                return [node]
              })

              if (selectedNodes.length < 2) return

              const bounds = getNodeBounds(selectedNodes)
              const groupId = createNodeId('group')
              const groupNode: CanvasNode = {
                id: groupId,
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

              state.nodesById[groupId] = groupNode
              state.nodeOrder.unshift(groupId)
              state.childIdsByGroupId[groupId] = selectedNodes.map(
                (node) => node.id,
              )
              for (const node of selectedNodes) {
                node.parentGroupId = groupId
              }
              clearConnectedEdgeRoutes(
                state,
                selectedNodes.map((node) => node.id),
              )
              state.selectedNodeId = groupId
              state.selectedNodeIds = [groupId]
            },
            false,
            'canvas/groupSelectedNodes',
          ),

        ungroupNode: (id) =>
          set(
            (state) => {
              const groupNode = state.nodesById[id]
              if (!groupNode || groupNode.shape !== 'group') return

              const childIds = state.childIdsByGroupId[id] ?? []

              for (const childId of childIds) {
                const node = state.nodesById[childId]
                if (!node) continue

                delete node.parentGroupId
              }
              clearConnectedEdgeRoutes(state, childIds)

              delete state.nodesById[id]
              delete state.childIdsByGroupId[id]
              state.nodeOrder = state.nodeOrder.filter(
                (nodeId) => nodeId !== id,
              )
              state.selectedNodeId =
                childIds.length === 1 ? (childIds[0] ?? null) : null
              state.selectedNodeIds = childIds
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
              state.editingNodeId = id
              state.selectedNodeId = id
              state.selectedNodeIds = [id]
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

        setViewport: ({ x, y, scale }) =>
          set(
            (state) => {
              state.viewport.x = x
              state.viewport.y = y
              state.viewport.scale = scale
            },
            false,
            'canvas/setViewport',
          ),

        moveNode: ({ id, x, y }) =>
          set(
            (state) => {
              const node = state.nodesById[id]
              if (!node) return

              const deltaX = x - node.x
              const deltaY = y - node.y
              prepareNodeTransform(state, id)

              node.x = x
              node.y = y

              if (node.shape !== 'group') return

              const childIds = state.childIdsByGroupId[id] ?? []
              for (const childId of childIds) {
                const childNode = state.nodesById[childId]
                if (!childNode) continue

                childNode.x += deltaX
                childNode.y += deltaY
              }
            },
            false,
            'canvas/moveNode',
          ),

        moveSelectedNodes: ({ deltaX, deltaY }) =>
          set(
            (state) => {
              const selectedRootIds = state.selectedNodeIds.filter((id) => {
                const node = state.nodesById[id]
                if (!node?.parentGroupId) return Boolean(node)

                return !state.selectedNodeIds.includes(node.parentGroupId)
              })

              for (const id of selectedRootIds) {
                moveNodeByDelta(state, id, deltaX, deltaY)
              }
            },
            false,
            'canvas/moveSelectedNodes',
          ),

        resizeNode: ({ id, width, height }) =>
          set(
            (state) => {
              const node = state.nodesById[id]
              if (!node) return

              const shapeDefinition = getCanvasNodeShapeDefinition(node)
              prepareNodeTransform(state, id)

              node.width = Math.max(shapeDefinition.minSize.width, width)
              node.height = Math.max(shapeDefinition.minSize.height, height)
              node.version += 1
            },
            false,
            'canvas/resizeNode',
          ),

        updateNodeFrame: ({ id, x, y, width, height }) =>
          set(
            (state) => {
              const node = state.nodesById[id]
              if (!node) return

              const shapeDefinition = getCanvasNodeShapeDefinition(node)
              prepareNodeTransform(state, id)
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

              if (node.shape !== 'group') return

              const childIds = state.childIdsByGroupId[id] ?? []
              for (const childId of childIds) {
                const childNode = state.nodesById[childId]
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
              const node = state.nodesById[id]
              if (!node) return

              node.lexicalJson = lexicalJson
              node.html = html
              node.contentHeight = contentHeight
              node.version += 1
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
              state.flowDirection = flowDirection
            },
            false,
            'canvas/setFlowDirection',
          ),

        setRoutingAuthority: (routingAuthority) =>
          set(
            (state) => {
              state.routingAuthority = routingAuthority
              clearConnectedEdgeRoutes(state, state.nodeOrder)

              if (routingAuthority === 'manual') {
                materializeConnectedEdgePorts(state, state.nodeOrder)
                return
              }

              clearAllExplicitEdgePorts(state)
            },
            false,
            'canvas/setRoutingAuthority',
          ),

        setLayoutOptions: (options) =>
          set(
            (state) => {
              Object.assign(state.layoutOptions, options)
            },
            false,
            'canvas/setLayoutOptions',
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
  return useCanvasStore.getState().viewport
}

/** Returns the current nodes map outside of React (for use in callbacks). */
export function getCanvasNodesSnapshot() {
  return useCanvasStore.getState().nodesById
}

export function getCanvasNodeIdsSnapshot() {
  return useCanvasStore.getState().nodeOrder
}

/** Snapshots the full layout input (nodes, edges, groups, options) for sending to the server. */
export function getCanvasLayoutSnapshot(): CanvasLayoutInput {
  const state = useCanvasStore.getState()

  return {
    nodesById: state.nodesById,
    nodeOrder: state.nodeOrder,
    childIdsByGroupId: state.childIdsByGroupId,
    edgesById: state.edgesById,
    edgeOrder: state.edgeOrder,
    flowDirection: state.flowDirection,
    layoutOptions: state.layoutOptions,
  }
}

export function getCanvasExportSnapshot(): CanvasExportSnapshot {
  const state = useCanvasStore.getState()

  return {
    nodesById: state.nodesById,
    nodeOrder: state.nodeOrder,
    edgesById: state.edgesById,
    edgeOrder: state.edgeOrder,
    viewport: state.viewport,
    flowDirection: state.flowDirection,
    layoutOptions: state.layoutOptions,
  }
}

export function getCanvasActionsSnapshot() {
  return useCanvasStore.getState().actions
}

export const useCanvasActions = () => useCanvasStore((state) => state.actions)

export const useCanvasNodes = () => useCanvasStore((state) => state.nodesById)
export const useCanvasEdges = () => useCanvasStore((state) => state.edgesById)
export const useCanvasNode: (id: NodeId) => CanvasNode | undefined = (id) =>
  useCanvasStore((state) => state.nodesById[id])
export const useCanvasNodeWidth = (id: NodeId) =>
  useCanvasStore((state) => state.nodesById[id]?.width)

export const useCanvasNodeIds = () =>
  useCanvasStore(useShallow((state) => state.nodeOrder))
export const useCanvasEdgeIds = () =>
  useCanvasStore(useShallow((state) => state.edgeOrder))
export const useCanvasSelectedNodeBounds = () =>
  useCanvasStore(
    useShallow((state): CanvasSelectedNodeBounds | null => {
      const selectedBounds = state.selectedNodeIds.flatMap((id) => {
        const node = state.nodesById[id]
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
        selectedCount: state.selectedNodeIds.length,
        selectedNodeIds: state.selectedNodeIds,
      }
    }),
  )
export const useSelectedNodeId = () =>
  useCanvasStore((state) => state.selectedNodeId)
export const useSelectedNodeIds = () =>
  useCanvasStore(useShallow((state) => state.selectedNodeIds))
export const useIsMarqueeSelecting = () =>
  useCanvasStore((state) => state.isMarqueeSelecting)
export const useCanvasEditingNodeId = () =>
  useCanvasStore((state) => state.editingNodeId)
export const useCanvasIsStageMounted = () =>
  useCanvasStore((state) => state.isStageMounted)
export const useCanvasStageSizeValue = () =>
  useCanvasStore((state) => state.stageSize)
export const useCanvasViewport = () => useCanvasStore((state) => state.viewport)
export const useCanvasFlowDirection = () =>
  useCanvasStore((state) => state.flowDirection)
export const useCanvasRoutingAuthority = () =>
  useCanvasStore((state) => state.routingAuthority)
export const useCanvasLayoutOptions = () =>
  useCanvasStore((state) => state.layoutOptions)
export const useShowResolvedReferences = () =>
  useCanvasStore((state) => state.showResolvedReferences)
