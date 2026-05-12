import { Shape } from 'react-konva'
import { memo, useMemo } from 'react'
import {
  useCanvasEdgeIds,
  useCanvasEdges,
  useCanvasFlowDirection,
  useCanvasLayoutOptions,
  useCanvasNodes,
} from '@/store/canvasStore'
import type {
  CanvasEdge,
  CanvasFlowDirection,
  CanvasNode,
  CanvasPoint,
} from '@/features/canvas/model/types'
import { createFallbackEdgeRoute } from '../layoutAdapters'
import { useTheme } from '@/features/theme/useTheme'
import {
  CANVAS_EDGE_COLOR_FALLBACK,
  CANVAS_EDGE_COLOR_VARIABLE,
  CANVAS_EDGE_LABEL_TEXT_FALLBACK,
  CANVAS_EDGE_LABEL_TEXT_VARIABLE,
  CANVAS_SURFACE_FALLBACKS,
  CANVAS_NODE_SURFACE_VARIABLE,
  resolveCanvasThemeColor,
} from '../themeColors'

const EDGE_ARROW_SIZE = 8
const EDGE_LABEL_FONT_SIZE = 10
const EDGE_LABEL_PADDING_X = 4
const EDGE_LABEL_PADDING_Y = 2

function getEdgeRoute(
  edge: CanvasEdge,
  nodes: Record<string, CanvasNode>,
  flowDirection: CanvasFlowDirection,
  layoutOptions: ReturnType<typeof useCanvasLayoutOptions>,
): Array<CanvasPoint> | null {
  if (edge.routePoints && edge.routePoints.length >= 2) {
    return edge.routePoints
  }

  return createFallbackEdgeRoute(edge, nodes, flowDirection, layoutOptions)
}

/**
 * Draws a label at the midpoint of the edge route with a background pill.
 */
function drawEdgeLabel(
  ctx: CanvasRenderingContext2D,
  label: string,
  points: Array<CanvasPoint>,
  color: string,
  pillFill: string,
) {
  // Find the midpoint along the polyline
  let totalLength = 0
  for (let i = 1; i < points.length; i++) {
    const dx = points[i]!.x - points[i - 1]!.x
    const dy = points[i]!.y - points[i - 1]!.y
    totalLength += Math.sqrt(dx * dx + dy * dy)
  }

  const halfLength = totalLength / 2
  let walked = 0
  let labelX = points[0]!.x
  let labelY = points[0]!.y

  for (let i = 1; i < points.length; i++) {
    const p0 = points[i - 1]!
    const p1 = points[i]!
    const dx = p1.x - p0.x
    const dy = p1.y - p0.y
    const segLen = Math.sqrt(dx * dx + dy * dy)

    if (walked + segLen >= halfLength) {
      const t = segLen === 0 ? 0 : (halfLength - walked) / segLen
      labelX = p0.x + dx * t
      labelY = p0.y + dy * t
      break
    }

    walked += segLen
  }

  const metrics = ctx.measureText(label)
  const pillW = metrics.width + EDGE_LABEL_PADDING_X * 2
  const pillH = EDGE_LABEL_FONT_SIZE + EDGE_LABEL_PADDING_Y * 2
  const pillR = pillH / 2

  // Background pill
  ctx.fillStyle = pillFill
  ctx.beginPath()
  ctx.roundRect(labelX - pillW / 2, labelY - pillH / 2, pillW, pillH, pillR)
  ctx.fill()

  // Text
  ctx.fillStyle = color
  ctx.fillText(label, labelX, labelY)
}

function flattenPoints(points: Array<CanvasPoint>) {
  return points.flatMap((point) => [point.x, point.y])
}

export const CanvasEdges = memo(function CanvasEdges() {
  const nodes = useCanvasNodes()
  const edges = useCanvasEdges()
  const edgeIds = useCanvasEdgeIds()
  const flowDirection = useCanvasFlowDirection()
  const layoutOptions = useCanvasLayoutOptions()
  const { resolvedTheme } = useTheme()

  const stroke = useMemo(
    () =>
      resolveCanvasThemeColor({
        fallback: CANVAS_EDGE_COLOR_FALLBACK[resolvedTheme],
        variableName: CANVAS_EDGE_COLOR_VARIABLE,
      }),
    [resolvedTheme],
  )

  const labelPillFill = useMemo(
    () =>
      resolveCanvasThemeColor({
        fallback: CANVAS_SURFACE_FALLBACKS[resolvedTheme],
        variableName: CANVAS_NODE_SURFACE_VARIABLE,
      }),
    [resolvedTheme],
  )

  const labelTextColor = useMemo(
    () =>
      resolveCanvasThemeColor({
        fallback: CANVAS_EDGE_LABEL_TEXT_FALLBACK[resolvedTheme],
        variableName: CANVAS_EDGE_LABEL_TEXT_VARIABLE,
      }),
    [resolvedTheme],
  )

  const edgeRoutes = useMemo(
    () =>
      edgeIds.flatMap((edgeId) => {
        const edge = edges[edgeId]
        if (!edge) return []

        const points = getEdgeRoute(edge, nodes, flowDirection, layoutOptions)
        if (!points) return []

        return [{ points, label: edge.label }]
      }),
    [edgeIds, edges, flowDirection, layoutOptions, nodes],
  )

  if (edgeRoutes.length === 0) return null

  return (
    <Shape
      listening={false}
      sceneFunc={({ _context: ctx }) => {
        ctx.save()
        ctx.globalAlpha = 0.72
        ctx.strokeStyle = stroke
        ctx.fillStyle = stroke
        ctx.lineWidth = 1.4
        ctx.lineJoin = 'round'
        ctx.lineCap = 'round'

        for (const edgeRoute of edgeRoutes) {
          const { points } = edgeRoute
          const flatPoints = flattenPoints(points)
          if (flatPoints.length < 4) continue

          // Draw edge line
          ctx.beginPath()
          ctx.moveTo(flatPoints[0] ?? 0, flatPoints[1] ?? 0)
          for (let index = 2; index < flatPoints.length; index += 2) {
            ctx.lineTo(flatPoints[index] ?? 0, flatPoints[index + 1] ?? 0)
          }
          ctx.stroke()

          // Draw arrowhead
          const end = points.at(-1)
          const previous = points.at(-2)
          if (!end || !previous) continue

          const angle = Math.atan2(end.y - previous.y, end.x - previous.x)
          ctx.beginPath()
          ctx.moveTo(end.x, end.y)
          ctx.lineTo(
            end.x - Math.cos(angle - Math.PI / 6) * EDGE_ARROW_SIZE,
            end.y - Math.sin(angle - Math.PI / 6) * EDGE_ARROW_SIZE,
          )
          ctx.lineTo(
            end.x - Math.cos(angle + Math.PI / 6) * EDGE_ARROW_SIZE,
            end.y - Math.sin(angle + Math.PI / 6) * EDGE_ARROW_SIZE,
          )
          ctx.closePath()
          ctx.fill()
        }

        // Draw labels in a second pass so they sit on top of all lines
        ctx.font = `${EDGE_LABEL_FONT_SIZE}px sans-serif`
        ctx.textBaseline = 'middle'
        ctx.textAlign = 'center'
        ctx.globalAlpha = 1

        for (const edgeRoute of edgeRoutes) {
          if (!edgeRoute.label || edgeRoute.points.length < 2) continue
          drawEdgeLabel(ctx, edgeRoute.label, edgeRoute.points, labelTextColor, labelPillFill)
        }

        ctx.restore()
      }}
    />
  )
})
