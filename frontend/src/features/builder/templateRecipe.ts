import * as R from 'remeda'
import * as z from 'zod'

import {
  GenerationDefinitionSchema,
  GenerationLayoutSettingsSchema,
} from '@/api/contracts'
import type {
  GenerationDefinitionSchemaOutput,
  GenerationRunRequestRequest,
  GenerationTemplateRead,
  GenerationTemplateWriteRequest,
} from '@/api/contracts'
import type {
  LayoutAlgorithm,
  RecipeData,
  RecipeFilter,
  RecipeLayer,
  RecipeModel,
  RecipeStyleDraft,
  TraversalEdge,
} from './types'
import { DEFAULT_RECIPE_GROUP_LAYOUT } from './types'
import { splitModelId } from '@/features/lexical/dataReference/modelUtils'
import {
  DEFAULT_SWATCHES,
  createDefaultLayer,
  ensureRecipeHasLayer,
} from './recipeDefaults'

// ---------------------------------------------------------------------------
// Zod helpers for fields the generated schemas leave as `unknown`
// ---------------------------------------------------------------------------

/** A non-array plain object — used for filter field values. */
const FilterObjectSchema = z
  .record(z.string(), z.unknown())
  .refine((v) => !Array.isArray(v))

type RawStep = GenerationDefinitionSchemaOutput['stepsById'][string]

/**
 * Normalised definition step. The generated schema has many optional/nullable
 * fields; this fills in defaults so downstream code never needs `?? null`.
 */
type DefinitionStep = {
  id: string
  parentId: string | null
  childIds: string[]
  relationship: string | null
  resolvedModelId: string
  visibility: 'visible' | 'hidden'
  groupMode: 'none' | 'group' | 'breakout'
  styleTemplateId: string | null
  label: string | null
  filter: unknown
}

function normalizeStep(id: string, raw: RawStep): DefinitionStep {
  return {
    id: raw.id ?? id,
    parentId: raw.parentId ?? null,
    childIds: raw.childIds ?? [],
    relationship: raw.relationship ?? null,
    resolvedModelId: raw.resolvedModelId ?? '',
    visibility: raw.visibility,
    groupMode: raw.groupMode,
    styleTemplateId: raw.styleTemplateId ?? null,
    label: raw.label ?? null,
    filter: raw.filter ?? null,
  }
}

// ---------------------------------------------------------------------------
// Blank recipe
// ---------------------------------------------------------------------------

export function createBlankRecipe(): RecipeData {
  return {
    title: '',
    layers: [createDefaultLayer()],
    models: [],
    examples: [],
    edges: [],
    filters: [],
    groupRules: [],
    groupLayout: { ...DEFAULT_RECIPE_GROUP_LAYOUT },
    styleDrafts: {},
    swatches: [...DEFAULT_SWATCHES],
    layoutAlgorithm: 'Layered',
    layoutDirection: 'LR',
    shareSlug: '',
    promoteOrg: '',
    promoteVisibility: 'org-wide',
    promoteAudience: '',
  }
}

// ---------------------------------------------------------------------------
// Template → Recipe
// ---------------------------------------------------------------------------

function getStepLabel(step: DefinitionStep) {
  if (step.label) return step.label

  const parsed = splitModelId(step.resolvedModelId)
  return parsed?.modelName || step.id
}

/**
 * Reads backend generation steps in traversal order, then appends disconnected steps.
 * Templates may contain stale or hidden branches, so this keeps conversion deterministic.
 */
function readOrderedDefinitionSteps(definition: unknown): DefinitionStep[] {
  const parsed = GenerationDefinitionSchema.safeParse(definition)
  if (!parsed.success) return []

  const stepsById = R.pipe(
    R.entries(parsed.data.stepsById),
    R.map(([id, raw]) => [id, normalizeStep(id, raw)] as const),
    (entries) => new Map(entries),
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

  visit(parsed.data.rootStepId)
  for (const stepId of stepsById.keys()) {
    visit(stepId)
  }

  return orderedSteps
}

function readLayoutSettings(layoutSettings: unknown) {
  const parsed = GenerationLayoutSettingsSchema.safeParse(layoutSettings)
  if (!parsed.success) {
    return {
      layoutAlgorithm: 'Layered' as LayoutAlgorithm,
      swatches: [...DEFAULT_SWATCHES],
    }
  }

  return {
    layoutAlgorithm: parsed.data.layoutAlgorithm ?? 'Layered',
    swatches:
      parsed.data.swatches && parsed.data.swatches.length > 0
        ? parsed.data.swatches
        : [...DEFAULT_SWATCHES],
  }
}

// ---------------------------------------------------------------------------
// Style drafts → layoutSettings persistence
// ---------------------------------------------------------------------------

type PersistedStyleDraft = {
  sourceTemplateId: string | null
  persistedTemplateId: string | null
  name: string
  textContent: unknown | null
  visualStyles: unknown
  dimensions: unknown
  typeSpecificData: unknown
}

/**
 * Strips transient UI state (dirty, saveState, error) from a style draft
 * so only the data that should be persisted is included.
 */
function serializeStyleDraft(draft: RecipeStyleDraft): PersistedStyleDraft {
  return {
    sourceTemplateId: draft.sourceTemplateId,
    persistedTemplateId: draft.persistedTemplateId,
    name: draft.name,
    textContent: draft.textContent,
    visualStyles: draft.visualStyles,
    dimensions: draft.dimensions,
    typeSpecificData: draft.typeSpecificData,
  }
}

function serializeStyleDrafts(
  drafts: Record<string, RecipeStyleDraft>,
): Record<string, PersistedStyleDraft> | undefined {
  const entries = Object.entries(drafts)
  if (entries.length === 0) return undefined

  return Object.fromEntries(
    entries.map(([key, draft]) => [key, serializeStyleDraft(draft)]),
  )
}

function deserializeStyleDrafts(
  raw: unknown,
): Record<string, RecipeStyleDraft> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}

  const record = raw as Record<string, unknown>
  const result: Record<string, RecipeStyleDraft> = {}

  for (const [key, value] of Object.entries(record)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue
    const entry = value as Record<string, unknown>

    result[key] = {
      sourceTemplateId:
        typeof entry.sourceTemplateId === 'string'
          ? entry.sourceTemplateId
          : null,
      persistedTemplateId:
        typeof entry.persistedTemplateId === 'string'
          ? entry.persistedTemplateId
          : null,
      name: typeof entry.name === 'string' ? entry.name : '',
      textContent: entry.textContent ?? null,
      visualStyles: entry.visualStyles ?? {},
      dimensions: entry.dimensions ?? {},
      typeSpecificData: entry.typeSpecificData ?? {},
      dirty: false,
      saveState: 'idle',
    }
  }

  return result
}

function readStyleDraftsFromLayoutSettings(
  layoutSettings: unknown,
): Record<string, RecipeStyleDraft> {
  if (!layoutSettings || typeof layoutSettings !== 'object') return {}
  const settings = layoutSettings as Record<string, unknown>
  return deserializeStyleDrafts(settings.styleDrafts)
}

// ---------------------------------------------------------------------------
// Edges persistence — routeSteps and full edge data don't survive the
// definition round-trip (parent/child only stores the last hop), so we
// persist the original recipe edges in layoutSettings.
// ---------------------------------------------------------------------------

function deserializeEdges(raw: unknown): TraversalEdge[] | null {
  if (!Array.isArray(raw)) return null

  return raw.flatMap((entry: unknown) => {
    if (!entry || typeof entry !== 'object') return []
    const e = entry as Record<string, unknown>
    if (typeof e.id !== 'string' || typeof e.via !== 'string') return []

    return [
      {
        id: e.id,
        from: typeof e.from === 'string' ? e.from : '',
        to: typeof e.to === 'string' ? e.to : '',
        fromModelId: typeof e.fromModelId === 'string' ? e.fromModelId : undefined,
        toModelId: typeof e.toModelId === 'string' ? e.toModelId : undefined,
        via: e.via,
        routeSteps: Array.isArray(e.routeSteps) ? e.routeSteps : undefined,
        auto: typeof e.auto === 'boolean' ? e.auto : true,
        cost: typeof e.cost === 'number' ? e.cost : 1,
        alt: typeof e.alt === 'boolean' ? e.alt : undefined,
      } satisfies TraversalEdge,
    ]
  })
}

function readEdgesFromLayoutSettings(
  layoutSettings: unknown,
): TraversalEdge[] | null {
  if (!layoutSettings || typeof layoutSettings !== 'object') return null
  const settings = layoutSettings as Record<string, unknown>
  return deserializeEdges(settings.edges)
}

// ---------------------------------------------------------------------------

function stringifyFilter(filter: unknown): string | null {
  if (filter == null) return null
  if (typeof filter === 'string') return filter

  try {
    return JSON.stringify(filter)
  } catch {
    return String(filter)
  }
}

function readFilterFields(
  filter: unknown,
): Record<string, unknown> | undefined {
  const parsed = FilterObjectSchema.safeParse(filter)
  return parsed.success ? { ...parsed.data } : undefined
}

export function createRecipeFromTemplate(
  template: GenerationTemplateRead,
): RecipeData {
  const version = template.draftVersion ?? template.publishedVersion
  const steps = readOrderedDefinitionSteps(version?.definition)
  const visibleSteps = steps.filter((step) => step.visibility !== 'hidden')
  const stepsById = R.indexBy(steps, R.prop('id'))

  const layers: RecipeLayer[] = visibleSteps.map((step, index) => ({
    id: `layer-${step.id}`,
    label: `L${index + 1}`,
  }))
  const normalizedLayers = ensureRecipeHasLayer(layers)
  const layerIdByStepId = R.indexBy(visibleSteps, R.prop('id'))

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
      layerId: layerIdByStepId[step.id]
        ? `layer-${step.id}`
        : `layer-${step.id}`,
      alias: step.label ?? undefined,
      styleTemplateId: step.styleTemplateId,
    }
  })

  const edges: TraversalEdge[] = R.pipe(
    visibleSteps,
    R.flatMap((step) => {
      if (!step.parentId || !step.relationship) return []
      const parent = stepsById[step.parentId]
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
    }),
  )

  const groupRules = R.pipe(
    visibleSteps,
    R.flatMap((step) => {
      if (!step.parentId) return []
      const parent = stepsById[step.parentId]
      if (!parent) return []

      const mode =
        step.groupMode === 'breakout'
          ? 'breakout'
          : parent.groupMode === 'group' || step.groupMode === 'group'
            ? 'group'
            : null
      if (!mode) return []

      return [
        {
          id: `group-${step.id}`,
          parentModelId: step.parentId,
          childModelId: step.id,
          via: step.relationship ?? '',
          mode,
          layout: { ...DEFAULT_RECIPE_GROUP_LAYOUT },
        },
      ]
    }),
  )

  const filters: RecipeFilter[] = R.pipe(
    visibleSteps,
    R.flatMap((step) => {
      const expr = stringifyFilter(step.filter)
      if (!expr) return []

      return [
        {
          id: `filter-${step.id}`,
          layer: getStepLabel(step),
          expr,
          suggested: false,
          modelId: step.id,
          filterFields: readFilterFields(step.filter),
        },
      ]
    }),
  )

  const layout = readLayoutSettings(version?.layoutSettings)
  const styleDrafts = readStyleDraftsFromLayoutSettings(version?.layoutSettings)
  const persistedEdges = readEdgesFromLayoutSettings(version?.layoutSettings)

  return {
    ...createBlankRecipe(),
    title: template.name,
    layers: normalizedLayers,
    models,
    edges: persistedEdges ?? edges,
    filters,
    groupRules,
    styleDrafts,
    swatches: layout.swatches,
    layoutAlgorithm: layout.layoutAlgorithm,
    shareSlug: template.shareSlug ?? '',
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

function parseFilterExpression(expr: string): Record<string, unknown> | null {
  try {
    const result = FilterObjectSchema.safeParse(JSON.parse(expr))
    return result.success ? result.data : null
  } catch {
    return null
  }
}

function getFiltersByModel(filters: RecipeFilter[]) {
  const filtersByModel = new Map<string, Record<string, unknown>[]>()

  for (const filter of filters) {
    const filterFields =
      filter.filterFields ?? parseFilterExpression(filter.expr)
    if (!filterFields) continue

    const keys = R.pipe(
      [filter.modelId, filter.layer.trim().toLowerCase()],
      R.filter(R.isTruthy),
      R.uniqueBy((k) => k),
    )

    for (const key of keys) {
      const existing = filtersByModel.get(key) ?? []
      existing.push(filterFields)
      filtersByModel.set(key, existing)
    }
  }

  return filtersByModel
}

function getFilterForModel(
  model: RecipeModel,
  filtersByModel: Map<string, Record<string, unknown>[]>,
) {
  const filters =
    filtersByModel.get(model.id) ??
    filtersByModel.get(model.modelId) ??
    filtersByModel.get(getModelLabel(model).trim().toLowerCase()) ??
    []

  if (filters.length === 0) return null
  if (filters.length === 1) return filters[0]!

  return {
    andOperation: filters.flatMap((filter) => {
      const andOperation = filter.andOperation
      return Array.isArray(andOperation) ? andOperation : [filter]
    }),
  }
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

  const filtersByModel = getFiltersByModel(recipe.filters)
  const modelsById = R.indexBy(recipe.models, R.prop('id'))
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
      styleTemplateId: model.styleTemplateId ?? null,
      label: getModelLabel(model),
      filter: getFilterForModel(model, filtersByModel),
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
      const targetModel = isLastStep ? modelsById[edge.toModelId] : undefined
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
        styleTemplateId: targetModel?.styleTemplateId ?? null,
        label: targetModel ? getModelLabel(targetModel) : null,
        filter:
          isLastStep && targetModel
            ? getFilterForModel(targetModel, filtersByModel)
            : null,
      }

      parentStepId = stepId
    }
  }

  const groupedParentStepIds = new Set(
    recipe.groupRules
      .filter((rule) => rule.mode === 'group')
      .map((rule) => rule.parentModelId),
  )
  const breakoutChildStepIds = new Set(
    recipe.groupRules
      .filter((rule) => rule.mode === 'breakout')
      .map((rule) => rule.childModelId),
  )

  for (const stepId of groupedParentStepIds) {
    const parentStep = stepsById[stepId]
    if (parentStep) {
      parentStep.groupMode = 'group'
    }
  }

  for (const stepId of breakoutChildStepIds) {
    const childStep = stepsById[stepId]
    if (childStep) {
      childStep.groupMode = 'breakout'
    }
  }

  // Remove steps that are unreachable from the root — the backend rejects
  // definitions containing orphan steps. Models with no edge connecting
  // them to the root (e.g. a second layer not yet linked) would otherwise
  // appear in stepsById with no parent and nobody's childIds referencing them.
  const reachableIds = new Set<string>()
  const queue = [rootStepId]
  while (queue.length > 0) {
    const id = queue.pop()!
    if (reachableIds.has(id)) continue
    reachableIds.add(id)
    const step = stepsById[id]
    if (step?.childIds) {
      queue.push(...step.childIds)
    }
  }
  for (const id of Object.keys(stepsById)) {
    if (!reachableIds.has(id)) {
      delete stepsById[id]
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

export function recipeToGenerationTemplateWriteRequest(
  recipe: RecipeData,
  options: {
    scope?: 'owner' | 'global'
    template?: GenerationTemplateRead | null
    shareSlug?: string | null
  } = {},
): GenerationTemplateWriteRequest | null {
  const source = recipeToInlineDefinition(recipe)
  if (!source) return null

  const selectedShareSlug =
    options.shareSlug ?? (recipe.shareSlug || options.template?.shareSlug || '')
  const shareSlug = selectedShareSlug.trim()

  const persistedDrafts = serializeStyleDrafts(recipe.styleDrafts)

  return {
    name: recipe.title.trim() || 'Untitled template',
    description: options.template?.description ?? '',
    rootModel: source.rootModel,
    scope: options.scope ?? options.template?.scope ?? 'owner',
    featured: options.template?.featured,
    shareSlug: shareSlug || undefined,
    definition: source.inlineDefinition,
    layoutSettings: {
      ...source.layoutSettings,
      ...(persistedDrafts ? { styleDrafts: persistedDrafts } : {}),
      ...(recipe.edges.length > 0 ? { edges: recipe.edges } : {}),
    } as typeof source.layoutSettings,
  }
}
