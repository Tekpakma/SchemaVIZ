import * as R from 'remeda'

import {
  getParentNodeIdByNodeId,
  isRenderableCanvasEdge,
} from '@/features/canvas/compoundGraph'
import type {
  CanvasEdge,
  CanvasGroupLayoutPolicy,
  CanvasNode,
  CanvasNodeStyleOverrides,
} from '@/features/canvas/model/types'
import { CANVAS_NODE_SHAPES } from '@/features/canvas/nodeShapes'
import {
  builderEditableTemplateNodeHtml,
} from './builderPreviewHtml'
import {
  createTemplateTextContent,
  renderTemplateTextContent,
  stringifyTemplateTextContent,
} from '@/features/lexical/templateTextContent'
import type {
  RecipeData,
  RecipeGroupRule,
  RecipeLayer,
  RecipeStyleDraft,
} from './types'

export const BUILDER_PREVIEW_STAGE_WIDTH = 960
export const BUILDER_PREVIEW_STAGE_HEIGHT = 520
/** Use central shape definition for consistent sizing */
export const BUILDER_PREVIEW_NODE_WIDTH =
  CANVAS_NODE_SHAPES.box.defaultSize.width
export const BUILDER_PREVIEW_NODE_HEIGHT =
  CANVAS_NODE_SHAPES.box.defaultSize.height
export const BUILDER_PREVIEW_NODE_RADIUS = CANVAS_NODE_SHAPES.box.cornerRadius

export const BUILDER_PREVIEW_GROUP_MIN_WIDTH = 220
export const BUILDER_PREVIEW_GROUP_MIN_HEIGHT = 116

const FALLBACK_SWATCHES = ['#C4006A', '#1D8B68', '#6A2B4D', '#18181B']
const LAYER_COLUMN_MIN_GAP = 128
const LAYER_COLUMN_MAX_GAP = 280
const EDGE_LABEL_APPROX_CHAR_WIDTH = 6
const EDGE_LABEL_GAP_PADDING = 56
const STATIC_EDGE_LABEL_Y_OFFSET = 14
const LAYER_LABEL_RESERVED_TOP_SPACE = 56
const LAYER_NODE_Y_HINT_SPACING = BUILDER_PREVIEW_NODE_HEIGHT + 48

export type BuilderPreviewNode = {
  accent: string
  appLabel: string
  id: string
  layerColumnIndex: number
  layerIndex: number
  layerId: string
  layerLabel: string
  layerRowIndex: number
  index: number
  label: string
  modelId: string
  modelName: string
  styleDraft: RecipeStyleDraft | null
  styleTemplateId: string | null
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
  textContent?: unknown | null
}

export type BuilderPreviewCanvasLayer = {
  accent: string
  id: string
  label: string
  nodeIds: string[]
  /** Lexical JSON for styled layer label. */
  textContent?: unknown | null
}

export type BuilderPreviewCanvasGraph = {
  columns: BuilderPreviewColumn[]
  edges: CanvasEdge[]
  key: string
  layers: BuilderPreviewCanvasLayer[]
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
    textContent: layer.textContent,
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
      (modelsByLayerId[col.layerId] ?? []).map((model, layerRowIndex) => {
        const node: BuilderPreviewNode = {
          accent: col.accent,
          appLabel: model.appLabel,
          id: model.id,
          layerColumnIndex: col.index,
          layerIndex: globalIndex,
          layerId: col.layerId,
          layerLabel: col.label,
          layerRowIndex,
          index: globalIndex,
          label: model.alias || model.displayName,
          modelId: model.modelId,
          modelName: model.modelName,
          styleDraft: recipe.styleDrafts[model.id] ?? null,
          styleTemplateId: model.styleTemplateId ?? null,
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

function readStyleOverrides(
  draft: RecipeStyleDraft | null,
): CanvasNodeStyleOverrides | undefined {
  if (!draft?.typeSpecificData || typeof draft.typeSpecificData !== 'object')
    return undefined
  const data = draft.typeSpecificData as Record<string, unknown>
  const overrides: CanvasNodeStyleOverrides = {}
  if (typeof data.shapeKey === 'string') overrides.shapeKey = data.shapeKey
  if (typeof data.borderColor === 'string')
    overrides.borderColor = data.borderColor
  if (typeof data.backgroundColor === 'string')
    overrides.backgroundColor = data.backgroundColor
  return Object.keys(overrides).length > 0 ? overrides : undefined
}

function getNodeTextContent(node: BuilderPreviewNode) {
  return node.styleDraft?.textContent ?? createTemplateTextContent(node.label)
}

function getNodeHtml(node: BuilderPreviewNode) {
  return builderEditableTemplateNodeHtml(
    renderTemplateTextContent(getNodeTextContent(node)),
    node.accent,
  )
}

function encodePreviewKeyPart(value: number | string) {
  const text = String(value)
  return `${text.length}:${text}`
}

function getBuilderPreviewGraphKey({
  columns,
  filterCountByLayer,
  groupLayout,
  groupRules,
  layoutAlgorithm,
  layoutDirection,
  previewEdges,
  previewNodes,
  showEdges,
}: {
  columns: BuilderPreviewColumn[]
  filterCountByLayer: Record<string, number>
  groupLayout: CanvasGroupLayoutPolicy
  groupRules: RecipeGroupRule[]
  layoutAlgorithm: RecipeData['layoutAlgorithm']
  layoutDirection: RecipeData['layoutDirection']
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
      JSON.stringify(rule.layout ?? null),
    ]),
  )

  const parts: (number | string)[] = [
    'builder-preview-v5',
    `edges:${showEdges}`,
    'layoutAlgorithm',
    layoutAlgorithm,
    'layoutDirection',
    layoutDirection,
    'groupLayout',
    JSON.stringify(groupLayout),
    ...R.flatMap(columns, (col) => [
      'column',
      col.index,
      col.label,
      col.accent,
      col.nodeCount,
    ]),
    ...R.flatMap(previewNodes, (node) => {
      // Always use the *resolved* textContent so that initialising a
      // default style draft (which contains the same label-derived
      // content) does NOT change the key and cause a canvas remount.
      const textContent = JSON.stringify(getNodeTextContent(node))
      // Dimensions are intentionally EXCLUDED from the key. ELK
      // auto-layout updates node.width/height in the canvas store
      // directly, and ResizeBridge then writes them back to the
      // styleDraft. Including dimensions here would remount the canvas
      // mid-edit and destroy the Lexical editor.
      // Include shapeKey so a shape switch triggers ELK re-layout
      // (dimensions alone are excluded to avoid the resize feedback loop).
      const shapeKey =
        node.styleDraft?.typeSpecificData &&
        typeof node.styleDraft.typeSpecificData === 'object'
          ? ((node.styleDraft.typeSpecificData as Record<string, unknown>)
              .shapeKey ?? '')
          : ''
      return [
        'node',
        node.id,
        node.label,
        node.modelId,
        node.styleTemplateId ?? '',
        node.layerId,
        node.layerLabel,
        node.layerIndex,
        node.index,
        textContent,
        `shape:${shapeKey}`,
      ]
    }),
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
  /** When true, skip group nesting — all nodes render flat in their layer grid
   *  positions. Use for the static preview (steps 1–5) where ELK doesn't run
   *  and can't size group containers to fit children. */
  flatLayout?: boolean
  showEdges?: boolean
}

/**
 * Resolves which model IDs act as group containers based on recipe group rules.
 * Returns a map from child model ID → parent model ID for "group" mode rules.
 * "breakout" mode rules are tracked separately — children that break out
 * stay at the canvas root rather than being nested in a parent model.
 */
function resolveGroupParents(
  groupRules: RecipeGroupRule[],
  groupLayout: CanvasGroupLayoutPolicy,
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
  const groupLayoutByParentId = new Map<string, CanvasGroupLayoutPolicy>()

  for (const rule of groupRules) {
    if (rule.mode !== 'group') continue
    const parent =
      nodesById[rule.parentModelId] ?? nodesByModelId[rule.parentModelId]
    const child =
      nodesById[rule.childModelId] ?? nodesByModelId[rule.childModelId]
    if (!parent || !child || parent.id === child.id) continue

    childToGroupParent.set(child.id, parent.id)
    groupParentIds.add(parent.id)
    groupLayoutByParentId.set(parent.id, rule.layout ?? groupLayout)
  }

  return { childToGroupParent, groupLayoutByParentId, groupParentIds }
}

export const MODEL_GROUP_PREFIX = 'builder-model-group:'

export function getModelIdFromBuilderGroupNodeId(nodeId: string) {
  return nodeId.startsWith(MODEL_GROUP_PREFIX)
    ? nodeId.slice(MODEL_GROUP_PREFIX.length)
    : null
}

function getCanvasLayers(
  columns: BuilderPreviewColumn[],
  previewNodes: BuilderPreviewNode[],
  groupParentIds: Set<string>,
  childToGroupParent: Map<string, string>,
) {
  const layersById = new Map<string, BuilderPreviewCanvasLayer>(
    columns.map((column) => [
      column.layerId,
      {
        accent: column.accent,
        id: column.layerId,
        label: column.label,
        nodeIds: [],
        textContent: column.textContent,
      },
    ]),
  )

  for (const node of previewNodes) {
    if (childToGroupParent.has(node.id)) continue

    const layer = layersById.get(node.layerId)
    if (!layer) continue
    layer.nodeIds.push(
      groupParentIds.has(node.id) ? `${MODEL_GROUP_PREFIX}${node.id}` : node.id,
    )
  }

  return [...layersById.values()].filter((layer) => layer.nodeIds.length > 0)
}

/**
 * Resolves the canvas node ID for a preview node, accounting for group
 * parents being promoted to group container nodes (no separate box node).
 */
function resolveCanvasNodeId(nodeId: string, groupParentIds: Set<string>) {
  return groupParentIds.has(nodeId) ? `${MODEL_GROUP_PREFIX}${nodeId}` : nodeId
}

function getLayerColumnSpacing(previewEdges: BuilderPreviewEdge[]) {
  const longestLabelLength = Math.max(
    0,
    ...previewEdges.map((edge) => edge.label.length),
  )
  const labelGap = longestLabelLength * EDGE_LABEL_APPROX_CHAR_WIDTH

  return (
    BUILDER_PREVIEW_NODE_WIDTH +
    Math.min(
      LAYER_COLUMN_MAX_GAP,
      Math.max(LAYER_COLUMN_MIN_GAP, labelGap + EDGE_LABEL_GAP_PADDING),
    )
  )
}

function createBuilderPreviewEdgeRoute(
  edge: BuilderPreviewEdge,
  nodesById: Map<string, CanvasNode>,
  groupParentIds: Set<string>,
): Array<{ x: number; y: number }> | undefined {
  const sourceNode = nodesById.get(
    resolveCanvasNodeId(edge.from.id, groupParentIds),
  )
  const targetNode = nodesById.get(
    resolveCanvasNodeId(edge.to.id, groupParentIds),
  )
  if (!sourceNode || !targetNode) return undefined

  const sourceX = sourceNode.x + sourceNode.width
  const sourceY = sourceNode.y + sourceNode.height / 2
  const targetX = targetNode.x
  const targetY = targetNode.y + targetNode.height / 2
  const midX = sourceX + (targetX - sourceX) / 2

  return [
    { x: sourceX, y: sourceY },
    { x: midX, y: sourceY },
    { x: midX, y: targetY },
    { x: targetX, y: targetY },
  ]
}

function createBuilderPreviewEdgeLabelPoint(
  routePoints: Array<{ x: number; y: number }> | undefined,
) {
  const sourcePoint = routePoints?.[0]
  const firstBend = routePoints?.[1]
  const secondBend = routePoints?.[2]
  if (!sourcePoint || !firstBend || !secondBend) return undefined

  return {
    x: firstBend.x,
    y: Math.min(sourcePoint.y, secondBend.y) - STATIC_EDGE_LABEL_Y_OFFSET,
  }
}

/**
 * Builds the complete canvas graph for the builder preview.
 *
 * Layers are non-interactive canvas scaffolding, not graph nodes. Model
 * grouping rules may still promote a model to a real group container.
 */
export function getBuilderPreviewCanvasGraph(
  recipe: RecipeData,
  options: BuilderPreviewCanvasGraphOptions = {},
): BuilderPreviewCanvasGraph {
  const { flatLayout = false, showEdges = true } = options
  const columns = getBuilderPreviewColumns(recipe)
  const previewNodes = getBuilderPreviewNodes(recipe)
  const previewEdges = showEdges
    ? getBuilderPreviewEdges(recipe, previewNodes)
    : []
  const filterCountByLayer = getFilterCountByLayer(recipe)
  const groupLayout = recipe.groupLayout

  // In flat layout mode (static preview, no ELK), skip group nesting entirely.
  // Without ELK, group containers can't be auto-sized to fit children.
  const { childToGroupParent, groupLayoutByParentId, groupParentIds } =
    flatLayout
      ? {
          childToGroupParent: new Map<string, string>(),
          groupLayoutByParentId: new Map<string, CanvasGroupLayoutPolicy>(),
          groupParentIds: new Set<string>(),
        }
      : resolveGroupParents(recipe.groupRules, groupLayout, previewNodes)

  const key = getBuilderPreviewGraphKey({
    columns,
    filterCountByLayer,
    groupLayout,
    groupRules: recipe.groupRules,
    layoutAlgorithm: recipe.layoutAlgorithm,
    layoutDirection: recipe.layoutDirection,
    previewEdges,
    previewNodes,
    showEdges,
  })
  const layerColumnSpacing = getLayerColumnSpacing(previewEdges)

  const layers = getCanvasLayers(
    columns,
    previewNodes,
    groupParentIds,
    childToGroupParent,
  )

  // Group parents become group container nodes — they visually ARE the
  // container, so no separate box node is created for them.
  const modelGroupNodes: CanvasNode[] = R.pipe(
    previewNodes,
    R.filter((node) => groupParentIds.has(node.id)),
    R.map((node) => {
      const textContent = getNodeTextContent(node)

      return {
        id: `${MODEL_GROUP_PREFIX}${node.id}`,
        kind: 'group' as const,
        shape: 'group' as const,
        layoutMode: 'auto' as const,
        appLabel: node.appLabel,
        modelName: node.modelName,
        x: node.layerColumnIndex * layerColumnSpacing,
        y:
          LAYER_LABEL_RESERVED_TOP_SPACE +
          node.layerRowIndex * LAYER_NODE_Y_HINT_SPACING,
        width: BUILDER_PREVIEW_GROUP_MIN_WIDTH,
        height: BUILDER_PREVIEW_GROUP_MIN_HEIGHT,
        lexicalJson: stringifyTemplateTextContent(textContent),
        html: builderEditableTemplateNodeHtml(
          renderTemplateTextContent(textContent),
          node.accent,
        ),
        contentHeight: 0,
        groupLayout: groupLayoutByParentId.get(node.id) ?? groupLayout,
        version: 1,
      }
    }),
  )

  // Only create box nodes for non-parent models. Group parents are
  // represented by their model group container above.
  const modelNodes: CanvasNode[] = R.pipe(
    previewNodes,
    R.filter((node) => !groupParentIds.has(node.id)),
    R.map((node) => {
      // Grouped children nest inside their parent's group container.
      // All other nodes stay at root level; layers are canvas decoration.
      const groupParentNodeId = childToGroupParent.get(node.id)

      // Always populate lexicalJson so Lexical opens with the node's text
      // (avoids empty editor on first double-click and prevents visual shift)
      const textContent = getNodeTextContent(node)
      const lexicalJson = stringifyTemplateTextContent(textContent)

      // Use style draft dimensions if user customized them, else central defaults
      const draftDims = node.styleDraft?.dimensions as
        | { width?: number; height?: number }
        | null
        | undefined
      const width =
        (draftDims?.width ?? 0) > 0
          ? draftDims!.width!
          : BUILDER_PREVIEW_NODE_WIDTH
      const height =
        (draftDims?.height ?? 0) > 0
          ? draftDims!.height!
          : BUILDER_PREVIEW_NODE_HEIGHT

      const styleOverrides = readStyleOverrides(node.styleDraft)

      return {
        id: node.id,
        kind: 'editable' as const,
        shape: 'box' as const,
        layoutMode: 'auto' as const,
        appLabel: node.appLabel,
        modelName: node.modelName,
        ...(groupParentNodeId
          ? { parentGroupId: `${MODEL_GROUP_PREFIX}${groupParentNodeId}` }
          : {}),
        x: groupParentNodeId ? 0 : node.layerColumnIndex * layerColumnSpacing,
        y: groupParentNodeId
          ? 0
          : LAYER_LABEL_RESERVED_TOP_SPACE +
            node.layerRowIndex * LAYER_NODE_Y_HINT_SPACING,
        width,
        height,
        lexicalJson,
        html: getNodeHtml(node),
        contentHeight: 0,
        version: 1,
        ...(styleOverrides ? { styleOverrides } : {}),
      }
    }),
  )

  const nodes = [...modelGroupNodes, ...modelNodes]
  const nodesById = new Map(nodes.map((node) => [node.id, node]))
  const parentNodeIdByNodeId = getParentNodeIdByNodeId(nodes)

  const edges: CanvasEdge[] = R.pipe(
    previewEdges,
    R.flatMap((edge) => {
      const routePoints = createBuilderPreviewEdgeRoute(
        edge,
        nodesById,
        groupParentIds,
      )
      const labelPoint = createBuilderPreviewEdgeLabelPoint(routePoints)

      const canvasEdge: CanvasEdge = {
        id: edge.id,
        sourceNodeId: resolveCanvasNodeId(edge.from.id, groupParentIds),
        targetNodeId: resolveCanvasNodeId(edge.to.id, groupParentIds),
        kind: 'default' as const,
        label: edge.label || undefined,
        ...(labelPoint ? { labelPoint } : {}),
        routePoints,
      }

      if (!isRenderableCanvasEdge(canvasEdge, parentNodeIdByNodeId)) return []
      return [canvasEdge]
    }),
  )

  return { columns, edges, key, layers, nodes }
}
