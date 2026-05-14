import { GenerationDefinitionSchema } from '@/api/generated/zod/generationDefinitionSchema.zod'
import { GenerationLayoutSettingsSchema } from '@/api/generated/zod/generationLayoutSettingsSchema.zod'
import type { GenerationDefinitionSchemaOutput } from '@/api/generated/zod/generationDefinitionSchema.zod'
import type { GenerationTemplateRead } from '@/api/contracts'
import type {
  LayoutAlgorithm,
  RecipeData,
  RecipeFilter,
  RecipeLayer,
  TraversalEdge,
} from './types'

const DEFAULT_SWATCHES = ['#C4006A', '#1D8B68', '#6A2B4D', '#18181B']

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
    layers: [],
    examples: [],
    edges: [],
    filters: [],
    swatches: [...DEFAULT_SWATCHES],
    layoutAlgorithm: 'Layered',
    promoteOrg: '',
    promoteVisibility: 'org-wide',
    promoteAudience: '',
  }
}

function getStepLabel(step: DefinitionStep) {
  if (step.label) return step.label

  const modelName = step.resolvedModelId.split('.').pop()
  return modelName || step.id
}

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

  const layers: RecipeLayer[] = visibleSteps.map((step) => ({
    id: step.id,
    label: getStepLabel(step),
  }))

  const edges: TraversalEdge[] = visibleSteps.flatMap((step) => {
    if (!step.parentId || !step.relationship) return []

    const parent = stepsById.get(step.parentId)
    if (!parent) return []

    return [
      {
        id: `edge-${step.id}`,
        from: getStepLabel(parent),
        to: getStepLabel(step),
        via: step.relationship,
        auto: true,
        cost: 1,
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
    layers,
    edges,
    filters,
    swatches: readSwatches(version?.layoutSettings),
    layoutAlgorithm: readLayoutAlgorithm(version?.layoutSettings),
    promoteVisibility: template.scope === 'global' ? 'org-wide' : 'private',
    promoteAudience: template.scope === 'global' ? 'All users' : '',
  }
}
