import { useCallback, useRef, useState } from 'react'
import type { KonvaEventObject } from 'konva/lib/Node'
import type { NodeId } from '../model/types'
import {
  useCanvasActions,
  useCanvasNodeIds,
  useCanvasNodes,
  useCanvasViewport,
  useIsMarqueeSelecting,
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

function hasSameIds(left: Array<NodeId>, right: Array<NodeId>) {
  if (left.length !== right.length) return false

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false
  }

  return true
}

/**
 * Provides Shift+left-drag marquee selection in canvas world coordinates.
 * The hook converts pointer positions through the current viewport and selects
 * nodes whose frame intersects the dragged rectangle.
 */
export function useCanvasMarqueeSelection() {
  const nodes = useCanvasNodes()
  const nodeIds = useCanvasNodeIds()
  const viewport = useCanvasViewport()
  const isMarqueeSelecting = useIsMarqueeSelecting()
  const { selectNodesFromMarquee, setMarqueeSelecting } = useCanvasActions()
  const [selection, setSelection] = useState<MarqueeSelectionState | null>(null)
  const lastSelectedIdsRef = useRef<Array<NodeId>>([])

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
      const rectRight = rect.x + rect.width
      const rectBottom = rect.y + rect.height

      // TODO: Consider a quadtree or uniform grid index once canvases reach
      // thousands of nodes; marquee selection is currently a linear scan.
      for (const nodeId of nodeIds) {
        const node = nodes[nodeId]
        if (!node) continue

        const nodeRight = node.x + node.width
        const nodeBottom = node.y + node.height
        if (
          node.x < rectRight &&
          nodeRight > rect.x &&
          node.y < rectBottom &&
          nodeBottom > rect.y
        ) {
          selectedIds.push(node.id)
        }
      }

      if (hasSameIds(selectedIds, lastSelectedIdsRef.current)) return

      lastSelectedIdsRef.current = selectedIds
      selectNodesFromMarquee(selectedIds)
    },
    [nodeIds, nodes, selectNodesFromMarquee],
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
      lastSelectedIdsRef.current = []
      setMarqueeSelecting(true)
      selectNodesFromMarquee([])

      return true
    },
    [getPointerInWorld, selectNodesFromMarquee, setMarqueeSelecting],
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
    lastSelectedIdsRef.current = []
    setMarqueeSelecting(false)
  }, [setMarqueeSelecting])

  return {
    isSelecting: isMarqueeSelecting,
    selectionRect: selection?.rect ?? null,
    handleMarqueeMouseDown,
    handleMarqueeMouseMove,
    handleMarqueeMouseUp,
  }
}
