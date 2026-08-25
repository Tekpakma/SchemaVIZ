import { z } from 'zod'
import { toolDefinition } from '@tanstack/ai'
import * as R from 'remeda'

import {
  schemaVizGenerationRunsCreate,
  schemaVizGenerationRunsValidateCreate,
} from '@/api/generated/schema-viz'
import { splitModelId } from '@/features/lexical/dataReference/modelUtils'
import {
  createBlankRecipe,
  recipeToInlineDefinition,
} from '@/features/builder/templateRecipe'
import type {
  RecipeData,
  RecipeModel,
  TraversalEdge,
} from '@/features/builder/types'

import type { AiToolContext } from './context'
import { backendRequestInit, unwrapOk } from './context'

/**
 * The diagram shape the model produces. Deliberately far smaller than
 * RecipeData: everything the builder needs but an author would not decide
 * (layers, swatches, style drafts) is filled in from the blank recipe.
 */
export const diagramSpecSchema = z.object({
  title: z.string().describe('Human-readable title for the diagram.'),
  rootModel: z
    .string()
    .describe(
      'Model id the traversal starts from, e.g. "infrastructure.BusinessGroup".',
    ),
  steps: z
    .array(
      z.object({
        fromModel: z.string().describe('Model id the hop starts at.'),
        toModel: z.string().describe('Model id the hop arrives at.'),
        relationship: z
          .string()
          .describe(
            'Exact field or reverse-accessor name connecting the two models. Verify it with getModelDetails first.',
          ),
      }),
    )
    .describe(
      'Relationship hops, each starting at a model already reachable from the root.',
    ),
  layoutDirection: z
    .enum(['LR', 'RL', 'TB', 'BT'])
    .optional()
    .describe('Flow direction of the layout. Defaults to left-to-right.'),
})

export type DiagramSpec = z.infer<typeof diagramSpecSchema>

const validationIssueSchema = z.object({
  code: z.string(),
  message: z.string(),
  stepId: z.string().nullable(),
  hint: z.string(),
})

function toRecipeModel(modelId: string, layerId: string): RecipeModel | null {
  const ref = splitModelId(modelId)
  if (!ref) return null

  return {
    id: modelId,
    appLabel: ref.appLabel,
    appVerboseName: ref.appLabel,
    modelName: ref.modelName,
    modelId,
    displayName: ref.modelName,
    layerId,
  }
}

/**
 * Model ids double as recipe step ids, which lets the traversal edges fall
 * back to a single-hop route step without a separate path lookup.
 */
export function specToRecipe(spec: DiagramSpec): RecipeData {
  const blank = createBlankRecipe()
  const layerId = blank.layers[0]!.id

  const orderedModelIds = R.unique([
    spec.rootModel,
    ...spec.steps.flatMap((step) => [step.fromModel, step.toModel]),
  ])

  const models = orderedModelIds
    .map((modelId) => toRecipeModel(modelId, layerId))
    .filter((model) => model !== null)

  const edges: TraversalEdge[] = spec.steps.map((step, index) => ({
    id: `edge-${index + 1}`,
    from: step.fromModel,
    to: step.toModel,
    fromModelId: step.fromModel,
    toModelId: step.toModel,
    via: step.relationship,
    auto: false,
    cost: 1,
  }))

  return {
    ...blank,
    title: spec.title,
    models,
    edges,
    layoutDirection: spec.layoutDirection ?? blank.layoutDirection,
  }
}

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
    'Run a validated diagram specification and report what it produced. Call validateDiagram first. Pass a recordId to fill the diagram with real records; without one you get the structure only.',
  inputSchema: z.object({
    spec: diagramSpecSchema,
    recordId: z
      .string()
      .optional()
      .describe('Primary key of the root record to start from.'),
  }),
  outputSchema: z.object({
    mode: z.string(),
    nodeCount: z.number(),
    modelsIncluded: z.array(z.string()),
    sampleLabels: z.array(z.string()),
  }),
})

export const createDiagram = createDiagramDef.server<AiToolContext>(
  async ({ spec, recordId }, { context }) => {
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

    // Only a summary travels back to the model; the full graph would cost far
    // more context than it informs.
    return {
      mode: run.mode,
      nodeCount: nodes.length,
      modelsIncluded: R.unique(
        nodes.map((node) => `${node.appLabel}.${node.modelName}`),
      ),
      sampleLabels: nodes
        .slice(0, 10)
        .map((node) => node.label ?? node.displayName),
    }
  },
)

