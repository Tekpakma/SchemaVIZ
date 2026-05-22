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

type GeneratedPreviewNode = NonNullable<GenerationRunResult['nodes']>[number]
type NodeDimensions = {
  height?: number
  width?: number
}

function getTemplateAccent(template: StyleTemplate | null | undefined) {
  const visualStyles = template?.visualStyles
  if (!visualStyles || typeof visualStyles !== 'object') return undefined

  const styles = visualStyles as Record<string, unknown>
  const candidate =
    styles.accentColor ?? styles.borderColor ?? styles.backgroundColor
  return typeof candidate === 'string' ? candidate : undefined
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
        renderTemplateTextContent(draft.textContent, node.fields),
        recipeAccent ?? getTemplateAccent(styleTemplate),
      ),
    }
  }

  if (styleTemplate?.textContent) {
    return {
      accent: recipeAccent ?? getTemplateAccent(styleTemplate),
      dimensions: readNodeDimensions(styleTemplate.dimensions),
      html: builderEditableTemplateNodeHtml(
        renderTemplateTextContent(styleTemplate.textContent, node.fields),
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
          renderTemplateTextContent(textContent, node.fields),
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
  const resultEdges = result.edges ?? []
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
      const recipeAccent = getRecipeAccent(recipe, recipeModel)
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
        x,
        y: 0,
        width: BUILDER_PREVIEW_GROUP_MIN_WIDTH,
        height: BUILDER_PREVIEW_GROUP_MIN_HEIGHT,
        lexicalJson: labelContent.lexicalJson,
        html: labelContent.html,
        contentHeight: GENERATION_GROUP_LABEL_HEIGHT,
        groupLayout: getRecipeGroupLayoutForGeneratedGroup(recipe, node),
        version: 1,
      })
    } else {
      const recipeModel = getRecipeModelForGeneratedNode(recipe, node)
      const recipeDraft = getRecipeDraftForGeneratedNode(
        recipe,
        node,
        recipeModel,
      )
      const recipeAccent = getRecipeAccent(recipe, recipeModel)
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
  const edges: CanvasEdge[] = resultEdges.flatMap((edge, index) => {
    const canvasEdge: CanvasEdge = {
      id: `gen-edge-${index}-${edge.source}-${edge.target}`,
      sourceNodeId: edge.source,
      targetNodeId: edge.target,
      kind: 'default',
      label: edge.relationship || undefined,
    }

    if (!isRenderableCanvasEdge(canvasEdge, parentNodeIdByNodeId)) return []
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
