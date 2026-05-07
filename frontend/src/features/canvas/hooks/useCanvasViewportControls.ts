import { useCallback } from 'react'
import type { KonvaEventObject } from 'konva/lib/Node'
import {
  getCanvasNodesSnapshot,
  useCanvasActions,
  useCanvasNodeIds,
  useCanvasViewport,
} from '@/store/canvasStore'
import {
  CANVAS_MAX_SCALE,
  CANVAS_MIN_SCALE,
  CANVAS_SCALE_STEP,
} from '../constants'

const FIT_VIEW_PADDING = 64

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

function getFitViewScale(
  bounds: { width: number; height: number },
  stageSize: StageSize,
) {
  const availableWidth = Math.max(1, stageSize.width - FIT_VIEW_PADDING * 2)
  const availableHeight = Math.max(1, stageSize.height - FIT_VIEW_PADDING * 2)

  return clampScale(
    Math.min(availableWidth / bounds.width, availableHeight / bounds.height),
  )
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

      const nextScale = clampScale(
        event.evt.deltaY < 0
          ? viewport.scale * CANVAS_SCALE_STEP
          : viewport.scale / CANVAS_SCALE_STEP,
      )

      setViewport(getZoomedViewport(viewport, pointer, nextScale))
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

  const zoomAtStageCenter = useCallback(
    (nextScale: number) => {
      setViewport(
        getZoomedViewport(
          viewport,
          {
            x: stageSize.width / 2,
            y: stageSize.height / 2,
          },
          clampScale(nextScale),
        ),
      )
    },
    [setViewport, stageSize.height, stageSize.width, viewport],
  )

  const zoomIn = useCallback(() => {
    zoomAtStageCenter(viewport.scale * CANVAS_SCALE_STEP)
  }, [viewport.scale, zoomAtStageCenter])

  const zoomOut = useCallback(() => {
    zoomAtStageCenter(viewport.scale / CANVAS_SCALE_STEP)
  }, [viewport.scale, zoomAtStageCenter])

  const fitView = useCallback(() => {
    if (
      nodeIds.length === 0 ||
      stageSize.width === 0 ||
      stageSize.height === 0
    ) {
      return
    }

    const nodesById = getCanvasNodesSnapshot()

    let left = Number.POSITIVE_INFINITY
    let top = Number.POSITIVE_INFINITY
    let right = Number.NEGATIVE_INFINITY
    let bottom = Number.NEGATIVE_INFINITY
    let boundsNodeCount = 0

    for (const nodeId of nodeIds) {
      const node = nodesById[nodeId]
      if (!node) continue

      left = Math.min(left, node.x)
      top = Math.min(top, node.y)
      right = Math.max(right, node.x + node.width)
      bottom = Math.max(bottom, node.y + node.height)
      boundsNodeCount += 1
    }

    if (boundsNodeCount === 0) return

    const boundsWidth = Math.max(1, right - left)
    const boundsHeight = Math.max(1, bottom - top)
    const nextScale = getFitViewScale(
      { width: boundsWidth, height: boundsHeight },
      stageSize,
    )

    setViewport({
      x: (stageSize.width - boundsWidth * nextScale) / 2 - left * nextScale,
      y: (stageSize.height - boundsHeight * nextScale) / 2 - top * nextScale,
      scale: nextScale,
    })
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
