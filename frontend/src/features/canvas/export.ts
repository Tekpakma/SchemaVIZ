import type { StatelessExportRequest } from '@/api/contracts'
import type { ResolvedTheme } from '@/features/theme/constants'
import type { CanvasExportSnapshot } from '@/store/canvasStore'
import { extractPlainTextFromHtml } from '@/utils/html'
import * as R from 'remeda'
import type {
  CanvasEdge,
  CanvasNode,
  CanvasPoint,
  CanvasPortSide,
} from './model/types'
import { createFallbackEdgeRoute, resolveEdgePortSide } from './layoutAdapters'
import { getCanvasNodeShapeDefinition } from './nodeShapes'
import {
  CANVAS_EDGE_COLOR_FALLBACK,
  CANVAS_SELECT_COLOR,
  CANVAS_SURFACE_FALLBACKS,
} from './themeColors'

const DEFAULT_EXPORT_BACKGROUND = '#ffffff'
const DEFAULT_EXPORT_FILE_NAME = 'canvas-export'
const BOX_BORDER_COLOR = 'transparent'

type CanvasExportPalette = {
  edgeColor: string
  nodeSurfaceColor: string
}

type SerializedReactFlowNode = {
  id: string
  type: 'box' | 'group'
  position: {
    x: number
    y: number
  }
  positionAbsolute?: {
    x: number
    y: number
  }
  width: number
  height: number
  parentId?: string
  parentNode?: string
  data: Record<string, unknown>
  style: Record<string, unknown>
}

type SerializedReactFlowEdge = {
  id: string
  source: string
  target: string
  sourceHandle: string
  targetHandle: string
  type: 'elk'
  data?: Record<string, unknown>
  style: Record<string, unknown>
}

type CanvasExportRequestOptions = {
  background?: string
  edgeColor?: string
  exportFormat?: 'svg' | 'drawio'
  fileName?: string
  height?: number | null
  mode?: 'fit' | 'current'
  nodeSurfaceColor?: string
  resolvedTheme: ResolvedTheme
  scaleFactor?: number
  width?: number | null
}

function createPortHandleId(nodeId: string, side: CanvasPortSide) {
  return `${nodeId}:port:${side}`
}

function parseLexicalState(lexicalJson: string) {
  const trimmed = lexicalJson.trim()
  if (!trimmed) {
    return null
  }

  try {
    const parsed = JSON.parse(trimmed)
    return R.isPlainObject(parsed) ? parsed : null
  } catch {
    return null
  }
}

function getNodeLabel(node: CanvasNode) {
  const htmlLabel = extractPlainTextFromHtml(node.html)
  if (htmlLabel) {
    return htmlLabel
  }

  const appLabel = 'appLabel' in node ? node.appLabel : undefined
  const modelName = 'modelName' in node ? node.modelName : undefined
  if (appLabel && modelName) {
    return `${appLabel}.${modelName}`
  }

  return ''
}

function createNodeData(
  node: CanvasNode,
  label: string,
  lexicalState: Record<string, unknown> | null,
) {
  const data: Record<string, unknown> = {
    shape: node.shape,
  }

  if (label) {
    data.label = label
  }

  if (lexicalState) {
    data.initialTextContent = lexicalState
  }

  if ('appLabel' in node && node.appLabel) {
    data.appLabel = node.appLabel
  }

  if ('modelName' in node && node.modelName) {
    data.modelName = node.modelName
  }

  if ('recordId' in node && node.recordId) {
    data.modelId = node.recordId
  }

  return data
}

function createNodeStyle(node: CanvasNode, palette: CanvasExportPalette) {
  const shapeDefinition = getCanvasNodeShapeDefinition(node)

  if (node.kind === 'group') {
    return {
      backgroundColor: palette.nodeSurfaceColor,
      borderColor: CANVAS_SELECT_COLOR,
      borderRadius: shapeDefinition.cornerRadius,
      borderWidth: 1.5,
    }
  }

  return {
    backgroundColor: palette.nodeSurfaceColor,
    borderColor: BOX_BORDER_COLOR,
    borderRadius: shapeDefinition.cornerRadius,
    borderWidth: 0,
  }
}

function resolveExportPalette(
  options: CanvasExportRequestOptions,
): CanvasExportPalette {
  return {
    edgeColor:
      options.edgeColor ?? CANVAS_EDGE_COLOR_FALLBACK[options.resolvedTheme],
    nodeSurfaceColor:
      options.nodeSurfaceColor ??
      CANVAS_SURFACE_FALLBACKS[options.resolvedTheme],
  }
}

function serializeCanvasNode(
  node: CanvasNode,
  palette: CanvasExportPalette,
  parentNode?: CanvasNode,
): {
  lexicalState: Record<string, unknown> | null
  node: SerializedReactFlowNode
} {
  const lexicalState = parseLexicalState(node.lexicalJson)
  const label = getNodeLabel(node)
  const position = parentNode
    ? {
        x: node.x - parentNode.x,
        y: node.y - parentNode.y,
      }
    : {
        x: node.x,
        y: node.y,
      }

  return {
    lexicalState,
    node: {
      id: node.id,
      type: node.shape,
      position,
      positionAbsolute: {
        x: node.x,
        y: node.y,
      },
      width: node.width,
      height: node.height,
      ...(node.parentGroupId
        ? {
            parentId: node.parentGroupId,
            parentNode: node.parentGroupId,
          }
        : {}),
      data: createNodeData(node, label, lexicalState),
      style: createNodeStyle(node, palette),
    },
  }
}

function createElkSections(points: Array<CanvasPoint>) {
  const startPoint = points[0]
  const endPoint = points.at(-1)
  if (!startPoint || !endPoint) {
    return undefined
  }

  const bendPoints = points.slice(1, -1)

  return [
    {
      startPoint,
      endPoint,
      ...(bendPoints.length > 0 ? { bendPoints } : {}),
    },
  ]
}

function getEdgeRoutePoints(edge: CanvasEdge, snapshot: CanvasExportSnapshot) {
  if (edge.routePoints && edge.routePoints.length >= 2) {
    return edge.routePoints
  }

  return createFallbackEdgeRoute(
    edge,
    snapshot.nodesById,
    snapshot.flowDirection,
    snapshot.layoutOptions,
  )
}

function serializeCanvasEdge(
  edge: CanvasEdge,
  snapshot: CanvasExportSnapshot,
  palette: CanvasExportPalette,
): SerializedReactFlowEdge {
  const sourceSide = resolveEdgePortSide(
    edge.sourcePort,
    'source',
    snapshot.flowDirection,
    snapshot.layoutOptions,
  )
  const targetSide = resolveEdgePortSide(
    edge.targetPort,
    'target',
    snapshot.flowDirection,
    snapshot.layoutOptions,
  )
  const routePoints = getEdgeRoutePoints(edge, snapshot)
  const elkSections = routePoints ? createElkSections(routePoints) : undefined

  return {
    id: edge.id,
    source: edge.sourceNodeId,
    target: edge.targetNodeId,
    sourceHandle: createPortHandleId(edge.sourceNodeId, sourceSide),
    targetHandle: createPortHandleId(edge.targetNodeId, targetSide),
    type: 'elk',
    ...(elkSections
      ? {
          data: {
            elkSections,
          },
        }
      : {}),
    style: {
      stroke: palette.edgeColor,
      strokeWidth: 1.4,
    },
  }
}

export function createCanvasReactFlowState(
  snapshot: CanvasExportSnapshot,
  options: Pick<
    CanvasExportRequestOptions,
    'edgeColor' | 'nodeSurfaceColor' | 'resolvedTheme'
  >,
) {
  const palette = resolveExportPalette({
    ...options,
  })

  const serializedNodes = R.pipe(
    snapshot.nodeOrder,
    R.flatMap((nodeId) => {
      const node = snapshot.nodesById[nodeId]
      if (!node) {
        return []
      }

      const parentNode = node.parentGroupId
        ? snapshot.nodesById[node.parentGroupId]
        : undefined
      return [serializeCanvasNode(node, palette, parentNode).node]
    }),
  )

  const serializedEdges = R.pipe(
    snapshot.edgeOrder,
    R.flatMap((edgeId) => {
      const edge = snapshot.edgesById[edgeId]
      if (!edge) {
        return []
      }

      return [serializeCanvasEdge(edge, snapshot, palette)]
    }),
  )

  return {
    nodes: serializedNodes,
    edges: serializedEdges,
    viewport: {
      x: snapshot.viewport.x,
      y: snapshot.viewport.y,
      zoom: snapshot.viewport.scale,
    },
  }
}

export function createStatelessExportRequestFromCanvas(
  snapshot: CanvasExportSnapshot,
  options: CanvasExportRequestOptions,
): StatelessExportRequest {
  const palette = resolveExportPalette(options)

  const serializedNodes = R.pipe(
    snapshot.nodeOrder,
    R.flatMap((nodeId) => {
      const node = snapshot.nodesById[nodeId]
      if (!node) {
        return []
      }

      const parentNode = node.parentGroupId
        ? snapshot.nodesById[node.parentGroupId]
        : undefined
      return [serializeCanvasNode(node, palette, parentNode)]
    }),
  )

  const lexicalStateEntries = serializedNodes.flatMap(
    ({ lexicalState, node }) => {
      if (!lexicalState) {
        return []
      }

      return [[node.id, lexicalState] as const]
    },
  )

  return {
    reactFlowState: {
      nodes: serializedNodes.map(({ node }) => node),
      edges: R.pipe(
        snapshot.edgeOrder,
        R.flatMap((edgeId) => {
          const edge = snapshot.edgesById[edgeId]
          if (!edge) {
            return []
          }

          return [serializeCanvasEdge(edge, snapshot, palette)]
        }),
      ),
      viewport: {
        x: snapshot.viewport.x,
        y: snapshot.viewport.y,
        zoom: snapshot.viewport.scale,
      },
    },
    ...(lexicalStateEntries.length > 0
      ? {
          lexicalState: Object.fromEntries(lexicalStateEntries),
        }
      : {}),
    exportFormat: options.exportFormat ?? 'svg',
    mode: options.mode ?? 'fit',
    width: options.width ?? null,
    height: options.height ?? null,
    fileName: options.fileName ?? DEFAULT_EXPORT_FILE_NAME,
    scaleFactor: options.scaleFactor ?? 1,
    background: options.background ?? DEFAULT_EXPORT_BACKGROUND,
  }
}
