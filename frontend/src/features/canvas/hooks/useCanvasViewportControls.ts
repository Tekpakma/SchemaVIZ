import { useCallback } from 'react'
import type { KonvaEventObject } from 'konva/lib/Node'
import {
  getCanvasNodesSnapshot,
  getCanvasViewportSnapshot,
  useCanvasActions,
  useCanvasNodeIds,
  useCanvasViewport,
} from '@/store/canvasStore'
import {
  CANVAS_MAX_SCALE,
  CANVAS_MIN_SCALE,
  CANVAS_SCALE_STEP,
} from '../constants'
import { getCanvasFitViewportForFrames } from '../fitView'

type StageSize = {
  width: number
  height: number
}

type ScreenPoint = {
  x: number
  y: number
}

function clampScale(scale: number) {
  return Math.min(CANVAS_MAX_SCALE, Math.max(CANVAS_MIN_SCALE, scale))
}

function getZoomedViewport(
  viewport: { x: number; y: number; scale: number },
  screenPoint: ScreenPoint,
  nextScale: number,
) {
  const pointInWorld = {
    x: (screenPoint.x - viewport.x) / viewport.scale,
    y: (screenPoint.y - viewport.y) / viewport.scale,
  }

  return {
    x: screenPoint.x - pointInWorld.x * nextScale,
    y: screenPoint.y - pointInWorld.y * nextScale,
    scale: nextScale,
  }
}



/**
 * Provides pan and pointer-centered zoom controls for the canvas viewport.
 */
export function useCanvasViewportControls(stageSize: StageSize) {
  const nodeIds = useCanvasNodeIds()
  const viewport = useCanvasViewport()
  const { setViewport } = useCanvasActions()

  const handleWheel = useCallback(
    (event: KonvaEventObject<WheelEvent>) => {
      event.evt.preventDefault()

      const stage = event.target.getStage()
      const pointer = stage?.getPointerPosition()
      if (!pointer) return

      const current = getCanvasViewportSnapshot()
      const nextScale = clampScale(
        event.evt.deltaY < 0
          ? current.scale * CANVAS_SCALE_STEP
          : current.scale / CANVAS_SCALE_STEP,
      )

      setViewport(getZoomedViewport(current, pointer, nextScale))
    },
    [setViewport],
  )

  const handleStageDragMove = useCallback(
    (event: KonvaEventObject<DragEvent>) => {
      if (event.target !== event.currentTarget) return

      setViewport({
        x: event.target.x(),
        y: event.target.y(),
        scale: getCanvasViewportSnapshot().scale,
      })
    },
    [setViewport],
  )

  const zoomAtStageCenter = useCallback(
    (nextScale: number) => {
      setViewport(
        getZoomedViewport(
          getCanvasViewportSnapshot(),
          {
            x: stageSize.width / 2,
            y: stageSize.height / 2,
          },
          clampScale(nextScale),
        ),
      )
    },
    [setViewport, stageSize.height, stageSize.width],
  )

  const zoomIn = useCallback(() => {
    zoomAtStageCenter(getCanvasViewportSnapshot().scale * CANVAS_SCALE_STEP)
  }, [zoomAtStageCenter])

  const zoomOut = useCallback(() => {
    zoomAtStageCenter(getCanvasViewportSnapshot().scale / CANVAS_SCALE_STEP)
  }, [zoomAtStageCenter])

  const fitView = useCallback(() => {
    const nodesById = getCanvasNodesSnapshot()

    const frames = nodeIds.flatMap((nodeId) => {
      const node = nodesById[nodeId]
      if (!node) return []
      return [{ id: node.id, x: node.x, y: node.y, width: node.width, height: node.height }]
    })

    const nextViewport = getCanvasFitViewportForFrames(frames, stageSize)
    if (nextViewport) setViewport(nextViewport)
  }, [nodeIds, setViewport, stageSize])

  return {
    viewport,
    canZoomIn: viewport.scale < CANVAS_MAX_SCALE,
    canZoomOut: viewport.scale > CANVAS_MIN_SCALE,
    canFitView: nodeIds.length > 0,
    fitView,
    handleStageDragMove,
    handleWheel,
    zoomIn,
    zoomOut,
  }
}
