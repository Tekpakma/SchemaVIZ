import { useIsMutating, useMutation } from '@tanstack/react-query'
import { useServerFn } from '@tanstack/react-start'
import { getCanvasLayoutSnapshot, useCanvasActions } from '@/store/canvasStore'
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
  const { applyGraphLayout, setViewport } = useCanvasActions()
  const layoutCanvas = useServerFn(layoutCanvasGraph)
  const isLayoutPending =
    useIsMutating({ mutationKey: CANVAS_LAYOUT_MUTATION_KEY }) > 0

  const mutation = useMutation({
    mutationKey: CANVAS_LAYOUT_MUTATION_KEY,
    mutationFn: async () => {
      const layout = await layoutCanvas({
        data: getCanvasLayoutSnapshot(),
      })
      return layout
    },
    onSuccess: (layout) => {
      applyGraphLayout(layout)

      const nextViewport = getCanvasFitViewportForFrames(
        layout.nodeFrames,
        stageSize,
      )
      if (nextViewport) {
        setViewport(nextViewport)
      }
    },
  })

  return {
    handleLayoutGraph: mutation.mutate,
    isLayoutPending,
  }
}
