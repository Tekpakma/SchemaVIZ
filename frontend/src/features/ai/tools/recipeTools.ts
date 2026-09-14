import * as z from 'zod'
import { toolDefinition } from '@tanstack/ai'
import * as R from 'remeda'

import {
  schemaVizGenerationRunsCreate,
  schemaVizGenerationRunsValidateCreate,
  schemaVizGenerationTemplatesCreate,
  schemaVizGenerationTemplatesPublishCreate,
  schemaVizGenerationTemplatesRetrieve,
  schemaVizGenerationTemplatesUpdate,
} from '@/api/generated/schema-viz'
import type { GenerationTemplateRead } from '@/api/contracts'
import {
  recipeToGenerationTemplateWriteRequest,
  recipeToInlineDefinition,
} from '@/features/builder/templateRecipe'

import type { AiToolContext } from './context'
import { appUrl, backendRequestInit, unwrapOk } from './context'
import { diagramSpecSchema, specToRecipe } from './diagramSpec'

export { diagramSpecSchema, specToRecipe } from './diagramSpec'
export type { DiagramSpec } from './diagramSpec'

const validationIssueSchema = z.object({
  code: z.string(),
  message: z.string(),
  stepId: z.string().nullable(),
  hint: z.string(),
})

export const validateDiagramDef = toolDefinition({
  name: 'validateDiagram',
  description:
    'Check a diagram specification against the live schema without running it. Always call this before createDiagram, and fix every reported error first — each issue names the step it belongs to.',
  inputSchema: z.object({ spec: diagramSpecSchema }),
  outputSchema: z.object({
    valid: z.boolean(),
    errors: z.array(validationIssueSchema),
    warnings: z.array(validationIssueSchema),
  }),
})

export const validateDiagram = validateDiagramDef.server<AiToolContext>(
  async ({ spec }, { context }) => {
    const source = recipeToInlineDefinition(specToRecipe(spec))
    if (!source) {
      return {
        valid: false,
        errors: [
          {
            code: 'empty_diagram',
            message: 'The specification resolves to no models.',
            stepId: null,
            hint: 'Provide a rootModel of the form "app_label.ModelName".',
          },
        ],
        warnings: [],
      }
    }

    const response = await schemaVizGenerationRunsValidateCreate(
      {
        rootModel: source.rootModel,
        inlineDefinition: source.inlineDefinition,
      },
      backendRequestInit(context),
    )

    return unwrapOk(response, 'validate diagram')
  },
)

export const createDiagramDef = toolDefinition({
  name: 'createDiagram',
  description:
    'Run a validated diagram specification and report what it produced. Call validateDiagram first. Pass a recordId to fill the diagram with real records; without one you get the structure only. Set includeGraph to receive every node and edge for rendering the diagram yourself; to open it in SchemaVIZ use publishDiagram instead.',
  inputSchema: z.object({
    spec: diagramSpecSchema,
    recordId: z
      .string()
      .optional()
      .describe('Primary key of the root record to start from.'),
    includeGraph: z
      .boolean()
      .optional()
      .describe(
        'Return the complete node and edge lists. Costs context in proportion to the graph size, so leave it off unless you will render or analyse the graph.',
      ),
  }),
  outputSchema: z.object({
    mode: z.string(),
    nodeCount: z.number(),
    edgeCount: z.number(),
    modelsIncluded: z.array(z.string()),
    sampleLabels: z.array(z.string()),
    graph: z
      .object({
        nodes: z.array(
          z.object({
            id: z.string(),
            model: z.string(),
            recordId: z.string(),
            label: z.string(),
            parentId: z.string().nullable(),
            isGroup: z.boolean(),
          }),
        ),
        edges: z.array(
          z.object({
            source: z.string(),
            target: z.string(),
            relationship: z.string(),
          }),
        ),
      })
      .optional(),
  }),
})

export const createDiagram = createDiagramDef.server<AiToolContext>(
  async ({ spec, recordId, includeGraph }, { context }) => {
    const source = recipeToInlineDefinition(specToRecipe(spec))
    if (!source) {
      throw new Error(
        'The specification resolves to no models; fix it with validateDiagram first.',
      )
    }

    const response = await schemaVizGenerationRunsCreate(
      {
        mode: recordId ? 'live' : 'structure',
        recordId: recordId ?? null,
        source,
      },
      backendRequestInit(context),
    )
    const run = unwrapOk(response, 'create diagram')
    const nodes = run.result.nodes ?? []
    const edges = run.result.edges ?? []

    // Field blobs never travel back to the model; even the full graph is
    // limited to what is needed to draw it. displayName is str(record),
    // label only the step name.
    const nodeLabel = (node: (typeof nodes)[number]) =>
      node.displayName || node.label || node.id

    return {
      mode: run.mode,
      nodeCount: nodes.length,
      edgeCount: edges.length,
      modelsIncluded: R.unique(
        nodes.map((node) => `${node.appLabel}.${node.modelName}`),
      ),
      sampleLabels: nodes.slice(0, 10).map(nodeLabel),
      ...(includeGraph
        ? {
            graph: {
              nodes: nodes.map((node) => ({
                id: node.id,
                model: `${node.appLabel}.${node.modelName}`,
                recordId: node.recordPk,
                label: nodeLabel(node),
                parentId: node.parentId ?? null,
                isGroup: node.isGroup ?? false,
              })),
              edges: edges.map((edge) => ({
                source: edge.source,
                target: edge.target,
                relationship: edge.relationship,
              })),
            },
          }
        : {}),
    }
  },
)

// Share slugs are globally unique, so the title alone would collide on the
// second diagram with the same name.
export function buildShareSlug(title: string): string {
  const base = title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  const suffix = Math.random().toString(36).slice(2, 8)
  return `${base || 'diagram'}-${suffix}`
}

// The generated client types the write endpoints as returning the write body,
// but Django answers with the full read serializer.
export function unwrapTemplate(
  response: { status: number; data: unknown },
  okStatus: number,
  what: string,
): GenerationTemplateRead {
  if (response.status !== okStatus) {
    throw new Error(
      `Failed to ${what}: ${response.status} ${JSON.stringify(response.data)}`,
    )
  }
  return response.data as GenerationTemplateRead
}

export const publishDiagramDef = toolDefinition({
  name: 'publishDiagram',
  description:
    'Save a validated diagram specification as a SchemaVIZ template and return links that open it in the interactive canvas. Use this whenever the user wants to see, open, share or keep a diagram; createDiagram only returns data. Pass a recordId to get a link that renders that record immediately. Pass the templateId from an earlier call to update that template instead of creating another one.',
  inputSchema: z.object({
    spec: diagramSpecSchema,
    recordId: z
      .string()
      .optional()
      .describe('Primary key of the root record the diagram link should show.'),
    templateId: z
      .string()
      .optional()
      .describe(
        'Id of a template created by this tool, to update it in place.',
      ),
  }),
  outputSchema: z.object({
    templateId: z.string(),
    shareSlug: z.string(),
    builderUrl: z.string().describe('Edit the template in the builder.'),
    pickerUrl: z
      .string()
      .describe('Pick a root record, then view the diagram.'),
    diagramUrl: z
      .string()
      .nullable()
      .describe('Interactive canvas for the given recordId.'),
    embedUrl: z
      .string()
      .nullable()
      .describe('Chrome-less variant of diagramUrl for iframes.'),
  }),
})

export const publishDiagram = publishDiagramDef.server<AiToolContext>(
  async ({ spec, recordId, templateId }, { context }) => {
    const init = backendRequestInit(context)
    const recipe = specToRecipe(spec)

    let template: GenerationTemplateRead
    if (templateId) {
      const existing = unwrapTemplate(
        await schemaVizGenerationTemplatesRetrieve(templateId, init),
        200,
        'load template',
      )
      const request = recipeToGenerationTemplateWriteRequest(recipe, {
        template: existing,
        shareSlug: existing.shareSlug ?? buildShareSlug(spec.title),
      })
      if (!request) {
        throw new Error(
          'The specification resolves to no models; fix it with validateDiagram first.',
        )
      }
      template = unwrapTemplate(
        await schemaVizGenerationTemplatesUpdate(templateId, request, init),
        200,
        'update template',
      )
    } else {
      const request = recipeToGenerationTemplateWriteRequest(recipe, {
        shareSlug: buildShareSlug(spec.title),
      })
      if (!request) {
        throw new Error(
          'The specification resolves to no models; fix it with validateDiagram first.',
        )
      }
      template = unwrapTemplate(
        await schemaVizGenerationTemplatesCreate(request, init),
        201,
        'create template',
      )
    }

    const published = unwrapTemplate(
      await schemaVizGenerationTemplatesPublishCreate(template.id, init),
      200,
      'publish template',
    )
    const shareSlug = published.shareSlug
    if (!shareSlug) {
      throw new Error('The published template has no share slug.')
    }

    const diagramPath = recordId
      ? `/generate/${encodeURIComponent(shareSlug)}/${encodeURIComponent(recordId)}`
      : null

    return {
      templateId: published.id,
      shareSlug,
      builderUrl: appUrl(
        context,
        `/builder?templateId=${encodeURIComponent(published.id)}`,
      ),
      pickerUrl: appUrl(context, `/generate/${encodeURIComponent(shareSlug)}/`),
      diagramUrl: diagramPath ? appUrl(context, diagramPath) : null,
      embedUrl: diagramPath ? appUrl(context, `${diagramPath}?embed=1`) : null,
    }
  },
)
