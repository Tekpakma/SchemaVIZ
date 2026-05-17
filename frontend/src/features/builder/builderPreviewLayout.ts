import * as R from 'remeda'

import type { CanvasEdge, CanvasNode } from '@/features/canvas/model/types'
import {
  builderPreviewGroupLabelHtml,
  builderPreviewNodeHtml,
} from './builderPreviewHtml'
import type { RecipeData, RecipeGroupRule, RecipeLayer } from './types'

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

export function getBuilderPreviewColumns(
  recipe: RecipeData,
): BuilderPreviewColumn[] {
  const swatches =
    recipe.swatches.length > 0 ? recipe.swatches : FALLBACK_SWATCHES
  const layers = getPreviewLayers(recipe)
  const modelsByLayerId = R.groupBy(recipe.models, R.prop('layerId'))

  return layers.map((layer, index) => ({
    accent: swatches[index % swatches.length] ?? FALLBACK_SWATCHES[0]!,
    index,
    layerId: layer.id,
    label: layer.label,
    nodeCount: modelsByLayerId[layer.id]?.length ?? 0,
  }))
}

export function getBuilderPreviewNodes(
  recipe: RecipeData,
): BuilderPreviewNode[] {
  const columns = getBuilderPreviewColumns(recipe)
  const modelsByLayerId = R.groupBy(recipe.models, R.prop('layerId'))

  let globalIndex = 0

  return R.pipe(
    columns,
    R.flatMap((col) =>
      (modelsByLayerId[col.layerId] ?? []).map((model) => {
        const node: BuilderPreviewNode = {
          accent: col.accent,
          id: model.id,
          layerIndex: globalIndex,
          layerId: col.layerId,
          layerLabel: col.label,
          index: globalIndex,
          label: model.alias || model.displayName,
          modelId: model.modelId,
        }
        globalIndex++
        return node
      }),
    ),
  )
}

export function getBuilderPreviewEdges(
  recipe: RecipeData,
  nodes: BuilderPreviewNode[],
): BuilderPreviewEdge[] {
  const nodesById = R.indexBy(nodes, R.prop('id'))
  const nodesByLabel = R.indexBy(nodes, (n) => normalizePreviewLabel(n.label))

  return R.pipe(
    recipe.edges,
    R.flatMap((edge) => {
      const from =
        (edge.fromModelId ? nodesById[edge.fromModelId] : undefined) ??
        nodesByLabel[normalizePreviewLabel(edge.from)]
      const to =
        (edge.toModelId ? nodesById[edge.toModelId] : undefined) ??
        nodesByLabel[normalizePreviewLabel(edge.to)]
      if (!from || !to || from.id === to.id) return []

      return [{ accent: from.accent, from, id: edge.id, label: edge.via, to }]
    }),
  )
}

function getFilterCountByLayer(recipe: RecipeData) {
  return R.pipe(
    recipe.filters,
    R.groupBy((f) => normalizePreviewLabel(f.layer)),
    R.mapValues(R.length()),
  )
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
  groupRules,
  previewEdges,
  previewNodes,
  showEdges,
}: {
  columns: BuilderPreviewColumn[]
  filterCountByLayer: Record<string, number>
  groupRules: RecipeGroupRule[]
  previewEdges: BuilderPreviewEdge[]
  previewNodes: BuilderPreviewNode[]
  showEdges: boolean
}) {
  const filterParts = R.pipe(
    R.entries(filterCountByLayer),
    R.sortBy(([layer]) => layer),
    R.flatMap(([layer, count]) => ['filter', layer, count]),
  )

  const groupParts = R.pipe(
    groupRules,
    R.sortBy(R.prop('id')),
    R.flatMap((rule) => [
      'groupRule',
      rule.parentModelId,
      rule.childModelId,
      rule.via,
      rule.mode,
    ]),
  )

  const parts: (number | string)[] = [
    'builder-preview-v4',
    `edges:${showEdges}`,
    ...R.flatMap(columns, (col) => [
      'column',
      col.index,
      col.label,
      col.accent,
      col.nodeCount,
    ]),
    ...R.flatMap(previewNodes, (node) => [
      'node',
      node.id,
      node.label,
      node.modelId,
      node.layerId,
      node.layerLabel,
      node.layerIndex,
      node.index,
    ]),
    ...R.flatMap(previewEdges, (edge) => [
      'edge',
      edge.id,
      edge.from.id,
      edge.to.id,
      edge.label,
    ]),
    ...filterParts,
    ...groupParts,
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
  return R.pipe(
    columns,
    R.filter((col) => col.nodeCount > 0),
    R.map((col) => ({
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
    })),
  )
}

/**
 * Resolves which model IDs act as group containers based on recipe group rules.
 * Returns a map from child model ID → parent model ID for "group" mode rules.
 * "breakout" mode rules are tracked separately — children that break out
 * stay in their layer group rather than being nested in a parent model.
 */
function resolveGroupParents(
  groupRules: RecipeGroupRule[],
  previewNodes: BuilderPreviewNode[],
) {
  // Group rules reference recipe model IDs (node.id), not backend model
  // identifiers (node.modelId). Build a lookup by both so rules created
  // from traversal edges (which use node.id) and rules imported from
  // templates (which may use modelId) both resolve correctly.
  const nodesById = R.indexBy(previewNodes, R.prop('id'))
  const nodesByModelId = R.indexBy(previewNodes, R.prop('modelId'))
  // child model node ID → parent model node ID
  const childToGroupParent = new Map<string, string>()
  // model node IDs that are group containers
  const groupParentIds = new Set<string>()

  for (const rule of groupRules) {
    if (rule.mode !== 'group') continue
    const parent = nodesById[rule.parentModelId] ?? nodesByModelId[rule.parentModelId]
    const child = nodesById[rule.childModelId] ?? nodesByModelId[rule.childModelId]
    if (!parent || !child || parent.id === child.id) continue

    childToGroupParent.set(child.id, parent.id)
    groupParentIds.add(parent.id)
  }

  return { childToGroupParent, groupParentIds }
}

const MODEL_GROUP_PREFIX = 'builder-model-group:'

/**
 * Resolves the `parentGroupId` for a model node after group rules are applied.
 */
function resolveParentGroupId(
  node: BuilderPreviewNode,
  childToGroupParent: Map<string, string>,
  groupParentIds: Set<string>,
) {
  const groupParentNodeId = childToGroupParent.get(node.id)
  if (groupParentNodeId) return `${MODEL_GROUP_PREFIX}${groupParentNodeId}`
  if (groupParentIds.has(node.id)) return `${MODEL_GROUP_PREFIX}${node.id}`
  return `${LAYER_GROUP_PREFIX}${node.layerId}`
}

/**
 * Builds the complete canvas graph for the builder preview.
 *
 * ALL layout is delegated to ELK via `INCLUDE_CHILDREN`:
 * - Each non-empty layer becomes a compound group node
 * - Model nodes are children of their layer group (`parentGroupId`)
 * - Group rules promote parent models to group nodes with children inside
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

  const { childToGroupParent, groupParentIds } = resolveGroupParents(
    recipe.groupRules,
    previewNodes,
  )

  const key = getBuilderPreviewGraphKey({
    columns,
    filterCountByLayer,
    groupRules: recipe.groupRules,
    previewEdges,
    previewNodes,
    showEdges,
  })

  const layerGroupNodes = createLayerGroupNodes(columns)

  // Create group container nodes for models that act as group parents.
  // These are separate from the model's own box node — the model box and
  // its grouped children both live inside this container.
  const modelGroupNodes: CanvasNode[] = R.pipe(
    previewNodes,
    R.filter((node) => groupParentIds.has(node.id)),
    R.map((node) => ({
      id: `${MODEL_GROUP_PREFIX}${node.id}`,
      kind: 'group' as const,
      shape: 'group' as const,
      layoutMode: 'auto' as const,
      parentGroupId: `${LAYER_GROUP_PREFIX}${node.layerId}`,
      x: 0,
      y: 0,
      width: BUILDER_PREVIEW_GROUP_MIN_WIDTH,
      height: BUILDER_PREVIEW_GROUP_MIN_HEIGHT,
      lexicalJson: '',
      html: builderPreviewGroupLabelHtml(node.label, node.accent),
      contentHeight: LAYER_GROUP_LABEL_HEIGHT,
      version: 1,
    })),
  )

  const modelNodes: CanvasNode[] = previewNodes.map((node) => {
    const filterCount =
      filterCountByLayer[normalizePreviewLabel(node.label)] ??
      filterCountByLayer[normalizePreviewLabel(node.layerLabel)] ??
      0

    return {
      id: node.id,
      kind: 'generation' as const,
      shape: 'box' as const,
      layoutMode: 'auto' as const,
      parentGroupId: resolveParentGroupId(node, childToGroupParent, groupParentIds),
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

  // After group resolution some layer groups may be empty (all their
  // children were pulled into a model group in another layer). Collect
  // which layer group IDs still have at least one direct child.
  const occupiedLayerGroupIds = R.pipe(
    [...modelGroupNodes, ...modelNodes],
    R.map(R.prop('parentGroupId')),
    R.filter((id): id is string => id != null && id.startsWith(LAYER_GROUP_PREFIX)),
    (ids) => new Set(ids),
  )

  const activeLayerGroupNodes = layerGroupNodes.filter((node) =>
    occupiedLayerGroupIds.has(node.id),
  )

  const nodes = [...activeLayerGroupNodes, ...modelGroupNodes, ...modelNodes]

  // Suppress edges where containment already expresses the relationship:
  // if the child is grouped inside the parent, no arrow is needed.
  const edges: CanvasEdge[] = R.pipe(
    previewEdges,
    R.filter((edge) => {
      if (childToGroupParent.get(edge.to.id) === edge.from.id) return false
      if (childToGroupParent.get(edge.from.id) === edge.to.id) return false
      return true
    }),
    R.map((edge) => ({
      id: edge.id,
      sourceNodeId: edge.from.id,
      targetNodeId: edge.to.id,
      kind: 'default' as const,
      label: edge.label || undefined,
    })),
  )

  return { columns, edges, key, nodes }
}
