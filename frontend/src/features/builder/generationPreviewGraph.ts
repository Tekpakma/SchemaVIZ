/**
 * Converts a generation-run result (live data) into a canvas graph that
 * the builder preview can render. Group nodes become ELK compound groups;
 * regular nodes become generation-kind boxes; edges map directly.
 */

import type {
  CanvasEdge,
  CanvasNode,
  CanvasNodeStyleOverrides,
} from '@/features/canvas/model/types'
import {
  getParentNodeIdByNodeId,
  isRenderableCanvasEdge,
} from '@/features/canvas/compoundGraph'
import type { StyleTemplate } from '@/api/contracts'
import type {
  GenerationRunResponse,
  GenerationRunResult,
} from './generationPreviewQuery'
import {
  createTemplateTextContent,
  renderTemplateTextContent,
  stringifyTemplateTextContent,
} from '@/features/lexical/templateTextContent'
import {
  builderEditableNodeHtml,
  builderEditableTemplateNodeHtml,
  builderPreviewGroupLabelHtml,
} from './builderPreviewHtml'
import {
  BUILDER_PREVIEW_GROUP_MIN_HEIGHT,
  BUILDER_PREVIEW_GROUP_MIN_WIDTH,
  BUILDER_PREVIEW_NODE_HEIGHT,
  BUILDER_PREVIEW_NODE_WIDTH,
  getBuilderPreviewColumns,
} from './builderPreviewLayout'
import type { BuilderPreviewCanvasLayer } from './builderPreviewLayout'
import type { RecipeData, RecipeModel, RecipeStyleDraft } from './types'
import { DEFAULT_RECIPE_GROUP_LAYOUT } from './types'

const GENERATION_GROUP_LABEL_HEIGHT = 28
const LAYER_GROUP_X_HINT_SPACING = 300
/** Text templates may print the record's display name via `{{$display}}`. */
const DISPLAY_NAME_FIELD = '$display'

type GeneratedPreviewNode = NonNullable<GenerationRunResult['nodes']>[number]
type GeneratedPreviewEdge = NonNullable<GenerationRunResult['edges']>[number]
type NodeDimensions = {
  height?: number
  width?: number
}

/**
 * When every record of one model inside a container points at the same
 * root-level lookup (all servers of an environment run the same template,
 * both networks sit in the same region), that link is a property of the
 * container. One edge from the outermost such container replaces the fan of
 * identical lines; records that disagree keep their own edge.
 */
export function bundleSharedLookupEdges(
  edges: ReadonlyArray<GeneratedPreviewEdge>,
  nodes: ReadonlyArray<GeneratedPreviewNode>,
): Array<GeneratedPreviewEdge> {
  const nodesById = new Map(nodes.map((node) => [node.id, node]))
  const childIdsByParent = new Map<string, Array<string>>()
  for (const node of nodes) {
    if (!node.parentId) continue
    const siblings = childIdsByParent.get(node.parentId) ?? []
    siblings.push(node.id)
    childIdsByParent.set(node.parentId, siblings)
  }
  const modelOf = (id: string) => {
    const node = nodesById.get(id)
    return node ? `${node.appLabel}.${node.modelName}` : ''
  }
  const isLookup = (id: string) => {
    const node = nodesById.get(id)
    return Boolean(node && !node.parentId && !node.isGroup)
  }

  const descendantsOfModel = (containerId: string, model: string) => {
    const found = new Set<string>()
    const stack = [...(childIdsByParent.get(containerId) ?? [])]
    while (stack.length > 0) {
      const id = stack.pop()!
      if (modelOf(id) === model) found.add(id)
      stack.push(...(childIdsByParent.get(id) ?? []))
    }
    return found
  }

  const candidates = new Map<string, Array<GeneratedPreviewEdge>>()
  const result: Array<GeneratedPreviewEdge> = []
  for (const edge of edges) {
    if (!nodesById.get(edge.source)?.parentId || !isLookup(edge.target)) {
      result.push(edge)
      continue
    }
    const key = `${edge.relationship}|${edge.target}|${modelOf(edge.source)}`
    const group = candidates.get(key) ?? []
    group.push(edge)
    candidates.set(key, group)
  }

  const rootContainerIds = nodes
    .filter((node) => node.isGroup && !node.parentId)
    .map((node) => node.id)

  for (const group of candidates.values()) {
    const first = group[0]!
    const model = modelOf(first.source)
    const sources = new Set(group.map((edge) => edge.source))
    const covered = new Set<string>()

    const visit = (containerId: string) => {
      const records = descendantsOfModel(containerId, model)
      if (records.size >= 2 && [...records].every((id) => sources.has(id))) {
        result.push({ ...first, source: containerId })
        for (const id of records) covered.add(id)
        return
      }
      for (const childId of childIdsByParent.get(containerId) ?? []) {
        if (nodesById.get(childId)?.isGroup) visit(childId)
      }
    }
    for (const rootId of rootContainerIds) visit(rootId)

    for (const edge of group) {
      if (!covered.has(edge.source)) result.push(edge)
    }
  }

  return result
}

function getTemplateAccent(template: StyleTemplate | null | undefined) {
  const visualStyles = template?.visualStyles
  if (!visualStyles || typeof visualStyles !== 'object') return undefined

  const styles = visualStyles as Record<string, unknown>
  const candidate =
    styles.accentColor ?? styles.borderColor ?? styles.backgroundColor
  return typeof candidate === 'string' ? candidate : undefined
}

/** A draft may pin its own accent (per model) instead of the layer swatch. */
function getDraftAccent(draft: RecipeStyleDraft | null) {
  const data = draft?.typeSpecificData
  if (!data || typeof data !== 'object') return undefined
  const accent = (data as Record<string, unknown>).accent
  return typeof accent === 'string' && /^#[0-9a-f]{6}$/i.test(accent)
    ? accent
    : undefined
}

function withDisplayName(node: GeneratedPreviewNode) {
  return { [DISPLAY_NAME_FIELD]: node.displayName, ...node.fields }
}

function normalizeLabelWord(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1$2')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/(ies|es|s)$/, '')
}

/**
 * 'auto' drops labels that only repeat the target model ("servers" on an edge
 * into Server), which is most of them in a generated landscape.
 */
function getEdgeLabel(
  relationship: string | undefined,
  targetModelName: string | undefined,
  mode: RecipeData['edgeLabels'],
) {
  if (!relationship) return undefined
  if (mode === 'none') return undefined
  if (mode !== 'auto' || !targetModelName) return relationship
  const rel = normalizeLabelWord(relationship)
  const target = normalizeLabelWord(targetModelName)
  return rel === target || (rel.length >= 4 && target.endsWith(rel))
    ? undefined
    : relationship
}

function readNodeDimensions(value: unknown): NodeDimensions {
  if (!value || typeof value !== 'object') return {}
  const record = value as Record<string, unknown>
  return {
    height: typeof record.height === 'number' ? record.height : undefined,
    width: typeof record.width === 'number' ? record.width : undefined,
  }
}

function getModelRef(node: GeneratedPreviewNode) {
  return `${node.appLabel}.${node.modelName}`
}

function getRecipeModelForGeneratedNode(
  recipe: RecipeData | undefined,
  node: GeneratedPreviewNode,
) {
  if (!recipe) return null

  const modelById = new Map(recipe.models.map((model) => [model.id, model]))
  const modelFromStep = node.stepUiIds
    ?.map((stepId) => modelById.get(stepId))
    .find((model): model is RecipeModel => Boolean(model))
  if (modelFromStep) return modelFromStep

  const modelRef = getModelRef(node)
  return recipe.models.find((model) => model.modelId === modelRef) ?? null
}

function getRecipeAccent(
  recipe: RecipeData | undefined,
  model: RecipeModel | null,
) {
  if (!recipe || !model) return undefined

  const layerIndex = recipe.layers.findIndex(
    (layer) => layer.id === model.layerId,
  )
  const swatches =
    recipe.swatches.length > 0
      ? recipe.swatches
      : ['#C4006A', '#1D8B68', '#6A2B4D', '#18181B']
  return swatches[(layerIndex >= 0 ? layerIndex : 0) % swatches.length]
}

function getRecipeDraftForGeneratedNode(
  recipe: RecipeData | undefined,
  node: GeneratedPreviewNode,
  model: RecipeModel | null,
) {
  if (!recipe) return null

  if (model) {
    const draft = recipe.styleDrafts[model.id]
    if (draft) return draft
  }

  const draftFromStep = node.stepUiIds
    ?.map((stepId) => recipe.styleDrafts[stepId])
    .find((draft): draft is RecipeStyleDraft => Boolean(draft))
  return draftFromStep ?? null
}

function readStyleOverrides(
  draft: RecipeStyleDraft | null,
  template: StyleTemplate | null | undefined,
): CanvasNodeStyleOverrides | undefined {
  // Prefer draft overrides; fall back to template typeSpecificData
  const source =
    draft?.typeSpecificData ?? template?.typeSpecificData ?? undefined
  if (!source || typeof source !== 'object') return undefined
  const data = source as Record<string, unknown>
  const overrides: CanvasNodeStyleOverrides = {}
  if (typeof data.shapeKey === 'string') overrides.shapeKey = data.shapeKey
  if (typeof data.borderColor === 'string')
    overrides.borderColor = data.borderColor
  if (typeof data.backgroundColor === 'string')
    overrides.backgroundColor = data.backgroundColor
  return Object.keys(overrides).length > 0 ? overrides : undefined
}

function getNodeStyleContent({
  draft,
  node,
  recipeAccent,
  styleTemplate,
}: {
  draft: RecipeStyleDraft | null
  node: GeneratedPreviewNode
  recipeAccent: string | undefined
  styleTemplate: StyleTemplate | null | undefined
}) {
  if (draft?.textContent) {
    return {
      accent: recipeAccent ?? getTemplateAccent(styleTemplate),
      dimensions: readNodeDimensions(draft.dimensions),
      html: builderEditableTemplateNodeHtml(
        renderTemplateTextContent(draft.textContent, withDisplayName(node)),
        recipeAccent ?? getTemplateAccent(styleTemplate),
      ),
    }
  }

  if (styleTemplate?.textContent) {
    return {
      accent: recipeAccent ?? getTemplateAccent(styleTemplate),
      dimensions: readNodeDimensions(styleTemplate.dimensions),
      html: builderEditableTemplateNodeHtml(
        renderTemplateTextContent(
          styleTemplate.textContent,
          withDisplayName(node),
        ),
        recipeAccent ?? getTemplateAccent(styleTemplate),
      ),
    }
  }

  return {
    accent: recipeAccent,
    dimensions: {},
    html: builderEditableNodeHtml(
      node.displayName,
      getModelRef(node),
      recipeAccent,
    ),
  }
}

function getGroupLabelContent({
  draft,
  label,
  node,
  recipeAccent,
}: {
  draft: RecipeStyleDraft | null
  label: string
  node: GeneratedPreviewNode
  recipeAccent: string | undefined
}) {
  const textContent = draft?.textContent ?? createTemplateTextContent(label)

  return {
    html: draft?.textContent
      ? builderEditableTemplateNodeHtml(
          renderTemplateTextContent(textContent, withDisplayName(node)),
          recipeAccent,
        )
      : builderPreviewGroupLabelHtml(label, recipeAccent),
    lexicalJson: stringifyTemplateTextContent(textContent),
  }
}

function getSizedNodeFrame(dimensions: NodeDimensions) {
  return {
    height:
      dimensions.height && dimensions.height > 0
        ? dimensions.height
        : BUILDER_PREVIEW_NODE_HEIGHT,
    width:
      dimensions.width && dimensions.width > 0
        ? dimensions.width
        : BUILDER_PREVIEW_NODE_WIDTH,
  }
}

function getGenerationPreviewRecipeKeyParts(recipe: RecipeData | undefined) {
  if (!recipe) return []

  return [
    'recipe',
    'layoutAlgorithm',
    recipe.layoutAlgorithm,
    'layoutDirection',
    recipe.layoutDirection,
    'edgeLabels',
    recipe.edgeLabels ?? 'all',
    'groupLayout',
    JSON.stringify(recipe.groupLayout),
    ...recipe.layers.flatMap((layer) => ['layer', layer.id, layer.label]),
    ...recipe.swatches.flatMap((swatch, index) => ['swatch', index, swatch]),
    ...recipe.models.flatMap((model) => {
      const draft = recipe.styleDrafts[model.id]
      const shapeKey =
        draft?.typeSpecificData && typeof draft.typeSpecificData === 'object'
          ? ((draft.typeSpecificData as Record<string, unknown>).shapeKey ?? '')
          : ''
      return [
        'model',
        model.id,
        model.modelId,
        model.layerId,
        model.styleTemplateId ?? '',
        'draft',
        JSON.stringify(draft?.textContent ?? null),
        JSON.stringify(draft?.dimensions ?? null),
        `shape:${shapeKey}`,
      ]
    }),
    ...recipe.groupRules.flatMap((rule) => [
      'groupRule',
      rule.parentModelId,
      rule.childModelId,
      rule.mode,
      JSON.stringify(rule.layout ?? null),
    ]),
  ]
}

export type GenerationPreviewCanvasGraph = {
  edges: CanvasEdge[]
  key: string
  layers: BuilderPreviewCanvasLayer[]
  nodes: CanvasNode[]
}

function getGenerationPreviewLayers(
  recipe: RecipeData | undefined,
  generatedNodes: GenerationRunResult['nodes'],
) {
  if (!recipe || !generatedNodes) return []

  const columns = getBuilderPreviewColumns(recipe)
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
  const layerIdByStepId = new Map(
    recipe.models.map((model) => [model.id, model.layerId]),
  )
  const layerIdByModelRef = new Map(
    recipe.models.map((model) => [model.modelId, model.layerId]),
  )

  for (const node of generatedNodes) {
    if (node.parentId) continue

    const layerIdFromStep = node.stepUiIds
      ?.map((stepId) => layerIdByStepId.get(stepId))
      .find((layerId): layerId is string => Boolean(layerId))
    const layerId =
      layerIdFromStep ??
      layerIdByModelRef.get(`${node.appLabel}.${node.modelName}`)
    if (!layerId) continue

    layersById.get(layerId)?.nodeIds.push(node.id)
  }

  return [...layersById.values()].filter((layer) => layer.nodeIds.length > 0)
}

function getRecipeGroupLayoutForGeneratedGroup(
  recipe: RecipeData | undefined,
  node: GeneratedPreviewNode,
) {
  if (!recipe) return DEFAULT_RECIPE_GROUP_LAYOUT

  const groupLayout = recipe.groupLayout
  const stepIds = new Set(node.stepUiIds ?? [])
  const model = getRecipeModelForGeneratedNode(recipe, node)
  const matchingRule = recipe.groupRules.find((rule) => {
    if (rule.mode !== 'group') return false
    return (
      stepIds.has(rule.parentModelId) ||
      rule.parentModelId === model?.id ||
      rule.parentModelId === model?.modelId
    )
  })

  return matchingRule?.layout ?? groupLayout
}

function ancestorChain(
  nodeId: string,
  parentNodeIdByNodeId: Map<string, string>,
): Array<string> {
  const chain = [nodeId]
  const visited = new Set(chain)
  let current = parentNodeIdByNodeId.get(nodeId)
  while (current && !visited.has(current)) {
    chain.push(current)
    visited.add(current)
    current = parentNodeIdByNodeId.get(current)
  }
  return chain
}

/**
 * Lifts both endpoints until they share a parent (or both sit at root). Edges
 * between siblings stay exact; only edges crossing container walls move to
 * the containers themselves.
 */
function promoteToSiblingLevel(
  sourceId: string,
  targetId: string,
  parentNodeIdByNodeId: Map<string, string>,
): [string, string] {
  const sourceChain = ancestorChain(sourceId, parentNodeIdByNodeId)
  const targetChain = ancestorChain(targetId, parentNodeIdByNodeId)
  for (const source of sourceChain) {
    for (const target of targetChain) {
      if (
        source !== target &&
        parentNodeIdByNodeId.get(source) === parentNodeIdByNodeId.get(target)
      ) {
        return [source, target]
      }
    }
  }
  return [sourceId, targetId]
}

export function getGenerationPreviewCanvasGraph(
  response: GenerationRunResponse | GenerationRunResult,
  recipe?: RecipeData,
): GenerationPreviewCanvasGraph {
  const groupNodes: CanvasNode[] = []
  const modelNodes: CanvasNode[] = []
  const result = 'result' in response ? response.result : response
  const styleTemplates =
    'styleTemplates' in response ? response.styleTemplates : []
  const styleTemplatesById = new Map<string, StyleTemplate>(
    styleTemplates.flatMap((template) =>
      template.id ? [[template.id, template]] : [],
    ),
  )
  const nodes = result.nodes ?? []
  const resultEdges = bundleSharedLookupEdges(result.edges ?? [], nodes)
  const layers = getGenerationPreviewLayers(recipe, nodes)

  // Track group ordering for INTERACTIVE layering hints
  let groupIndex = 0
  const groupXByNodeId = new Map<string, number>()

  for (const node of nodes) {
    if (node.isGroup) {
      const x = groupIndex * LAYER_GROUP_X_HINT_SPACING
      groupXByNodeId.set(node.id, x)
      groupIndex++
      const recipeModel = getRecipeModelForGeneratedNode(recipe, node)
      const recipeDraft = getRecipeDraftForGeneratedNode(
        recipe,
        node,
        recipeModel,
      )
      const recipeAccent =
        getDraftAccent(recipeDraft) ?? getRecipeAccent(recipe, recipeModel)
      const label = node.displayName || node.label || ''
      const labelContent = getGroupLabelContent({
        draft: recipeDraft,
        label,
        node,
        recipeAccent,
      })

      groupNodes.push({
        id: node.id,
        kind: 'group',
        shape: 'group',
        layoutMode: 'auto',
        appLabel: node.appLabel,
        modelName: node.modelName,
        ...(node.recordPk ? { recordId: String(node.recordPk) } : {}),
        ...(node.parentId ? { parentGroupId: node.parentId } : {}),
        x: node.parentId ? 0 : x,
        y: 0,
        width: BUILDER_PREVIEW_GROUP_MIN_WIDTH,
        height: BUILDER_PREVIEW_GROUP_MIN_HEIGHT,
        lexicalJson: labelContent.lexicalJson,
        html: labelContent.html,
        contentHeight: GENERATION_GROUP_LABEL_HEIGHT,
        groupLayout: getRecipeGroupLayoutForGeneratedGroup(recipe, node),
        version: 1,
        // Containers keep the model colour on their border; shapes do not apply.
        ...(recipeAccent
          ? { styleOverrides: { borderColor: recipeAccent } }
          : {}),
      })
    } else {
      const recipeModel = getRecipeModelForGeneratedNode(recipe, node)
      const recipeDraft = getRecipeDraftForGeneratedNode(
        recipe,
        node,
        recipeModel,
      )
      const recipeAccent =
        getDraftAccent(recipeDraft) ?? getRecipeAccent(recipe, recipeModel)
      const styleTemplate = node.styleTemplateId
        ? styleTemplatesById.get(node.styleTemplateId)
        : null
      const styleContent = getNodeStyleContent({
        draft: recipeDraft,
        node,
        recipeAccent,
        styleTemplate,
      })
      const frame = getSizedNodeFrame(styleContent.dimensions)

      const styleOverrides = readStyleOverrides(recipeDraft, styleTemplate)

      modelNodes.push({
        id: node.id,
        kind: 'generation',
        shape: 'box',
        layoutMode: 'auto',
        ...(node.parentId ? { parentGroupId: node.parentId } : {}),
        x: 0,
        y: 0,
        width: frame.width,
        height: frame.height,
        lexicalJson: '',
        html: styleContent.html,
        contentHeight: 0,
        version: 1,
        ...(styleOverrides ? { styleOverrides } : {}),
      })
    }
  }

  const allNodes = [...groupNodes, ...modelNodes]
  const parentNodeIdByNodeId = getParentNodeIdByNodeId(allNodes)
  const modelNameByNodeId = new Map(
    nodes.map((node) => [node.id, node.modelName]),
  )

  // Edges that cross a container wall (a server inside its environment
  // pointing at a subnet inside its network) can only be routed when every
  // container is laid out by the root ELK pass; that costs the compact
  // rectpacking of edge-free groups, so it is only switched on when needed.
  const crossesHierarchy = resultEdges.some(
    (edge) =>
      parentNodeIdByNodeId.get(edge.source) !==
        parentNodeIdByNodeId.get(edge.target) &&
      isRenderableCanvasEdge(
        { sourceNodeId: edge.source, targetNodeId: edge.target },
        parentNodeIdByNodeId,
      ),
  )
  if (crossesHierarchy) {
    for (const group of groupNodes) {
      if (group.kind === 'group') group.groupLayout = { strategy: 'nested' }
    }
  }

  const seenEdgeKeys = new Set<string>()
  const edges: CanvasEdge[] = resultEdges.flatMap((edge, index) => {
    const [sourceNodeId, targetNodeId] = crossesHierarchy
      ? [edge.source, edge.target]
      : promoteToSiblingLevel(edge.source, edge.target, parentNodeIdByNodeId)
    const dedupeKey = `${sourceNodeId}->${targetNodeId}`
    if (seenEdgeKeys.has(dedupeKey)) return []

    const canvasEdge: CanvasEdge = {
      id: `gen-edge-${index}-${edge.source}-${edge.target}`,
      sourceNodeId,
      targetNodeId,
      kind: 'default',
      label: getEdgeLabel(
        edge.relationship,
        modelNameByNodeId.get(edge.target),
        recipe?.edgeLabels,
      ),
    }

    if (!isRenderableCanvasEdge(canvasEdge, parentNodeIdByNodeId)) return []
    seenEdgeKeys.add(dedupeKey)
    return [canvasEdge]
  })

  // Build a stable key for canvas remounting
  const keyParts = [
    'gen-preview-v1',
    ...nodes.map((n) => `${n.id}:${n.displayName}`),
    ...styleTemplates.map(
      (template) =>
        `${template.id ?? ''}:${JSON.stringify(template.textContent)}:${JSON.stringify(template.dimensions)}`,
    ),
    ...getGenerationPreviewRecipeKeyParts(recipe),
    ...resultEdges.map((e) => `${e.source}-${e.target}`),
  ]
  const key = keyParts.join('|')

  return { edges, key, layers, nodes: allNodes }
}
