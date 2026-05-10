import { useCallback, useEffect, useState } from 'react'
import { useCanvasActions, useCanvasStageSizeValue } from '@/store/canvasStore'

type StageSize = {
  width: number
  height: number
}

type CanvasStageSizeResult = {
  ref: (node: HTMLDivElement | null) => void
  size: StageSize
}

/**
 * Tracks the Konva stage dimensions from its canvas container.
 */
export function useCanvasStageSize(): CanvasStageSizeResult {
  const size = useCanvasStageSizeValue()
  const { setStageMounted, setStageSize } = useCanvasActions()
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  const ref = useCallback(
    (node: HTMLDivElement | null) => {
      setContainer(node)
      setStageMounted(Boolean(node))
    },
    [setStageMounted],
  )

  useEffect(() => {
    if (!container) return

    const update = () => {
      const rect = container.getBoundingClientRect()

      setStageSize({
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      })
    }

    update()
    const resizeObserver = new ResizeObserver(update)
    resizeObserver.observe(container)

    return () => resizeObserver.disconnect()
  }, [container, setStageSize])

  return {
    ref,
    size,
  }
}
