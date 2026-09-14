import * as R from 'remeda'

import { schemaVizExportCreate } from '@/api/generated/schema-viz'
import type { SchemaVizFetchOptions } from '@/api/fetch'
import { getGenerationPreviewCanvasGraph } from '@/features/builder/generationPreviewGraph'
import type { GenerationRunResponse } from '@/features/builder/generationPreviewQuery'
import type { RecipeData } from '@/features/builder/types'
import { createStatelessExportRequestFromCanvas } from '@/features/canvas/export'
import { runElkLayout } from '@/features/canvas/layout.server'
import type { CanvasEdge, CanvasNode } from '@/features/canvas/model/types'
import {
  getBuilderPreviewFlowDirection,
  getBuilderPreviewLayoutOptions,
} from '@/features/elk/algorithms'
import type { CanvasExportSnapshot } from '@/store/canvasStore'

const PREVIEW_WIDTH = 1600
const PREVIEW_MIN_HEIGHT = 480
const PREVIEW_MAX_HEIGHT = 3200
// Node cards export as borderless white; a canvas-grey background keeps them visible.
const PREVIEW_BACKGROUND = '#f1f5f9'

/** Keeps the image as tall as the laid-out content so `fit` wastes no space. */
function previewHeight(nodes: Iterable<CanvasNode>): number {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const node of nodes) {
    minX = Math.min(minX, node.x)
    minY = Math.min(minY, node.y)
    maxX = Math.max(maxX, node.x + node.width)
    maxY = Math.max(maxY, node.y + node.height)
  }
  const width = maxX - minX
  const height = maxY - minY
  if (!(width > 0) || !(height > 0)) return Math.round(PREVIEW_WIDTH * 0.675)
  return Math.round(
    Math.min(
      PREVIEW_MAX_HEIGHT,
      Math.max(PREVIEW_MIN_HEIGHT, (PREVIEW_WIDTH * height) / width),
    ),
  )
}

/**
 * Renders a generation run to SVG without a browser: the same graph the
 * builder preview shows, laid out by the server-side ELK, serialised by the
 * Django export endpoint. Runs only on the server (ELK worker, backend call).
 */
export async function renderGenerationSvg(
  response: GenerationRunResponse,
  recipe: RecipeData,
  init: SchemaVizFetchOptions,
): Promise<string> {
  const graph = getGenerationPreviewCanvasGraph(response, recipe)
  if (graph.nodes.length === 0) {
    throw new Error('The diagram has no nodes to render.')
  }

  const nodesById: Record<string, CanvasNode> = R.indexBy(
    graph.nodes.map((node) => ({ ...node })),
    R.prop('id'),
  )
  const edgesById: Record<string, CanvasEdge> = R.indexBy(
    graph.edges.map((edge) => ({ ...edge })),
    R.prop('id'),
  )
  const childIdsByGroupId: Record<string, Array<string>> = {}
  for (const node of graph.nodes) {
    if (!node.parentGroupId) continue
    ;(childIdsByGroupId[node.parentGroupId] ??= []).push(node.id)
  }

  const flowDirection = getBuilderPreviewFlowDirection(recipe.layoutDirection)
  const layoutOptions = getBuilderPreviewLayoutOptions(recipe.layoutAlgorithm)

  const layout = await runElkLayout({
    nodesById,
    nodeOrder: graph.nodes.map((node) => node.id),
    childIdsByGroupId,
    edgesById,
    edgeOrder: graph.edges.map((edge) => edge.id),
    flowDirection,
    layoutOptions,
  })

  for (const frame of layout.nodeFrames) {
    const node = nodesById[frame.id]
    if (!node) continue
    node.x = frame.x
    node.y = frame.y
    node.width = frame.width
    node.height = frame.height
  }
  for (const route of layout.edgeRoutes) {
    const edge = edgesById[route.id]
    if (!edge) continue
    edge.routePoints = route.points
    if (route.labelPoint) edge.labelPoint = route.labelPoint
  }

  const snapshot: CanvasExportSnapshot = {
    nodesById,
    nodeOrder: graph.nodes.map((node) => node.id),
    edgesById,
    edgeOrder: graph.edges.map((edge) => edge.id),
    viewport: { x: 0, y: 0, scale: 1 },
    flowDirection,
    layoutOptions,
  }

  const exportResponse = await schemaVizExportCreate(
    createStatelessExportRequestFromCanvas(snapshot, {
      resolvedTheme: 'light',
      exportFormat: 'svg',
      mode: 'fit',
      width: PREVIEW_WIDTH,
      height: previewHeight(Object.values(nodesById)),
      background: PREVIEW_BACKGROUND,
      fileName: recipe.title.trim() || 'diagram',
    }),
    init,
  )
  if (exportResponse.status !== 200) {
    throw new Error(`Failed to render diagram: ${exportResponse.status}`)
  }

  // The fetch wrapper hands SVG back as text even though the generated
  // type promises a Blob for that content type.
  const body: unknown = exportResponse.data
  return typeof body === 'string' ? body : await (body as Blob).text()
}
