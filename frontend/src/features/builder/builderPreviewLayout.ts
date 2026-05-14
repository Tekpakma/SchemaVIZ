import {
  SCHEMA_NODE_FIELD_COLOR,
  SCHEMA_NODE_SUBTITLE_COLOR,
  SCHEMA_NODE_TITLE_COLOR,
} from '@/features/canvas/themeColors'
import type { CanvasEdge, CanvasNode } from '@/features/canvas/model/types'
import type { RecipeData, RecipeLayer } from './types'

export const BUILDER_PREVIEW_STAGE_WIDTH = 960
export const BUILDER_PREVIEW_STAGE_HEIGHT = 520
export const BUILDER_PREVIEW_NODE_WIDTH = 156
export const BUILDER_PREVIEW_NODE_HEIGHT = 72
export const BUILDER_PREVIEW_NODE_RADIUS = 9

const STAGE_PADDING_X = 72
const STAGE_PADDING_TOP = 52
const COLUMN_GAP = 24
const NODE_VERTICAL_GAP = 16
const FALLBACK_SWATCHES = ['#C4006A', '#1D8B68', '#6A2B4D', '#18181B']

export type BuilderPreviewNode = {
  accent: string
  id: string
  layerIndex: number
  index: number
  label: string
  x: number
  y: number
}

export type BuilderPreviewEdge = {
  accent: string
  from: BuilderPreviewNode
  id: string
  label: string
  to: BuilderPreviewNode
}

export type BuilderPreviewColumn = {
  accent: string
  index: number
  label: string
  x: number
  width: number
  nodeCount: number
}

export type BuilderPreviewCanvasGraph = {
  columns: BuilderPreviewColumn[]
  edges: CanvasEdge[]
  key: string
  nodes: CanvasNode[]
}

export function normalizePreviewLabel(value: string) {
  return value.trim().toLowerCase().replace(/s$/, '')
}

function groupLayersByColumn(layers: RecipeLayer[]) {
  const columns: Array<{ label: string; layers: RecipeLayer[] }> = []
  const columnByLabel = new Map<string, number>()

  for (const layer of layers) {
    const key = normalizePreviewLabel(layer.label)
    const existing = columnByLabel.get(key)
    if (existing !== undefined) {
      columns[existing]!.layers.push(layer)
    } else {
      columnByLabel.set(key, columns.length)
      columns.push({ label: layer.label, layers: [layer] })
    }
  }

  return columns
}

export function getBuilderPreviewColumns(
  recipe: RecipeData,
): BuilderPreviewColumn[] {
  const swatches: string[] =
    recipe.swatches.length > 0 ? recipe.swatches : FALLBACK_SWATCHES
  const layers =
    recipe.layers.length > 0
      ? recipe.layers
      : [{ id: 'preview-empty-layer', label: recipe.title || 'Untitled layer' }]

  const groups = groupLayersByColumn(layers)
  const columnCount = groups.length
  const totalGap = (columnCount - 1) * COLUMN_GAP
  const availableWidth =
    BUILDER_PREVIEW_STAGE_WIDTH - STAGE_PADDING_X * 2 - totalGap
  const columnWidth = Math.max(
    BUILDER_PREVIEW_NODE_WIDTH,
    columnCount <= 1
      ? BUILDER_PREVIEW_NODE_WIDTH
      : availableWidth / columnCount,
  )

  return groups.map((group, index) => ({
    accent: swatches[index % swatches.length] ?? FALLBACK_SWATCHES[0]!,
    index,
    label: group.label,
    x:
      columnCount === 1
        ? BUILDER_PREVIEW_STAGE_WIDTH / 2 - columnWidth / 2
        : STAGE_PADDING_X + index * (columnWidth + COLUMN_GAP),
    width: columnWidth,
    nodeCount: group.layers.length,
  }))
}

export function getBuilderPreviewNodes(
  recipe: RecipeData,
): BuilderPreviewNode[] {
  const columns = getBuilderPreviewColumns(recipe)

  const nodes: BuilderPreviewNode[] = []
  let globalIndex = 0

  for (const col of columns) {
    const contentHeight =
      col.nodeCount * BUILDER_PREVIEW_NODE_HEIGHT +
      (col.nodeCount - 1) * NODE_VERTICAL_GAP
    const startY = Math.max(
      STAGE_PADDING_TOP,
      BUILDER_PREVIEW_STAGE_HEIGHT / 2 - contentHeight / 2,
    )
    const nodeX = col.x + col.width / 2 - BUILDER_PREVIEW_NODE_WIDTH / 2

    for (let i = 0; i < col.nodeCount; i++) {
      const layerIndex = globalIndex
      nodes.push({
        accent: col.accent,
        id: `${col.label}-${i}`,
        layerIndex,
        index: globalIndex,
        label: col.nodeCount > 1 ? `${col.label} ${i + 1}` : col.label,
        x: nodeX,
        y: startY + i * (BUILDER_PREVIEW_NODE_HEIGHT + NODE_VERTICAL_GAP),
      })
      globalIndex++
    }
  }

  return nodes
}

export function getBuilderPreviewEdges(
  recipe: RecipeData,
  nodes: BuilderPreviewNode[],
): BuilderPreviewEdge[] {
  const nodesByLabel = new Map(
    nodes.map((node) => [normalizePreviewLabel(node.label), node]),
  )
  const recipeEdges = recipe.edges.flatMap((edge) => {
    const from = nodesByLabel.get(normalizePreviewLabel(edge.from))
    const to = nodesByLabel.get(normalizePreviewLabel(edge.to))
    if (!from || !to || from.id === to.id) return []

    return [
      {
        accent: from.accent,
        from,
        id: edge.id,
        label: edge.via,
        to,
      },
    ]
  })

  if (recipeEdges.length > 0) return recipeEdges

  return nodes.slice(0, -1).map((node, index) => ({
    accent: node.accent,
    from: node,
    id: `preview-sequence-${node.id}-${nodes[index + 1]?.id}`,
    label: '',
    to: nodes[index + 1]!,
  }))
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function getFilterCountByLayer(recipe: RecipeData) {
  const filterCountByLayer = new Map<string, number>()

  for (const filter of recipe.filters) {
    const key = normalizePreviewLabel(filter.layer)
    filterCountByLayer.set(key, (filterCountByLayer.get(key) ?? 0) + 1)
  }

  return filterCountByLayer
}

function getCanvasNodeHtml(node: BuilderPreviewNode, filterCount: number) {
  const subtitle = `Layer ${node.index + 1}`
  const filterLabel =
    filterCount > 0
      ? `${filterCount} filter${filterCount === 1 ? '' : 's'}`
      : 'No filters'

  return `
    <div style="font-family: Inter, system-ui, sans-serif; padding: 14px 16px;">
      <div style="font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 8px; letter-spacing: 1.2px; text-transform: uppercase; color: ${SCHEMA_NODE_SUBTITLE_COLOR.light};">${escapeHtml(subtitle)}</div>
      <div style="margin-top: 8px; font-size: 13px; font-weight: 700; color: ${SCHEMA_NODE_TITLE_COLOR.light};">${escapeHtml(node.label)}</div>
      <div style="margin-top: 7px; font-size: 10px; color: ${SCHEMA_NODE_FIELD_COLOR.light};">${escapeHtml(filterLabel)}</div>
    </div>
  `
}

function encodePreviewKeyPart(value: number | string) {
  const text = String(value)
  return `${text.length}:${text}`
}

function getBuilderPreviewGraphKey({
  columns,
  filterCountByLayer,
  previewEdges,
  previewNodes,
}: {
  columns: BuilderPreviewColumn[]
  filterCountByLayer: Map<string, number>
  previewEdges: BuilderPreviewEdge[]
  previewNodes: BuilderPreviewNode[]
}) {
  const filterParts = [...filterCountByLayer.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([layer, count]) => ['filter', layer, count])

  const parts = [
    'builder-preview-v1',
    ...columns.flatMap((column) => [
      'column',
      column.index,
      column.label,
      column.accent,
      column.nodeCount,
    ]),
    ...previewNodes.flatMap((node) => [
      'node',
      node.id,
      node.label,
      node.layerIndex,
      node.index,
    ]),
    ...previewEdges.flatMap((edge) => [
      'edge',
      edge.id,
      edge.from.id,
      edge.to.id,
      edge.label,
    ]),
    ...filterParts,
  ]

  return parts.map(encodePreviewKeyPart).join('|')
}

export function getBuilderPreviewCanvasGraph(
  recipe: RecipeData,
): BuilderPreviewCanvasGraph {
  const columns = getBuilderPreviewColumns(recipe)
  const previewNodes = getBuilderPreviewNodes(recipe)
  const previewEdges = getBuilderPreviewEdges(recipe, previewNodes)
  const filterCountByLayer = getFilterCountByLayer(recipe)
  const key = getBuilderPreviewGraphKey({
    columns,
    filterCountByLayer,
    previewEdges,
    previewNodes,
  })
  const nodes: CanvasNode[] = previewNodes.map((node): CanvasNode => {
    const filterCount =
      filterCountByLayer.get(normalizePreviewLabel(node.label)) ?? 0

    return {
      id: node.id,
      kind: 'generation',
      shape: 'box',
      layoutMode: 'manual',
      x: node.x,
      y: node.y,
      width: BUILDER_PREVIEW_NODE_WIDTH,
      height: BUILDER_PREVIEW_NODE_HEIGHT,
      lexicalJson: '',
      html: getCanvasNodeHtml(node, filterCount),
      contentHeight: 0,
      version: 1,
    }
  })
  const edges: CanvasEdge[] = previewEdges.map((edge) => ({
    id: edge.id,
    sourceNodeId: edge.from.id,
    targetNodeId: edge.to.id,
    kind: 'default',
    label: edge.label || undefined,
  }))

  return { columns, edges, key, nodes }
}
