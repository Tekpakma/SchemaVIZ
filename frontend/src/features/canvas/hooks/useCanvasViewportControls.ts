import { useCallback } from 'react'
import type { KonvaEventObject } from 'konva/lib/Node'
import { useCanvasActions, useCanvasViewport } from '@/store/canvasStore'
import {
  CANVAS_MAX_SCALE,
  CANVAS_MIN_SCALE,
  CANVAS_SCALE_STEP,
} from '../constants'

function clampScale(scale: number) {
  return Math.min(CANVAS_MAX_SCALE, Math.max(CANVAS_MIN_SCALE, scale))
}

/**
 * Provides pan and pointer-centered zoom controls for the canvas viewport.
 */
export function useCanvasViewportControls() {
  const viewport = useCanvasViewport()
  const { setViewport } = useCanvasActions()

  const handleWheel = useCallback(
    (event: KonvaEventObject<WheelEvent>) => {
      event.evt.preventDefault()

      const stage = event.target.getStage()
      const pointer = stage?.getPointerPosition()
      if (!pointer) return

      const nextScale = clampScale(
        event.evt.deltaY < 0
          ? viewport.scale * CANVAS_SCALE_STEP
          : viewport.scale / CANVAS_SCALE_STEP,
      )

      const pointerInWorld = {
        x: (pointer.x - viewport.x) / viewport.scale,
        y: (pointer.y - viewport.y) / viewport.scale,
      }

      setViewport({
        x: pointer.x - pointerInWorld.x * nextScale,
        y: pointer.y - pointerInWorld.y * nextScale,
        scale: nextScale,
      })
    },
    [setViewport, viewport],
  )

  const handleStageDragMove = useCallback(
    (event: KonvaEventObject<DragEvent>) => {
      if (event.target !== event.currentTarget) return

      setViewport({
        x: event.target.x(),
        y: event.target.y(),
        scale: viewport.scale,
      })
    },
    [setViewport, viewport.scale],
  )

  return {
    viewport,
    handleStageDragMove,
    handleWheel,
  }
}
