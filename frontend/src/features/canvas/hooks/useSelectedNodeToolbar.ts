import { useMemo } from 'react'
import { useCanvasNodes, useCanvasViewport } from '@/store/canvasStore'
import { useSelectedNodeBounds } from './useSelectedNodeBounds'

export type SelectedNodeToolbarPlacement = {
  x: number
  y: number
  selectedCount: number
  selectedGroupId: string | null
  canGroup: boolean
  canUngroup: boolean
}

/**
 * Computes a screen-space toolbar anchor for the current node selection.
 * Node bounds live in canvas world coordinates, so the placement is projected
 * through the viewport before being used by the HTML overlay.
 */
export function useSelectedNodeToolbar(): SelectedNodeToolbarPlacement | null {
  const nodes = useCanvasNodes()
  const bounds = useSelectedNodeBounds()
  const viewport = useCanvasViewport()

  return useMemo(() => {
    if (!bounds) return null

    const firstSelectedNodeId = bounds.selectedNodeIds[0]
    const selectedGroupId =
      bounds.selectedCount === 1 &&
      firstSelectedNodeId &&
      nodes[firstSelectedNodeId]?.shape === 'group'
        ? firstSelectedNodeId
        : null

    return {
      x: viewport.x + (bounds.x + bounds.width / 2) * viewport.scale,
      y: viewport.y + bounds.y * viewport.scale,
      selectedCount: bounds.selectedCount,
      selectedGroupId,
      canGroup:
        bounds.selectedCount > 1 &&
        bounds.selectedNodeIds.every((id) => {
          const node = nodes[id]
          return Boolean(node && node.shape !== 'group' && !node.parentGroupId)
        }),
      canUngroup: Boolean(selectedGroupId),
    }
  }, [bounds, nodes, viewport])
}
