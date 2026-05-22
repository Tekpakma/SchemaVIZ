import * as R from 'remeda'

import { GenerationRunResponse } from '@/api/contracts'
import type {
  GenerationTemplateQuickAccessEntryOutput,
  GenerationTemplateRead,
} from '@/api/contracts'
import type {
  LayoutAlgorithm,
  RecipeData,
  RecipeFilter,
  RecipeLayer,
  RecipeLayoutDirection,
  RecipeModel,
  TraversalEdge,
} from '@/features/builder/types'
import type {
  HomeTemplateFilter,
  HomeTemplatePreview,
  PromotionLevel,
  TemplateHue,
} from './types'

const FALLBACK_DESCRIPTION = 'Schema-aware generation template.'
const HUES = ['pink', 'green', 'plum'] as const satisfies TemplateHue[]
const DEFAULT_SWATCHES = ['#C4006A', '#1D8B68', '#6A2B4D', '#18181B']
const LAYOUT_ALGORITHMS = new Set<LayoutAlgorithm>([
  'Force',
  'Layered',
  'Radial',
  'Tree',
])
const ACCENTS: Record<TemplateHue, string> = {
  green: 'var(--chart-2)',
  pink: 'var(--brand)',
  plum: 'var(--chart-5)',
}

type TemplateVersion = NonNullable<GenerationTemplateRead['draftVersion']>
type RawDefinitionStep = TemplateVersion['definition']['stepsById'][string]

type DefinitionStep = {
  childIds: string[]
  filter: unknown
  groupMode: 'none' | 'group' | 'breakout'
  id: string
  label: string | null
  parentId: string | null
  relationship: string | null
  resolvedModelId: string
  styleTemplateId: string | null
  visibility: 'visible' | 'hidden'
}

function hashText(value: string) {
  let hash = 0
  for (const character of value) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0
  }
  return hash
}

function getTemplateHue(templateId: string): TemplateHue {
  return HUES[hashText(templateId) % HUES.length] ?? 'pink'
}

function splitModelId(modelId: string) {
  const [appLabel, ...rest] = modelId.split('.')
  if (!appLabel || rest.length === 0) {
    return { appLabel: '', modelName: modelId }
  }

  return { appLabel, modelName: rest.join('.') }
}

function normalizeStep(id: string, raw: RawDefinitionStep): DefinitionStep {
  return {
    childIds: raw.childIds ?? [],
    filter: raw.filter ?? null,
    groupMode: raw.groupMode ?? 'none',
    id: raw.id ?? id,
    label: raw.label ?? null,
    parentId: raw.parentId ?? null,
    relationship: raw.relationship ?? null,
    resolvedModelId: raw.resolvedModelId ?? id,
    styleTemplateId: raw.styleTemplateId ?? null,
    visibility: raw.visibility ?? 'visible',
  }
}

function readOrderedSteps(version: TemplateVersion | null): DefinitionStep[] {
  if (!version) return []

  const stepsById = new Map(
    Object.entries(version.definition.stepsById).map(([id, raw]) => [
      id,
      normalizeStep(id, raw),
    ]),
  )
  const orderedSteps: DefinitionStep[] = []
  const visitedStepIds = new Set<string>()

  function visit(stepId: string) {
    if (visitedStepIds.has(stepId)) return
    const step = stepsById.get(stepId)
    if (!step) return

    visitedStepIds.add(stepId)
    orderedSteps.push(step)
    step.childIds.forEach(visit)
  }

  visit(version.definition.rootStepId)
  for (const stepId of stepsById.keys()) {
    visit(stepId)
  }

  return orderedSteps.filter((step) => step.visibility !== 'hidden')
}

function getStepLabel(step: DefinitionStep) {
  if (step.label) return step.label
  return splitModelId(step.resolvedModelId).modelName || step.id
}

function getLayoutAlgorithm(version: TemplateVersion | null): LayoutAlgorithm {
  const candidate = version?.layoutSettings.layoutAlgorithm
  return candidate && LAYOUT_ALGORITHMS.has(candidate) ? candidate : 'Layered'
}

function getLayoutDirection(
  version: TemplateVersion | null,
): RecipeLayoutDirection {
  return version?.layoutSettings.layoutDirection ?? 'LR'
}

function getSwatches(version: TemplateVersion | null) {
  const swatches = version?.layoutSettings.swatches
  return swatches && swatches.length > 0 ? swatches : DEFAULT_SWATCHES
}

function stringifyFilter(filter: unknown) {
  if (typeof filter === 'string') return filter

  try {
    return JSON.stringify(filter)
  } catch {
    return String(filter)
  }
}

function createPreviewRecipeFromTemplate(
  template: GenerationTemplateRead,
): RecipeData {
  const version = template.draftVersion ?? template.publishedVersion
  const steps = readOrderedSteps(version)
  const stepsById = R.indexBy(steps, R.prop('id'))
  const layers: RecipeLayer[] =
    steps.length > 0
      ? steps.map((step, index) => ({
          id: `layer-${step.id}`,
          label: `L${index + 1}`,
        }))
      : [{ id: 'preview-empty-layer', label: template.name || 'Template' }]

  const models: RecipeModel[] = steps.map((step) => {
    const parsed = splitModelId(step.resolvedModelId)
    return {
      id: step.id,
      appLabel: parsed.appLabel,
      appVerboseName: parsed.appLabel,
      modelName: parsed.modelName,
      modelId: step.resolvedModelId,
      displayName: getStepLabel(step),
      layerId: `layer-${step.id}`,
      alias: step.label ?? undefined,
      styleTemplateId: step.styleTemplateId,
    }
  })

  const edges: TraversalEdge[] = steps.flatMap((step) => {
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
  })

  const filters: RecipeFilter[] = steps.flatMap((step) => {
    if (step.filter == null) return []

    return [
      {
        id: `filter-${step.id}`,
        layer: getStepLabel(step),
        expr: stringifyFilter(step.filter),
        suggested: false,
        modelId: step.id,
      },
    ]
  })

  return {
    title: template.name,
    layers,
    models,
    examples: [],
    edges,
    filters,
    groupRules: [],
    groupLayout: { strategy: 'auto' },
    styleDrafts: {},
    swatches: getSwatches(version),
    layoutAlgorithm: getLayoutAlgorithm(version),
    layoutDirection: getLayoutDirection(version),
    shareSlug: template.shareSlug ?? '',
    promoteTarget: '',
    promoteVisibility: template.scope === 'global' ? 'shared' : 'private',
    promoteAudience: template.scope === 'global' ? 'All users' : '',
  }
}

function getPromotion(
  entry: GenerationTemplateQuickAccessEntryOutput,
): PromotionLevel {
  if (entry.template.featured.enabled || entry.source === 'featured') {
    return 'featured'
  }
  return entry.template.scope === 'global' ? 'system' : 'personal'
}

function getTemplateAuthor(template: GenerationTemplateRead, source: string) {
  const author =
    template.publishedBy?.displayName ??
    template.draftVersion?.createdBy?.displayName ??
    template.publishedVersion?.createdBy?.displayName

  if (author) return author
  return source === 'own' ? 'You' : 'SchemaVIZ'
}

function getSourceLabel(entry: GenerationTemplateQuickAccessEntryOutput) {
  return entry.source === 'own' ? 'Owned' : 'Featured'
}

function getStatusLabel(entry: GenerationTemplateQuickAccessEntryOutput) {
  if (entry.previewStatus === 'ready') return 'Ready'
  if (entry.previewStatus === 'no_record') return 'Needs record'
  return 'Preview issue'
}

function getNavigationTarget(entry: GenerationTemplateQuickAccessEntryOutput) {
  const shareSlug = entry.template.shareSlug
  if (shareSlug && entry.previewStatus === 'ready' && entry.sampleRecordId) {
    return {
      type: 'generation-run',
      shareSlug,
      recordId: entry.sampleRecordId,
    } as const
  }

  if (shareSlug) {
    return {
      type: 'generation-select-record',
      shareSlug,
    } as const
  }

  return {
    type: 'builder',
    templateId: entry.template.id,
  } as const
}

function readResultCounts(result: unknown) {
  if (!result || typeof result !== 'object') {
    return { edgeCount: null, nodeCount: null }
  }

  const record = result as Record<string, unknown>
  const nodes = Array.isArray(record.nodes) ? record.nodes : null
  const edges = Array.isArray(record.edges) ? record.edges : null
  const nodeCount = nodes
    ? nodes.filter((node) => {
        if (!node || typeof node !== 'object') return true
        return (node as Record<string, unknown>).isGroup !== true
      }).length
    : null

  return {
    edgeCount: edges?.length ?? null,
    nodeCount,
  }
}

function parseGenerationResponse(
  entry: GenerationTemplateQuickAccessEntryOutput,
) {
  if (entry.previewStatus !== 'ready' || !entry.run) return null

  const parsed = GenerationRunResponse.safeParse(entry.run)
  return parsed.success ? parsed.data : null
}

export function createHomeTemplatePreview(
  entry: GenerationTemplateQuickAccessEntryOutput,
): HomeTemplatePreview {
  const template = entry.template
  const recipe = createPreviewRecipeFromTemplate(template)
  const generationResponse = parseGenerationResponse(entry)
  const counts = readResultCounts(entry.result ?? generationResponse?.result)
  const hue = getTemplateHue(template.id)

  return {
    accent: ACCENTS[hue],
    author: getTemplateAuthor(template, entry.source),
    description: template.description?.trim() || FALLBACK_DESCRIPTION,
    edgeCount: counts.edgeCount ?? recipe.edges.length,
    generationResponse,
    hue,
    id: template.id,
    navigationTarget: getNavigationTarget(entry),
    nodeCount: counts.nodeCount ?? recipe.models.length,
    promotion: getPromotion(entry),
    recipe,
    rootModel: template.rootModel,
    sampleRecordDisplayName: entry.sampleRecordDisplayName,
    sampleRecordId: entry.sampleRecordId,
    shareSlug: template.shareSlug,
    source: entry.source,
    sourceLabel: getSourceLabel(entry),
    status: entry.previewStatus,
    statusLabel: getStatusLabel(entry),
    template,
    title: template.name,
    updatedAt: template.updatedAt,
  }
}

export function createHomeTemplatePreviews(
  entries: GenerationTemplateQuickAccessEntryOutput[],
) {
  return R.pipe(entries, R.map(createHomeTemplatePreview))
}

export function uniqueHomeTemplatePreviews(previews: HomeTemplatePreview[]) {
  return R.uniqueBy(previews, (preview) => preview.id)
}

export function filterHomeTemplatePreviews(
  previews: HomeTemplatePreview[],
  filter: HomeTemplateFilter,
) {
  if (filter === 'all') return previews
  if (filter === 'ready') {
    return previews.filter((preview) => preview.status === 'ready')
  }
  if (filter === 'needs_record') {
    return previews.filter((preview) => preview.status === 'no_record')
  }
  if (filter === 'issues') {
    return previews.filter((preview) => preview.status === 'error')
  }
  return previews.filter((preview) => preview.source === filter)
}
