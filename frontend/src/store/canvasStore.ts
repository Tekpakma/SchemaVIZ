import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import type { CanvasNode, NodeId } from '@/features/canvas/model/types'
import { useShallow } from 'zustand/react/shallow'
import { getCanvasNodeShapeDefinition } from '@/features/canvas/nodeShapes'

const GROUP_NODE_PADDING = 24

function createNodeId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`
}

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

function moveNodeByDelta(
  state: CanvasState,
  id: NodeId,
  deltaX: number,
  deltaY: number,
) {
  const node = state.nodesById[id]
  if (!node) return

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
  childIdsByGroupId: Record<NodeId, Array<NodeId>>
  selectedNodeId: NodeId | null
  selectedNodeIds: Array<NodeId>
  isMarqueeSelecting: boolean
  editingNodeId: NodeId | null
  viewport: CanvasViewport
  actions: CanvasActions
}

export type CanvasViewport = {
  x: number
  y: number
  scale: number
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

type CanvasActions = {
  addNode: (node: CanvasNode) => void
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
}
const useCanvasStore = create<CanvasState>()(
  devtools(
    immer((set) => ({
      nodesById: {},
      nodeOrder: [],
      childIdsByGroupId: {},
      selectedNodeId: null,
      selectedNodeIds: [],
      isMarqueeSelecting: false,
      editingNodeId: null,
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
                const childIds = state.childIdsByGroupId[node.parentGroupId] ?? []
                if (!childIds.includes(node.id)) {
                  childIds.push(node.id)
                }
                state.childIdsByGroupId[node.parentGroupId] = childIds
              }
            },
            false,
            'canvas/addNode',
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

              delete state.nodesById[id]
              delete state.childIdsByGroupId[id]
              state.nodeOrder = state.nodeOrder.filter((nodeId) => nodeId !== id)
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
              const deltaX = x - node.x
              const deltaY = y - node.y
              const nextWidth = Math.max(shapeDefinition.minSize.width, width)
              const nextHeight = Math.max(shapeDefinition.minSize.height, height)
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
      },
    })),
    {
      name: 'CanvasStore',
      enabled: import.meta.env.DEV,
    },
  ),
)

export const useCanvasActions = () => useCanvasStore((state) => state.actions)

export const useCanvasNodes = () => useCanvasStore((state) => state.nodesById)
export const useCanvasNode: (id: NodeId) => CanvasNode | undefined = (id) =>
  useCanvasStore((state) => state.nodesById[id])
export const useCanvasNodeWidth = (id: NodeId) =>
  useCanvasStore((state) => state.nodesById[id]?.width)

export const useCanvasNodeIds = () =>
  useCanvasStore(useShallow((state) => state.nodeOrder))
export const useSelectedNodeId = () =>
  useCanvasStore((state) => state.selectedNodeId)
export const useSelectedNodeIds = () =>
  useCanvasStore(useShallow((state) => state.selectedNodeIds))
export const useIsMarqueeSelecting = () =>
  useCanvasStore((state) => state.isMarqueeSelecting)
export const useCanvasEditingNodeId = () =>
  useCanvasStore((state) => state.editingNodeId)
export const useCanvasViewport = () =>
  useCanvasStore((state) => state.viewport)
