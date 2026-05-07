import { useMemo } from 'react'
import {
  useCanvasNodes,
  useSelectedNodeIds,
} from '@/store/canvasStore'
import type { NodeId } from '../model/types'

type Bounds = {
  x: number
  y: number
  width: number
  height: number
}

export type SelectedNodeBounds = Bounds & {
  selectedCount: number
  selectedNodeIds: Array<NodeId>
}

function getBounds(items: Array<Bounds>): Bounds | null {
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

/**
 * Computes the combined world-space bounds for the current node selection.
 * Components use this as the shared source for toolbar placement and the
 * draggable multi-selection frame.
 */
export function useSelectedNodeBounds(): SelectedNodeBounds | null {
  const nodes = useCanvasNodes()
  const selectedNodeIds = useSelectedNodeIds()

  return useMemo(() => {
    const selectedBounds = selectedNodeIds.flatMap((id) => {
      const node = nodes[id]
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

    const bounds = getBounds(selectedBounds)
    if (!bounds) return null

    return {
      ...bounds,
      selectedCount: selectedNodeIds.length,
      selectedNodeIds,
    }
  }, [nodes, selectedNodeIds])
}
