import { useEffect } from 'react'
import { useCanvasActions, useCanvasNodeIds } from '@/store/canvasStore'
import { DEFAULT_CANVAS_NODES } from '../constants'
import { getCanvasSeedNodesFromSearch } from '../stressScene'

/**
 * Seeds the canvas with an initial rich-text node when it is empty.
 */
export function useEnsureDefaultCanvasNode() {
  const nodeIds = useCanvasNodeIds()
  const { addNode } = useCanvasActions()

  useEffect(() => {
    if (nodeIds.length > 0) return

    const seedNodes =
      getCanvasSeedNodesFromSearch(globalThis.location.search) ??
      DEFAULT_CANVAS_NODES

    seedNodes.forEach((seedNode) => addNode(seedNode))
  }, [addNode, nodeIds.length])
}
