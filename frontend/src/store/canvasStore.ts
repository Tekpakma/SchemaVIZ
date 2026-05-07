import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import type { CanvasNode, NodeId } from '@/features/canvas/model/types'
import { useShallow } from 'zustand/react/shallow'
import { getCanvasNodeShapeDefinition } from '@/features/canvas/nodeShapes'

type CanvasState = {
  nodes: Record<NodeId, CanvasNode>
  selectedNodeId: NodeId | null
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
  startEditing: (id: NodeId) => void
  stopEditing: () => void
  setViewport: (viewport: CanvasViewport) => void
  moveNode: (payload: MoveNodePayload) => void
  resizeNode: (payload: ResizeNodePayload) => void
  updateNodeFrame: (payload: UpdateNodeFramePayload) => void
  commitNodeText: (payload: CommitNodeTextPayload) => void
}
const useCanvasStore = create<CanvasState>()(
  devtools(
    immer((set) => ({
      nodes: {},
      selectedNodeId: null,
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
              state.nodes[node.id] = node
            },
            false,
            'canvas/addNode',
          ),

        selectNode: (id) =>
          set(
            (state) => {
              state.selectedNodeId = id
            },
            false,
            'canvas/selectNode',
          ),

        startEditing: (id) =>
          set(
            (state) => {
              state.editingNodeId = id
              state.selectedNodeId = id
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
              const node = state.nodes[id]
              if (!node) return

              node.x = x
              node.y = y
            },
            false,
            'canvas/moveNode',
          ),

        resizeNode: ({ id, width, height }) =>
          set(
            (state) => {
              const node = state.nodes[id]
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
              const node = state.nodes[id]
              if (!node) return

              const shapeDefinition = getCanvasNodeShapeDefinition(node)

              node.x = x
              node.y = y
              node.width = Math.max(shapeDefinition.minSize.width, width)
              node.height = Math.max(shapeDefinition.minSize.height, height)
              node.version += 1
            },
            false,
            'canvas/updateNodeFrame',
          ),

        commitNodeText: ({ id, lexicalJson, html, contentHeight }) =>
          set(
            (state) => {
              const node = state.nodes[id]
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

export const useCanvasNode: (id: NodeId) => CanvasNode | undefined = (id) =>
  useCanvasStore((state) => state.nodes[id])
export const useCanvasNodeWidth = (id: NodeId) =>
  useCanvasStore((state) => state.nodes[id]?.width)

export const useCanvasNodeIds = () =>
  useCanvasStore(useShallow((state) => Object.keys(state.nodes)))
export const useSelectedNodeId = () =>
  useCanvasStore((state) => state.selectedNodeId)
export const useCanvasEditingNodeId = () =>
  useCanvasStore((state) => state.editingNodeId)
export const useCanvasViewport = () =>
  useCanvasStore((state) => state.viewport)
