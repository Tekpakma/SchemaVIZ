import { useCallback, useState } from 'react'
import type { KonvaEventObject } from 'konva/lib/Node'
import type { NodeId } from '../model/types'
import {
  useCanvasActions,
  useCanvasNodes,
  useCanvasViewport,
} from '@/store/canvasStore'

type Point = {
  x: number
  y: number
}

export type MarqueeSelectionRect = {
  x: number
  y: number
  width: number
  height: number
}

type MarqueeSelectionState = {
  start: Point
  rect: MarqueeSelectionRect
}

function normalizeRect(start: Point, end: Point): MarqueeSelectionRect {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  }
}

function containsNode(rect: MarqueeSelectionRect, nodeRect: MarqueeSelectionRect) {
  return (
    nodeRect.x >= rect.x &&
    nodeRect.y >= rect.y &&
    nodeRect.x + nodeRect.width <= rect.x + rect.width &&
    nodeRect.y + nodeRect.height <= rect.y + rect.height
  )
}

/**
 * Provides Shift+left-drag marquee selection in canvas world coordinates.
 * The hook converts pointer positions through the current viewport and selects
 * nodes whose full frame is contained in the dragged rectangle.
 */
export function useCanvasMarqueeSelection() {
  const nodes = useCanvasNodes()
  const viewport = useCanvasViewport()
  const { selectNodes } = useCanvasActions()
  const [selection, setSelection] = useState<MarqueeSelectionState | null>(null)

  const getPointerInWorld = useCallback(
    (event: KonvaEventObject<MouseEvent>): Point | null => {
      const stage = event.target.getStage()
      const pointer = stage?.getPointerPosition()
      if (!pointer) return null

      return {
        x: (pointer.x - viewport.x) / viewport.scale,
        y: (pointer.y - viewport.y) / viewport.scale,
      }
    },
    [viewport],
  )

  const selectNodesInRect = useCallback(
    (rect: MarqueeSelectionRect) => {
      const selectedIds: Array<NodeId> = []

      Object.values(nodes).forEach((node) => {
        if (
          containsNode(rect, {
            x: node.x,
            y: node.y,
            width: node.width,
            height: node.height,
          })
        ) {
          selectedIds.push(node.id)
        }
      })

      selectNodes(selectedIds)
    },
    [nodes, selectNodes],
  )

  const handleMarqueeMouseDown = useCallback(
    (event: KonvaEventObject<MouseEvent>) => {
      if (event.target !== event.currentTarget) return false
      if (!event.evt.shiftKey || event.evt.button !== 0) return false

      event.evt.preventDefault()

      const start = getPointerInWorld(event)
      if (!start) return false

      const rect = normalizeRect(start, start)
      setSelection({
        start,
        rect,
      })
      selectNodes([])

      return true
    },
    [getPointerInWorld, selectNodes],
  )

  const handleMarqueeMouseMove = useCallback(
    (event: KonvaEventObject<MouseEvent>) => {
      if (!selection) return

      const end = getPointerInWorld(event)
      if (!end) return

      const rect = normalizeRect(selection.start, end)
      setSelection({
        start: selection.start,
        rect,
      })
      selectNodesInRect(rect)
    },
    [getPointerInWorld, selectNodesInRect, selection],
  )

  const handleMarqueeMouseUp = useCallback(() => {
    setSelection(null)
  }, [])

  return {
    isSelecting: Boolean(selection),
    selectionRect: selection?.rect ?? null,
    handleMarqueeMouseDown,
    handleMarqueeMouseMove,
    handleMarqueeMouseUp,
  }
}
