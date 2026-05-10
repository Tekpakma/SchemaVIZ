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
  resolveCanvasThemeColor,
} from '../themeColors'

const EDGE_ARROW_SIZE = 8

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

  const routes = useMemo(
    () =>
      edgeIds.flatMap((edgeId) => {
        const edge = edges[edgeId]
        if (!edge) return []

        const points = getEdgeRoute(edge, nodes, flowDirection, layoutOptions)
        if (!points) return []

        return [points]
      }),
    [edgeIds, edges, flowDirection, layoutOptions, nodes],
  )

  if (routes.length === 0) return null

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

        for (const route of routes) {
          const flatPoints = flattenPoints(route)
          if (flatPoints.length < 4) continue

          ctx.beginPath()
          ctx.moveTo(flatPoints[0] ?? 0, flatPoints[1] ?? 0)
          for (let index = 2; index < flatPoints.length; index += 2) {
            ctx.lineTo(flatPoints[index] ?? 0, flatPoints[index + 1] ?? 0)
          }
          ctx.stroke()

          const end = route.at(-1)
          const previous = route.at(-2)
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

        ctx.restore()
      }}
    />
  )
})
