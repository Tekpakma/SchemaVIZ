import { useEffect } from 'react'
import { useCanvasActions, useCanvasNodeIds } from '@/store/canvasStore'
import { DEFAULT_CANVAS_EDGES, DEFAULT_CANVAS_NODES } from '../constants'
import {
  getCanvasSeedEdgesFromSearch,
  getCanvasSeedNodesFromSearch,
} from '../stressScene'

/**
 * Seeds the canvas with an initial rich-text node when it is empty.
 */
export function useEnsureDefaultCanvasNode() {
  const nodeIds = useCanvasNodeIds()
  const { setGraph } = useCanvasActions()

  useEffect(() => {
    if (nodeIds.length > 0) return

    const seedNodes =
      getCanvasSeedNodesFromSearch(globalThis.location.search) ??
      DEFAULT_CANVAS_NODES
    const seedEdges =
      getCanvasSeedEdgesFromSearch(globalThis.location.search) ??
      DEFAULT_CANVAS_EDGES

    setGraph({
      nodes: seedNodes,
      edges: seedEdges,
    })
  }, [nodeIds.length, setGraph])
}
