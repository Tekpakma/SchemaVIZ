import { useEffect } from 'react'
import { useCanvasActions, useCanvasNodeIds } from '@/store/canvasStore'
import { DEFAULT_CANVAS_NODE } from '../constants'

/**
 * Seeds the canvas with an initial rich-text node when it is empty.
 */
export function useEnsureDefaultCanvasNode() {
  const nodeIds = useCanvasNodeIds()
  const { addNode } = useCanvasActions()

  useEffect(() => {
    if (nodeIds.length > 0) return

    addNode(DEFAULT_CANVAS_NODE)
  }, [addNode, nodeIds.length])
}
