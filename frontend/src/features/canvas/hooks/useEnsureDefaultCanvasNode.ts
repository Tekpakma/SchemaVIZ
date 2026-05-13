import { useEffect } from 'react'
import {
  useActiveCanvasTabId,
  useCanvasActions,
  useCanvasNodeIds,
} from '@/store/canvasStore'
import { DEFAULT_CANVAS_EDGES, DEFAULT_CANVAS_NODES } from '../constants'
import {
  getCanvasSeedEdgesFromSearch,
  getCanvasSeedNodesFromSearch,
} from '../stressScene'

/**
 * Seeds the canvas with an initial rich-text node when it is empty.
 */
export function useEnsureDefaultCanvasNode() {
  const activeTabId = useActiveCanvasTabId()
  const nodeIds = useCanvasNodeIds()
  const { seedActiveDocument } = useCanvasActions()

  useEffect(() => {
    if (nodeIds.length > 0) return

    const seedNodes =
      getCanvasSeedNodesFromSearch(globalThis.location.search) ??
      DEFAULT_CANVAS_NODES
    const seedEdges =
      getCanvasSeedEdgesFromSearch(globalThis.location.search) ??
      DEFAULT_CANVAS_EDGES

    seedActiveDocument({
      nodes: seedNodes,
      edges: seedEdges,
    })
  }, [activeTabId, nodeIds.length, seedActiveDocument])
}
