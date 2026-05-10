import type {
  CanvasNodeFrame,
  CanvasPoint,
} from '@/features/canvas/model/types'
import type { CanvasViewport } from '@/store/canvasStore'
import { CANVAS_MAX_SCALE, CANVAS_MIN_SCALE } from './constants'

const FIT_VIEW_PADDING = 64

type StageSize = {
  width: number
  height: number
}

function clampScale(scale: number) {
  return Math.min(CANVAS_MAX_SCALE, Math.max(CANVAS_MIN_SCALE, scale))
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
 * Computes a viewport that centers and scales to fit all given node frames
 * within the stage, with padding. Returns null if no frames or stage has no area.
 */
export function getCanvasFitViewportForFrames(
  frames: Array<CanvasNodeFrame>,
  stageSize: StageSize,
): CanvasViewport | null {
  if (frames.length === 0 || stageSize.width === 0 || stageSize.height === 0) {
    return null
  }

  let left = Number.POSITIVE_INFINITY
  let top = Number.POSITIVE_INFINITY
  let right = Number.NEGATIVE_INFINITY
  let bottom = Number.NEGATIVE_INFINITY

  for (const frame of frames) {
    left = Math.min(left, frame.x)
    top = Math.min(top, frame.y)
    right = Math.max(right, frame.x + frame.width)
    bottom = Math.max(bottom, frame.y + frame.height)
  }

  const width = Math.max(1, right - left)
  const height = Math.max(1, bottom - top)
  const scale = getFitViewScale({ width, height }, stageSize)

  return {
    x: (stageSize.width - width * scale) / 2 - left * scale,
    y: (stageSize.height - height * scale) / 2 - top * scale,
    scale,
  }
}

/**
 * Computes a viewport that centers and scales to fit all given points
 * within the stage. Delegates to getCanvasFitViewportForFrames with 1×1 frames.
 */
export function getCanvasFitViewportForPoints(
  points: Array<CanvasPoint>,
  stageSize: StageSize,
): CanvasViewport | null {
  const frames = points.map((point) => ({
    id: '',
    x: point.x,
    y: point.y,
    width: 1,
    height: 1,
  }))

  return getCanvasFitViewportForFrames(frames, stageSize)
}
