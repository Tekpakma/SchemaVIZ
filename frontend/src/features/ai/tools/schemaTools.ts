import { z } from 'zod'
import { toolDefinition } from '@tanstack/ai'

import {
  schemaVizGraphRetrieve,
  schemaVizModelDetailsRetrieve,
  schemaVizModelsList,
} from '@/api/generated/schema-viz'

import type { AiToolContext } from './context'
import { backendRequestInit, unwrapOk } from './context'

const modelSummarySchema = z.object({
  modelId: z.string(),
  appLabel: z.string(),
  appName: z.string(),
  modelName: z.string(),
  verboseName: z.string(),
})

function describeEdgeKind(edge: {
  isManyToMany?: boolean
  isOneToOne?: boolean
  isSubclass?: boolean
}): string {
  if (edge.isManyToMany) return 'manyToMany'
  if (edge.isOneToOne) return 'oneToOne'
  if (edge.isSubclass) return 'subclass'
  return 'foreignKey'
}

export const listModelsDef = toolDefinition({
  name: 'listModels',
  description:
    'List the Django models the current user is allowed to see. Use this first to discover which models exist before referring to one by id. Model ids have the form "app_label.ModelName".',
  inputSchema: z.object({
    appLabel: z
      .string()
      .optional()
      .describe('Restrict the result to a single Django app label.'),
  }),
  outputSchema: z.object({
    models: z.array(modelSummarySchema),
  }),
})

export const listModels = listModelsDef.server<AiToolContext>(
  async ({ appLabel }, { context }) => {
    const response = await schemaVizModelsList(
      { appLabel, excludeDjango: true },
      backendRequestInit(context),
    )
    const models = unwrapOk(response, 'list models')

    return {
      models: models.map((model) => ({
        modelId: `${model.appLabel}.${model.modelName}`,
        appLabel: model.appLabel,
        appName: model.appVerboseName,
        modelName: model.modelName,
        verboseName: model.verboseName,
      })),
    }
  },
)

export const getModelDetailsDef = toolDefinition({
  name: 'getModelDetails',
  description:
    'Get the fields and relationships of a single model. Call this before building a diagram step that traverses a relationship, so the relationship name is exact.',
  inputSchema: z.object({
    appLabel: z.string(),
    modelName: z.string(),
  }),
  outputSchema: z.object({
    modelId: z.string(),
    verboseName: z.string(),
    fields: z.array(z.object({ name: z.string(), type: z.string() })),
    relations: z.array(
      z.object({
        name: z.string(),
        type: z.string(),
        relatedModel: z.string(),
      }),
    ),
  }),
})

export const getModelDetails = getModelDetailsDef.server<AiToolContext>(
  async ({ appLabel, modelName }, { context }) => {
    const response = await schemaVizModelDetailsRetrieve(
      { appLabel, modelName },
      backendRequestInit(context),
    )
    const model = unwrapOk(response, 'get model details')

    return {
      modelId: `${model.appLabel}.${model.modelName}`,
      verboseName: model.verboseName,
      fields: model.fields.map((field) => ({
        name: field.name,
        type: field.type,
      })),
      relations: model.relations.map((relation) => ({
        name: relation.name,
        type: relation.type,
        relatedModel: relation.relatedModel,
      })),
    }
  },
)

export const getSchemaDigestDef = toolDefinition({
  name: 'getSchemaDigest',
  description:
    'Get a compact map of models and how they connect, without field lists. Use this to understand the overall shape of the schema; narrow it with apps or search when the project is large.',
  inputSchema: z.object({
    apps: z
      .array(z.string())
      .optional()
      .describe('Restrict the digest to these Django app labels.'),
    search: z
      .string()
      .optional()
      .describe('Only keep models whose name matches this text.'),
  }),
  outputSchema: z.object({
    models: z.array(
      z.object({
        modelId: z.string(),
        label: z.string(),
        appLabel: z.string(),
      }),
    ),
    edges: z.array(
      z.object({
        from: z.string(),
        to: z.string(),
        viaField: z.string(),
        kind: z.string(),
      }),
    ),
  }),
})

export const getSchemaDigest = getSchemaDigestDef.server<AiToolContext>(
  async ({ apps, search }, { context }) => {
    const response = await schemaVizGraphRetrieve(
      {
        includeFields: false,
        ...(apps?.length ? { apps: apps.join(',') } : {}),
        ...(search ? { search } : {}),
      },
      backendRequestInit(context),
    )
    const graph = unwrapOk(response, 'get schema digest')

    return {
      models: graph.nodes.map((node) => ({
        modelId: node.id,
        label: node.name,
        appLabel: node.appLabel,
      })),
      edges: graph.edges.map((edge) => ({
        from: edge.source,
        to: edge.target,
        viaField: edge.sourceField ?? edge.targetField ?? '',
        kind: describeEdgeKind(edge),
      })),
    }
  },
)
