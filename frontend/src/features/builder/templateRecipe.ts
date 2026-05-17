import { GenerationDefinitionSchema } from '@/api/generated/zod/generationDefinitionSchema.zod'
import { GenerationLayoutSettingsSchema } from '@/api/generated/zod/generationLayoutSettingsSchema.zod'
import type { GenerationDefinitionSchemaOutput } from '@/api/generated/zod/generationDefinitionSchema.zod'
import type {
  GenerationRunRequestRequest,
  GenerationTemplateRead,
} from '@/api/contracts'
import type {
  LayoutAlgorithm,
  RecipeData,
  RecipeFilter,
  RecipeLayer,
  RecipeModel,
  TraversalEdge,
} from './types'
import { splitModelId } from '@/features/lexical/dataReference/modelUtils'
import {
  DEFAULT_SWATCHES,
  createDefaultLayer,
  ensureRecipeHasLayer,
} from './recipeDefaults'

type DefinitionStep = GenerationDefinitionSchemaOutput['stepsById'][string] & {
  id: string
  parentId: string | null
  childIds: string[]
  relationship: string | null
  resolvedModelId: string
  label: string | null
}

export function createBlankRecipe(): RecipeData {
  return {
    title: '',
    layers: [createDefaultLayer()],
    models: [],
    examples: [],
    edges: [],
    filters: [],
    groupRules: [],
    swatches: [...DEFAULT_SWATCHES],
    layoutAlgorithm: 'Layered',
    promoteOrg: '',
    promoteVisibility: 'org-wide',
    promoteAudience: '',
  }
}

function getStepLabel(step: DefinitionStep) {
  if (step.label) return step.label

  const parsed = splitModelId(step.resolvedModelId)
  return parsed?.modelName || step.id
}

/**
 * Reads backend generation steps in traversal order, then appends disconnected steps.
 * Templates may contain stale or hidden branches, so this keeps conversion deterministic.
 */
function readOrderedDefinitionSteps(definition: unknown) {
  const parsedDefinition = GenerationDefinitionSchema.safeParse(definition)
  if (!parsedDefinition.success) return []

  const stepsById = new Map(
    Object.entries(parsedDefinition.data.stepsById).map(([id, step]) => [
      id,
      {
        ...step,
        id: step.id ?? id,
        parentId: step.parentId ?? null,
        childIds: step.childIds ?? [],
        relationship: step.relationship ?? null,
        resolvedModelId: step.resolvedModelId ?? '',
        label: step.label ?? null,
      } satisfies DefinitionStep,
    ]),
  )
  const orderedSteps: DefinitionStep[] = []
  const visited = new Set<string>()

  function visit(stepId: string) {
    if (visited.has(stepId)) return

    const step = stepsById.get(stepId)
    if (!step) return

    visited.add(stepId)
    orderedSteps.push(step)
    step.childIds.forEach(visit)
  }
  // Start with root step
  visit(parsedDefinition.data.rootStepId)
  for (const stepId of stepsById.keys()) {
    visit(stepId)
  }

  return orderedSteps
}

function stringifyFilter(filter: unknown) {
  if (filter == null) return null
  if (typeof filter === 'string') return filter

  try {
    return JSON.stringify(filter)
  } catch {
    return String(filter)
  }
}

function readLayoutAlgorithm(layoutSettings: unknown): LayoutAlgorithm {
  const parsedLayoutSettings =
    GenerationLayoutSettingsSchema.safeParse(layoutSettings)
  return parsedLayoutSettings.success
    ? (parsedLayoutSettings.data.layoutAlgorithm ?? 'Layered')
    : 'Layered'
}

function readSwatches(layoutSettings: unknown) {
  const parsedLayoutSettings =
    GenerationLayoutSettingsSchema.safeParse(layoutSettings)
  const swatches = parsedLayoutSettings.success
    ? (parsedLayoutSettings.data.swatches ?? [])
    : []
  return swatches.length > 0 ? swatches : [...DEFAULT_SWATCHES]
}

export function createRecipeFromTemplate(
  template: GenerationTemplateRead,
): RecipeData {
  const version = template.draftVersion ?? template.publishedVersion
  const steps = readOrderedDefinitionSteps(version?.definition)
  const visibleSteps = steps.filter((step) => step.visibility !== 'hidden')
  const stepsById = new Map(steps.map((step) => [step.id, step]))

  const layers: RecipeLayer[] = visibleSteps.map((step, index) => ({
    id: `layer-${step.id}`,
    label: `L${index + 1}`,
  }))
  const normalizedLayers = ensureRecipeHasLayer(layers)
  const layerIdByStepId = new Map(
    visibleSteps.map((step) => [step.id, `layer-${step.id}`]),
  )
  const models: RecipeModel[] = visibleSteps.map((step) => {
    const parsed = splitModelId(step.resolvedModelId)
    const appLabel = parsed?.appLabel ?? ''
    const modelName = parsed?.modelName ?? step.resolvedModelId

    return {
      id: step.id,
      appLabel,
      appVerboseName: appLabel,
      modelName,
      modelId: step.resolvedModelId,
      displayName: getStepLabel(step),
      layerId: layerIdByStepId.get(step.id) ?? `layer-${step.id}`,
      alias: step.label ?? undefined,
    }
  })

  const edges: TraversalEdge[] = visibleSteps.flatMap((step) => {
    if (!step.parentId || !step.relationship) return []

    const parent = stepsById.get(step.parentId)
    if (!parent) return []

    return [
      {
        id: `edge-${step.id}`,
        from: getStepLabel(parent),
        to: getStepLabel(step),
        fromModelId: parent.id,
        toModelId: step.id,
        via: step.relationship,
        auto: true,
        cost: 1,
      },
    ]
  })

  const groupRules = visibleSteps.flatMap((step) => {
    if (step.groupMode !== 'group' || !step.parentId) return []
    return [
      {
        id: `group-${step.id}`,
        parentModelId: step.parentId,
        childModelId: step.id,
        via: step.relationship ?? '',
      },
    ]
  })

  const filters: RecipeFilter[] = visibleSteps.flatMap((step) => {
    const expr = stringifyFilter(step.filter)
    if (!expr) return []

    return [
      {
        id: `filter-${step.id}`,
        layer: getStepLabel(step),
        expr,
        suggested: false,
      },
    ]
  })

  return {
    ...createBlankRecipe(),
    title: template.name,
    layers: normalizedLayers,
    models,
    edges,
    filters,
    groupRules,
    swatches: readSwatches(version?.layoutSettings),
    layoutAlgorithm: readLayoutAlgorithm(version?.layoutSettings),
    promoteVisibility: template.scope === 'global' ? 'org-wide' : 'private',
    promoteAudience: template.scope === 'global' ? 'All users' : '',
  }
}

// ---------------------------------------------------------------------------
// Recipe → inline generation definition (for preview execution)
// ---------------------------------------------------------------------------

type GenerationSource = GenerationRunRequestRequest['source']

export type InlineDefinition = NonNullable<GenerationSource['inlineDefinition']>

type InlineDefinitionStep = InlineDefinition['stepsById'][string]

export type InlineGenerationSource = Required<
  Pick<GenerationSource, 'inlineDefinition' | 'rootModel' | 'layoutSettings'>
>

function getModelLabel(model: RecipeModel) {
  return model.alias || model.displayName
}

function getFilterByModelLabel(filters: RecipeFilter[]) {
  const filterByModelLabel = new Map<string, string>()
  for (const filter of filters) {
    filterByModelLabel.set(filter.layer.trim().toLowerCase(), filter.expr)
  }
  return filterByModelLabel
}

function getFilterForModel(
  model: RecipeModel,
  filterByModelLabel: Map<string, string>,
) {
  const filterExpr = filterByModelLabel.get(
    getModelLabel(model).trim().toLowerCase(),
  )

  return filterExpr ? { raw: filterExpr } : null
}

function getFallbackRouteStep(edge: TraversalEdge) {
  if (!edge.fromModelId || !edge.toModelId) return null

  return {
    fromModel: edge.fromModelId,
    toModel: edge.toModelId,
    viaField: edge.via,
    isForward: true,
    isMany: true,
  }
}

function getSyntheticStepId(edge: TraversalEdge, index: number) {
  return `${edge.id}:hop-${index + 1}`
}

/**
 * Converts a builder recipe back into the inline generation definition
 * format that the generation-runs API accepts.
 *
 * The recipe's traversal edges encode parent→child relationships; models
 * become definition steps keyed by their recipe id.
 */
export function recipeToInlineDefinition(
  recipe: RecipeData,
): InlineGenerationSource | null {
  if (recipe.models.length === 0) return null

  const startModel = recipe.models[0]!
  const rootStepId = startModel.id

  const filterByModelLabel = getFilterByModelLabel(recipe.filters)
  const modelsById = new Map(recipe.models.map((model) => [model.id, model]))
  const stepsById: Record<string, InlineDefinitionStep> = {}

  for (const model of recipe.models) {
    stepsById[model.id] = {
      id: model.id,
      parentId: null,
      childIds: [],
      relationship: null,
      resolvedModelId: model.modelId,
      visibility: 'visible',
      groupMode: 'none',
      label: getModelLabel(model),
      filter: getFilterForModel(model, filterByModelLabel),
    }
  }

  for (const edge of recipe.edges) {
    if (!edge.fromModelId || !edge.toModelId) continue

    const routeSteps = edge.routeSteps?.length
      ? edge.routeSteps
      : [getFallbackRouteStep(edge)].filter((step) => step != null)

    if (routeSteps.length === 0) continue

    let parentStepId = edge.fromModelId

    for (const [index, routeStep] of routeSteps.entries()) {
      const isLastStep = index === routeSteps.length - 1
      const stepId = isLastStep
        ? edge.toModelId
        : getSyntheticStepId(edge, index)
      const existingStep = stepsById[stepId]
      const targetModel = isLastStep ? modelsById.get(edge.toModelId) : null
      const parentStep = stepsById[parentStepId]

      if (!parentStep) break

      parentStep.childIds = [...(parentStep.childIds ?? []), stepId]

      stepsById[stepId] = {
        id: stepId,
        parentId: parentStepId,
        childIds: existingStep?.childIds ?? [],
        relationship: routeStep.viaField,
        resolvedModelId: routeStep.toModel,
        visibility: isLastStep ? 'visible' : 'hidden',
        groupMode: existingStep?.groupMode ?? 'none',
        label: targetModel ? getModelLabel(targetModel) : null,
        filter:
          isLastStep && targetModel
            ? getFilterForModel(targetModel, filterByModelLabel)
            : null,
      }

      parentStepId = stepId
    }
  }

  // Apply grouping rules — mark child steps as grouped
  for (const rule of recipe.groupRules) {
    const childStep = stepsById[rule.childModelId]
    if (childStep) {
      childStep.groupMode = 'group'
    }
  }

  return {
    inlineDefinition: { rootStepId, stepsById },
    rootModel: startModel.modelId,
    layoutSettings: {
      layoutAlgorithm: recipe.layoutAlgorithm,
      swatches: recipe.swatches,
    },
  }
}
