import { useCallback, useEffect, useState } from 'react'
import { CANVAS_INITIAL_STAGE_SIZE } from '../constants'

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
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  const [size, setSize] = useState<StageSize>(CANVAS_INITIAL_STAGE_SIZE)
  const ref = useCallback((node: HTMLDivElement | null) => {
    setContainer(node)
  }, [])

  useEffect(() => {
    if (!container) return

    const update = () => {
      const rect = container.getBoundingClientRect()

      setSize({
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      })
    }

    update()
    const resizeObserver = new ResizeObserver(update)
    resizeObserver.observe(container)

    return () => resizeObserver.disconnect()
  }, [container])

  return {
    ref,
    size,
  }
}
