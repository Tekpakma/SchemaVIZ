import type { CanvasEdge, CanvasNode } from '@/features/canvas/model/types'
import {
  builderPreviewGroupLabelHtml,
  builderPreviewNodeHtml,
} from './builderPreviewHtml'
import type { RecipeData, RecipeLayer, RecipeModel } from './types'

export const BUILDER_PREVIEW_STAGE_WIDTH = 960
export const BUILDER_PREVIEW_STAGE_HEIGHT = 520
export const BUILDER_PREVIEW_NODE_WIDTH = 156
export const BUILDER_PREVIEW_NODE_HEIGHT = 72
export const BUILDER_PREVIEW_NODE_RADIUS = 9

/**
 * Minimum initial size for group nodes. ELK overrides these with computed
 * dimensions after layout, but the canvas renders HTML content immediately —
 * `render-tag` requires `width > 0` to measure text, so we must seed a
 * non-zero value to prevent the "width must be a positive number" crash.
 */
export const BUILDER_PREVIEW_GROUP_MIN_WIDTH = 200
export const BUILDER_PREVIEW_GROUP_MIN_HEIGHT = 100

const FALLBACK_SWATCHES = ['#C4006A', '#1D8B68', '#6A2B4D', '#18181B']
const LAYER_GROUP_PREFIX = 'builder-layer:'
const LAYER_GROUP_LABEL_HEIGHT = 28

export type BuilderPreviewNode = {
  accent: string
  id: string
  layerIndex: number
  layerId: string
  layerLabel: string
  index: number
  label: string
  modelId: string
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
  layerId: string
  label: string
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

function getPreviewLayers(recipe: RecipeData): RecipeLayer[] {
  if (recipe.layers.length > 0) return recipe.layers

  return [
    {
      id: 'preview-empty-layer',
      label: recipe.title || 'Models',
    },
  ]
}

function getModelsByLayerId(models: RecipeModel[]) {
  const modelsByLayerId = new Map<string, RecipeModel[]>()

  for (const model of models) {
    modelsByLayerId.set(model.layerId, [
      ...(modelsByLayerId.get(model.layerId) ?? []),
      model,
    ])
  }

  return modelsByLayerId
}

export function getBuilderPreviewColumns(
  recipe: RecipeData,
): BuilderPreviewColumn[] {
  const swatches: string[] =
    recipe.swatches.length > 0 ? recipe.swatches : FALLBACK_SWATCHES
  const layers = getPreviewLayers(recipe)
  const modelsByLayerId = getModelsByLayerId(recipe.models)

  return layers.map((layer, index) => ({
    accent: swatches[index % swatches.length] ?? FALLBACK_SWATCHES[0]!,
    index,
    layerId: layer.id,
    label: layer.label,
    nodeCount: modelsByLayerId.get(layer.id)?.length ?? 0,
  }))
}

export function getBuilderPreviewNodes(
  recipe: RecipeData,
): BuilderPreviewNode[] {
  const columns = getBuilderPreviewColumns(recipe)
  const modelsByLayerId = getModelsByLayerId(recipe.models)

  const nodes: BuilderPreviewNode[] = []
  let globalIndex = 0

  for (const col of columns) {
    const models = modelsByLayerId.get(col.layerId) ?? []
    if (models.length === 0) continue

    for (const model of models) {
      nodes.push({
        accent: col.accent,
        id: model.id,
        layerIndex: globalIndex,
        layerId: col.layerId,
        layerLabel: col.label,
        index: globalIndex,
        label: model.alias || model.displayName,
        modelId: model.modelId,
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
  const nodesById = new Map(nodes.map((node) => [node.id, node]))
  const nodesByLabel = new Map(
    nodes.map((node) => [normalizePreviewLabel(node.label), node]),
  )
  const recipeEdges = recipe.edges.flatMap((edge) => {
    const from =
      (edge.fromModelId ? nodesById.get(edge.fromModelId) : undefined) ??
      nodesByLabel.get(normalizePreviewLabel(edge.from))
    const to =
      (edge.toModelId ? nodesById.get(edge.toModelId) : undefined) ??
      nodesByLabel.get(normalizePreviewLabel(edge.to))
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

  return recipeEdges
}

function getFilterCountByLayer(recipe: RecipeData) {
  const filterCountByLayer = new Map<string, number>()

  for (const filter of recipe.filters) {
    const key = normalizePreviewLabel(filter.layer)
    filterCountByLayer.set(key, (filterCountByLayer.get(key) ?? 0) + 1)
  }

  return filterCountByLayer
}

function getNodeSubtitle(node: BuilderPreviewNode, filterCount: number) {
  return filterCount > 0
    ? `${filterCount} filter${filterCount === 1 ? '' : 's'}`
    : node.modelId
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
  showEdges,
}: {
  columns: BuilderPreviewColumn[]
  filterCountByLayer: Map<string, number>
  previewEdges: BuilderPreviewEdge[]
  previewNodes: BuilderPreviewNode[]
  showEdges: boolean
}) {
  const filterParts = [...filterCountByLayer.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([layer, count]) => ['filter', layer, count])

  const parts = [
    'builder-preview-v3',
    `edges:${showEdges}`,
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
      node.modelId,
      node.layerId,
      node.layerLabel,
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

export type BuilderPreviewCanvasGraphOptions = {
  showEdges?: boolean
}

/**
 * Spacing between initial group x positions. Only used as a hint for
 * ELK's INTERACTIVE layering strategy — actual positions are computed
 * by ELK. Wider spacing prevents adjacent groups from collapsing into
 * the same ELK layer when there are no inter-group edges.
 */
const LAYER_GROUP_X_HINT_SPACING = 300

/**
 * Creates layer group container nodes. ELK sizes these to fit children
 * after layout — initial dimensions are seeded at a minimum so render-tag
 * can measure content before ELK runs.
 *
 * Initial `x` positions are spaced by column index so ELK's INTERACTIVE
 * layering strategy assigns each group to a separate layer (left→right),
 * even when no inter-group edges exist (e.g. step 1).
 */
function createLayerGroupNodes(
  columns: BuilderPreviewColumn[],
): CanvasNode[] {
  return columns
    .filter((col) => col.nodeCount > 0)
    .map((col) => ({
      id: `${LAYER_GROUP_PREFIX}${col.layerId}`,
      kind: 'group' as const,
      shape: 'group' as const,
      layoutMode: 'auto' as const,
      x: col.index * LAYER_GROUP_X_HINT_SPACING,
      y: 0,
      width: BUILDER_PREVIEW_GROUP_MIN_WIDTH,
      height: BUILDER_PREVIEW_GROUP_MIN_HEIGHT,
      lexicalJson: '',
      html: builderPreviewGroupLabelHtml(col.label, col.accent),
      contentHeight: LAYER_GROUP_LABEL_HEIGHT,
      version: 1,
    }))
}

/**
 * Builds the complete canvas graph for the builder preview.
 *
 * ALL layout is delegated to ELK via `INCLUDE_CHILDREN`:
 * - Each non-empty layer becomes a compound group node
 * - Model nodes are children of their layer group (`parentGroupId`)
 * - All nodes use `layoutMode: 'auto'` — ELK positions everything
 * - Column backgrounds are replaced by ELK group rendering
 */
export function getBuilderPreviewCanvasGraph(
  recipe: RecipeData,
  options: BuilderPreviewCanvasGraphOptions = {},
): BuilderPreviewCanvasGraph {
  const { showEdges = true } = options
  const columns = getBuilderPreviewColumns(recipe)
  const previewNodes = getBuilderPreviewNodes(recipe)
  const previewEdges = showEdges
    ? getBuilderPreviewEdges(recipe, previewNodes)
    : []
  const filterCountByLayer = getFilterCountByLayer(recipe)

  const key = getBuilderPreviewGraphKey({
    columns,
    filterCountByLayer,
    previewEdges,
    previewNodes,
    showEdges,
  })

  const layerGroupNodes = createLayerGroupNodes(columns)

  const modelNodes: CanvasNode[] = previewNodes.map((node): CanvasNode => {
    const filterCount =
      filterCountByLayer.get(normalizePreviewLabel(node.label)) ??
      filterCountByLayer.get(normalizePreviewLabel(node.layerLabel)) ??
      0

    return {
      id: node.id,
      kind: 'generation',
      shape: 'box',
      layoutMode: 'auto',
      parentGroupId: `${LAYER_GROUP_PREFIX}${node.layerId}`,
      x: 0,
      y: 0,
      width: BUILDER_PREVIEW_NODE_WIDTH,
      height: BUILDER_PREVIEW_NODE_HEIGHT,
      lexicalJson: '',
      html: builderPreviewNodeHtml(node.label, getNodeSubtitle(node, filterCount)),
      contentHeight: 0,
      version: 1,
    }
  })

  const nodes = [...layerGroupNodes, ...modelNodes]

  const edges: CanvasEdge[] = previewEdges.map((edge) => ({
    id: edge.id,
    sourceNodeId: edge.from.id,
    targetNodeId: edge.to.id,
    kind: 'default',
    label: edge.label || undefined,
  }))

  return { columns, edges, key, nodes }
}
