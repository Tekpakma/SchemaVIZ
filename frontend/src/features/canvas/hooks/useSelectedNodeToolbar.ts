import { useMemo } from 'react'
import {
  useCanvasNodes,
  useCanvasViewport,
  useSelectedNodeIds,
} from '@/store/canvasStore'

type Bounds = {
  x: number
  y: number
  width: number
  height: number
}

export type SelectedNodeToolbarPlacement = {
  x: number
  y: number
  selectedCount: number
}

function getBounds(items: Array<Bounds>): Bounds | null {
  if (items.length === 0) return null

  const left = Math.min(...items.map((item) => item.x))
  const top = Math.min(...items.map((item) => item.y))
  const right = Math.max(...items.map((item) => item.x + item.width))
  const bottom = Math.max(...items.map((item) => item.y + item.height))

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  }
}

/**
 * Computes a screen-space toolbar anchor for the current node selection.
 * Node bounds live in canvas world coordinates, so the placement is projected
 * through the viewport before being used by the HTML overlay.
 */
export function useSelectedNodeToolbar(): SelectedNodeToolbarPlacement | null {
  const nodes = useCanvasNodes()
  const selectedNodeIds = useSelectedNodeIds()
  const viewport = useCanvasViewport()

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
      x: viewport.x + (bounds.x + bounds.width / 2) * viewport.scale,
      y: viewport.y + bounds.y * viewport.scale,
      selectedCount: selectedNodeIds.length,
    }
  }, [nodes, selectedNodeIds, viewport])
}
