import { useIsMutating, useMutation } from '@tanstack/react-query'
import { useServerFn } from '@tanstack/react-start'
import { useCanvasActions, useCanvasSnapshotGetters } from '@/store/canvasStore'
import { layoutCanvasGraph } from '../layout.functions'
import { getCanvasFitViewportForFrames } from '../fitView'

type StageSize = {
  width: number
  height: number
}

export const CANVAS_LAYOUT_MUTATION_KEY = ['canvas-layout'] as const

/**
 * Encapsulates the full layout-and-fit-view flow: sends the current canvas
 * snapshot to the server for ELK layout, applies the result, and auto-fits
 * the viewport to the new node positions.
 */
export function useCanvasLayout(stageSize: StageSize) {
  const { applyGraphLayout } = useCanvasActions()
  const { getActiveCanvasTabIdSnapshot, getCanvasLayoutSnapshot } =
    useCanvasSnapshotGetters()
  const layoutCanvas = useServerFn(layoutCanvasGraph)
  const isLayoutPending =
    useIsMutating({ mutationKey: CANVAS_LAYOUT_MUTATION_KEY }) > 0

  const mutation = useMutation({
    mutationKey: CANVAS_LAYOUT_MUTATION_KEY,
    mutationFn: async () => {
      const tabId = getActiveCanvasTabIdSnapshot()
      const layout = await layoutCanvas({
        data: getCanvasLayoutSnapshot(tabId),
      })
      return { layout, tabId }
    },
    onSuccess: ({ layout, tabId }) => {
      const nextViewport = getCanvasFitViewportForFrames(
        layout.nodeFrames,
        stageSize,
      )
      applyGraphLayout(layout, { tabId, viewport: nextViewport })
    },
  })

  return {
    handleLayoutGraph: mutation.mutate,
    isLayoutPending,
  }
}
