import * as z from 'zod'
import { toolDefinition } from '@tanstack/ai'
import * as R from 'remeda'

import {
  schemaVizGenerationRunsCreate,
  schemaVizGenerationRunsValidateCreate,
  schemaVizGenerationTemplatesCreate,
  schemaVizGenerationTemplatesPublishCreate,
  schemaVizGraphRetrieve,
  schemaVizQueryRecordCreate,
  schemaVizQueryRecordsCreate,
} from '@/api/generated/schema-viz'
import type { GenerationTemplateRead } from '@/api/contracts'
import {
  recipeToGenerationTemplateWriteRequest,
  recipeToInlineDefinition,
} from '@/features/builder/templateRecipe'
import type { ExampleRecord, RecipeData } from '@/features/builder/types'
import { splitModelId } from '@/features/lexical/dataReference/modelUtils'

import type { AiToolContext } from './context'
import { appUrl, backendRequestInit, unwrapOk } from './context'
import { buildLandscapeSpec } from './landscapeTools'
import { renderGenerationSvg } from '../preview/renderGenerationSvg.server'
import {
  buildShareSlug,
  diagramSpecSchema,
  specToRecipe,
  unwrapTemplate,
} from './recipeTools'
import type { DiagramSpec } from './recipeTools'

const MAX_RECORD_CANDIDATES = 8
const MAX_SKIPPED_REPORTED = 12
const MAX_NAME_ATTEMPTS = 5

const candidateSchema = z.object({ recordId: z.string(), label: z.string() })

export const drawDiagramDef = toolDefinition({
  name: 'drawDiagram',
  description:
    'One call from a request to a finished diagram: walks the schema from rootModel (or takes your spec), validates it, resolves the record the user named, saves the result as a draft template with provenance and returns links. Check "status": "needs_input" means ask the user (candidates lists the matching records), "invalid" means fix the spec and call again, "ok" means done. Set publish=true when the user wants a link that renders immediately; otherwise the draft opens in the builder.',
  inputSchema: z.object({
    rootModel: z
      .string()
      .describe('Model id to start from, e.g. "infrastructure.BusinessGroup".'),
    record: z
      .string()
      .optional()
      .describe(
        'The root record as the user named it (a name, part of a name, or an id). Omitted: structure only.',
      ),
    intent: z
      .string()
      .optional()
      .describe(
        "The user's request in their own words, stored with the draft.",
      ),
    title: z.string().optional(),
    spec: diagramSpecSchema
      .optional()
      .describe('Use an explicit specification instead of walking the schema.'),
    maxDepth: z.number().int().min(1).max(4).optional(),
    maxModels: z.number().int().min(2).max(60).optional(),
    apps: z.array(z.string()).optional(),
    excludeModels: z.array(z.string()).optional(),
    layoutDirection: z.enum(['LR', 'RL', 'TB', 'BT']).optional(),
    grouping: z
      .enum(['containment', 'none'])
      .optional()
      .describe(
        '"containment" (default) nests records inside the record that owns them; "none" draws lines only.',
      ),
    publish: z
      .boolean()
      .optional()
      .describe(
        'Also publish so diagramUrl renders without opening the builder.',
      ),
    includePreview: z
      .boolean()
      .optional()
      .describe(
        'Attach a rendered SVG of the diagram to the result (default true). Turn off for very large diagrams.',
      ),
  }),
  outputSchema: z.object({
    status: z.enum(['ok', 'needs_input', 'invalid']),
    message: z.string(),
    spec: diagramSpecSchema.optional(),
    candidates: z.array(candidateSchema).optional(),
    errors: z
      .array(
        z.object({
          code: z.string(),
          message: z.string(),
          stepId: z.string().nullable(),
          hint: z.string(),
        }),
      )
      .optional(),
    templateId: z.string().optional(),
    published: z.boolean().optional(),
    title: z.string().optional(),
    record: candidateSchema.nullable().optional(),
    modelCount: z.number().optional(),
    skipped: z
      .array(
        z.object({
          fromModel: z.string(),
          toModel: z.string(),
          relationship: z.string(),
          reason: z.string(),
        }),
      )
      .optional(),
    skippedTotal: z.number().optional(),
    preview: z
      .object({
        nodeCount: z.number(),
        edgeCount: z.number(),
        sampleLabels: z.array(z.string()),
      })
      .optional(),
    builderUrl: z.string().optional(),
    diagramUrl: z.string().nullable().optional(),
    pickerUrl: z.string().nullable().optional(),
    previewSvg: z
      .string()
      .optional()
      .describe('Rendered diagram; MCP clients receive it as an image.'),
  }),
})

type DrawInput = z.infer<typeof drawDiagramDef.inputSchema>
type Candidate = z.infer<typeof candidateSchema>

type RecordResolution =
  | { kind: 'resolved'; record: Candidate }
  | { kind: 'none' }
  | { kind: 'ambiguous'; candidates: Array<Candidate> }
  | { kind: 'not_found' }

function readRecordPk(fields: Record<string, unknown>): string {
  return String(fields.pk ?? fields.id ?? '')
}

/**
 * A bare id wins when it exists; otherwise a search must yield exactly one
 * hit or exactly one hit whose label matches the query verbatim.
 */
async function resolveRecord(
  rootModel: string,
  query: string | undefined,
  init: ReturnType<typeof backendRequestInit>,
): Promise<RecordResolution> {
  const trimmed = query?.trim()
  if (!trimmed) return { kind: 'none' }

  const ref = splitModelId(rootModel)
  if (!ref) return { kind: 'not_found' }
  const base = { appLabel: ref.appLabel, modelName: ref.modelName }

  if (/^\d+$/.test(trimmed)) {
    const byId = await schemaVizQueryRecordCreate(
      { ...base, id: trimmed },
      init,
    )
    if (byId.status === 200) {
      return {
        kind: 'resolved',
        record: { recordId: trimmed, label: byId.data.displayName },
      }
    }
  }

  const page = unwrapOk(
    await schemaVizQueryRecordsCreate(
      { ...base, page: 1, pageSize: MAX_RECORD_CANDIDATES, search: trimmed },
      init,
    ),
    'search records',
  )
  const candidates = page.results.map((record) => ({
    recordId: readRecordPk(record.fields),
    label: record.displayName,
  }))

  if (candidates.length === 0) return { kind: 'not_found' }
  if (candidates.length === 1) {
    return { kind: 'resolved', record: candidates[0]! }
  }
  const exact = candidates.filter(
    (candidate) => candidate.label.toLowerCase() === trimmed.toLowerCase(),
  )
  if (exact.length === 1) return { kind: 'resolved', record: exact[0]! }
  return { kind: 'ambiguous', candidates }
}

function toExample(spec: DiagramSpec, record: Candidate): ExampleRecord {
  const ref = splitModelId(spec.rootModel)
  return {
    id: `ex-${ref?.modelName ?? 'root'}-${record.recordId}`,
    label: record.label,
    kind: ref?.modelName ?? spec.rootModel,
    idValue: `${ref?.appLabel ?? ''}:${record.recordId}`,
    isDefault: true,
  }
}

function describeDraft(input: DrawInput, record: Candidate | null): string {
  const parts = [
    `Created by the SchemaVIZ assistant on ${new Date().toISOString().slice(0, 10)}.`,
  ]
  if (input.intent?.trim()) parts.push(`Request: "${input.intent.trim()}"`)
  if (record) parts.push(`Record: ${record.label} (id ${record.recordId})`)
  return parts.join(' ')
}

function isNameConflict(data: unknown): boolean {
  return Boolean(data && typeof data === 'object' && 'name' in data)
}

/** Template names are unique per owner; the builder appends "(n)" the same way. */
async function createDraftTemplate(
  recipe: RecipeData,
  options: { shareSlug: string | null; description: string },
  init: ReturnType<typeof backendRequestInit>,
): Promise<GenerationTemplateRead> {
  const baseTitle = recipe.title.trim() || 'Untitled diagram'

  for (let attempt = 1; attempt <= MAX_NAME_ATTEMPTS; attempt += 1) {
    const title = attempt === 1 ? baseTitle : `${baseTitle} (${attempt})`
    const request = recipeToGenerationTemplateWriteRequest(
      { ...recipe, title },
      { shareSlug: options.shareSlug },
    )
    if (!request) {
      throw new Error('The specification resolves to no models.')
    }

    // The generated type claims a 201 always; Django really answers 400 on
    // a name clash, so the status is widened before the check.
    const response: { status: number; data: unknown } =
      await schemaVizGenerationTemplatesCreate(
        { ...request, description: options.description },
        init,
      )
    if (response.status === 400 && isNameConflict(response.data)) continue
    return unwrapTemplate(response, 201, 'create draft template')
  }

  throw new Error(
    `Could not find a free name for "${baseTitle}"; pass a different title.`,
  )
}

export const drawDiagram = drawDiagramDef.server<AiToolContext>(
  async (input, { context }) => {
    const init = backendRequestInit(context)

    // 1. Specification: explicit or walked from the schema.
    let spec: DiagramSpec
    let skipped: Array<{
      fromModel: string
      toModel: string
      relationship: string
      reason: string
    }> = []
    if (input.spec) {
      spec = { ...input.spec, ...(input.title ? { title: input.title } : {}) }
    } else {
      const graph = unwrapOk(
        await schemaVizGraphRetrieve({ includeFields: true }, init),
        'load schema graph',
      )
      const landscape = buildLandscapeSpec(graph, {
        rootModel: input.rootModel,
        title: input.title,
        maxDepth: input.maxDepth,
        maxModels: input.maxModels,
        apps: input.apps,
        excludeModels: input.excludeModels,
        layoutDirection: input.layoutDirection,
        grouping: input.grouping,
      })
      spec = landscape.spec
      skipped = landscape.skipped
    }

    // 2. Validate before anything is persisted.
    const source = recipeToInlineDefinition(specToRecipe(spec))
    if (!source) {
      return {
        status: 'invalid' as const,
        message: 'The specification resolves to no models.',
        spec,
      }
    }
    const validation = unwrapOk(
      await schemaVizGenerationRunsValidateCreate(
        {
          rootModel: source.rootModel,
          inlineDefinition: source.inlineDefinition,
        },
        init,
      ),
      'validate diagram',
    )
    if (!validation.valid) {
      return {
        status: 'invalid' as const,
        message: `The specification has ${validation.errors.length} error(s); fix them and call drawDiagram again with the corrected spec.`,
        spec,
        errors: validation.errors,
      }
    }

    // 3. Resolve the record the user named; ask instead of guessing.
    const resolution = await resolveRecord(spec.rootModel, input.record, init)
    if (resolution.kind === 'ambiguous') {
      return {
        status: 'needs_input' as const,
        message: `Several ${spec.rootModel} records match "${input.record}". Ask the user which one they mean, then call drawDiagram again with that record's id.`,
        spec,
        candidates: resolution.candidates,
      }
    }
    if (resolution.kind === 'not_found') {
      return {
        status: 'needs_input' as const,
        message: `No ${spec.rootModel} record matches "${input.record}". Ask the user for another name, or use findRecords to browse.`,
        spec,
        candidates: [],
      }
    }
    const record = resolution.kind === 'resolved' ? resolution.record : null

    // 4. Run once so the caller can describe what the diagram shows.
    const run = unwrapOk(
      await schemaVizGenerationRunsCreate(
        {
          mode: record ? 'live' : 'structure',
          recordId: record?.recordId ?? null,
          source,
        },
        init,
      ),
      'run diagram',
    )
    const nodes = run.result.nodes ?? []

    // 5. Persist as a draft with provenance; publish only on request.
    const recipe: RecipeData = {
      ...specToRecipe(spec),
      examples: record ? [toExample(spec, record)] : [],
      provenance: {
        source: 'mcp',
        createdAt: new Date().toISOString(),
        ...(input.intent ? { intent: input.intent } : {}),
        options: R.omit(input, ['spec', 'intent']),
      },
    }
    const publish = input.publish === true
    let template = await createDraftTemplate(
      recipe,
      {
        shareSlug: publish ? buildShareSlug(spec.title) : null,
        description: describeDraft(input, record),
      },
      init,
    )
    if (publish) {
      template = unwrapTemplate(
        await schemaVizGenerationTemplatesPublishCreate(template.id, init),
        200,
        'publish template',
      )
    }

    const shareSlug = publish ? template.shareSlug : null
    const diagramPath =
      shareSlug && record
        ? `/generate/${encodeURIComponent(shareSlug)}/${encodeURIComponent(record.recordId)}`
        : null

    // A failed render must not undo a saved draft, so it degrades to no image.
    let previewSvg: string | undefined
    if (input.includePreview !== false && nodes.length > 0) {
      try {
        previewSvg = await renderGenerationSvg(run, recipe, init)
      } catch (error) {
        console.warn('[drawDiagram] preview render failed:', error)
      }
    }

    return {
      status: 'ok' as const,
      message: record
        ? `Draft "${template.name}" shows ${nodes.length} records around ${record.label}.`
        : `Draft "${template.name}" saved as a structure diagram; pass a record to fill it with data.`,
      templateId: template.id,
      published: publish,
      title: template.name,
      record,
      modelCount: spec.steps.length + 1,
      skipped: skipped.slice(0, MAX_SKIPPED_REPORTED),
      skippedTotal: skipped.length,
      preview: {
        nodeCount: nodes.length,
        edgeCount: (run.result.edges ?? []).length,
        sampleLabels: nodes
          .slice(0, 8)
          .map((node) => node.displayName || node.label || node.id),
      },
      builderUrl: appUrl(
        context,
        `/builder?templateId=${encodeURIComponent(template.id)}`,
      ),
      diagramUrl: diagramPath ? appUrl(context, diagramPath) : null,
      pickerUrl: shareSlug
        ? appUrl(context, `/generate/${encodeURIComponent(shareSlug)}/`)
        : null,
      ...(previewSvg ? { previewSvg } : {}),
    }
  },
)
