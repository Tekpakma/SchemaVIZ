import { queryOptions } from '@tanstack/react-query'
import * as R from 'remeda'

import {
  schemaVizModelTemplateDefaultsCreate,
  schemaVizModelTemplateDefaultsList,
  schemaVizModelTemplateDefaultsPartialUpdate,
  schemaVizModelsList,
  schemaVizQueryMetadataCreate,
  schemaVizRouteList,
  schemaVizShapesRetrieve,
  schemaVizTemplatesCreate,
  schemaVizTemplatesList,
  schemaVizTemplatesPartialUpdate,
  schemaVizTemplateUniquenessCreate,
} from '@/api/generated/schema-viz'
import type { ModelTemplateDefault, StyleTemplate } from '@/api/contracts'
import type { RecipeModel, RecipeStyleDraft } from './types'
import { toModelId } from '@/features/lexical/dataReference/modelUtils'

type SaveStyleTemplateDraftInput = {
  defaultEntry?: ModelTemplateDefault | null
  draft: RecipeStyleDraft
  model: RecipeModel
  setAsDefault: boolean
}

function toTemplatePayload(draft: RecipeStyleDraft, model: RecipeModel) {
  return {
    name: draft.name.trim() || `${model.displayName} node`,
    textContent: draft.textContent,
    visualStyles: draft.visualStyles,
    dimensions: draft.dimensions,
    typeSpecificData: draft.typeSpecificData,
    targetModel: toModelId(model.appLabel, model.modelName),
    isModelExclusive: true,
  }
}

/** Strip a trailing ` (N)` suffix so re-saves don't stack. */
function stripIncrementSuffix(name: string): string {
  return name.replace(/\s*\(\d+\)\s*$/, '').trim()
}

/**
 * Preflight uniqueness check for style template names.
 * If the name is taken, auto-increments it: "Server node" → "Server node (2)".
 * Skips the check when updating an existing template (persistedTemplateId).
 */
async function resolveUniqueStyleTemplateName(
  name: string,
  persistedTemplateId: string | null,
): Promise<string> {
  // Updates keep the same template row — no conflict possible with itself
  if (persistedTemplateId) return name

  const baseName = stripIncrementSuffix(name) || name

  const check = await schemaVizTemplateUniquenessCreate({
    templateKind: 'style',
    name: baseName,
    isGlobal: false,
  })

  if (check.status === 200 && check.data.nameUnique) {
    return baseName
  }

  // Name taken — probe incremented names
  for (let n = 2; n <= 50; n++) {
    const candidate = `${baseName} (${n})`
    const probe = await schemaVizTemplateUniquenessCreate({
      templateKind: 'style',
      name: candidate,
      isGlobal: false,
    })
    if (probe.status === 200 && probe.data.nameUnique) {
      return candidate
    }
  }

  return baseName
}

export async function saveBuilderStyleTemplateDraft({
  defaultEntry,
  draft,
  model,
  setAsDefault,
}: SaveStyleTemplateDraftInput): Promise<StyleTemplate> {
  const payload = toTemplatePayload(draft, model)

  // Resolve a unique name before creating
  payload.name = await resolveUniqueStyleTemplateName(
    payload.name,
    draft.persistedTemplateId,
  )

  const templateResponse = draft.persistedTemplateId
    ? await schemaVizTemplatesPartialUpdate(draft.persistedTemplateId, payload)
    : await schemaVizTemplatesCreate(payload)
  const template = templateResponse.data

  if (setAsDefault && template.id) {
    const modelRef = toModelId(model.appLabel, model.modelName)
    if (defaultEntry?.id) {
      await schemaVizModelTemplateDefaultsPartialUpdate(defaultEntry.id, {
        modelRef,
        styleTemplateId: template.id,
      })
    } else {
      await schemaVizModelTemplateDefaultsCreate({
        modelRef,
        styleTemplateId: template.id,
      })
    }
  }

  return template
}

export const BUILDER_SCHEMA_QUERIES = {
  _base: {
    queryKey: ['builder'] as const,
  },
  models: () =>
    queryOptions({
      queryKey: [...BUILDER_SCHEMA_QUERIES._base.queryKey, 'models'],
      queryFn: async () => {
        const response = await schemaVizModelsList({ excludeDjango: true })

        if (response.status !== 200) {
          throw new Error(`Failed to fetch schema models: ${response.status}`)
        }

        return R.sortBy(
          response.data,
          R.prop('appVerboseName'),
          R.prop('verboseName'),
        )
      },
      staleTime: 1000 * 60 * 10,
    }),

  routes: (startModel: string, endModel: string, waypoints?: string[]) =>
    queryOptions({
      queryKey: [
        ...BUILDER_SCHEMA_QUERIES._base.queryKey,
        'routes',
        startModel,
        endModel,
        ...(waypoints?.length ? [waypoints.join(',')] : []),
      ] as const,
      queryFn: async () => {
        const response = await schemaVizRouteList({
          startModel,
          endModel,
          limit: 20,
          maxDepth: 12,
          ...(waypoints?.length ? { waypoints: waypoints.join(',') } : {}),
        })

        if (response.status !== 200) {
          return []
        }

        return response.data
      },
      enabled: Boolean(startModel && endModel && startModel !== endModel),
      staleTime: 1000 * 60 * 10,
    }),

  queryMetadata: (appLabel: string, modelName: string) =>
    queryOptions({
      queryKey: [
        ...BUILDER_SCHEMA_QUERIES._base.queryKey,
        'query-metadata',
        appLabel,
        modelName,
      ] as const,
      queryFn: async () => {
        const response = await schemaVizQueryMetadataCreate({
          appLabel,
          modelName,
        })

        if (response.status !== 200) {
          throw new Error(
            `Failed to fetch QLab metadata: ${response.status}`,
          )
        }

        return response.data
      },
      enabled: Boolean(appLabel && modelName),
      staleTime: 1000 * 60 * 10,
    }),

  styleTemplates: (appLabel: string, modelName: string) =>
    queryOptions({
      queryKey: [
        ...BUILDER_SCHEMA_QUERIES._base.queryKey,
        'style-templates',
        appLabel,
        modelName,
      ] as const,
      queryFn: async () => {
        const response = await schemaVizTemplatesList({
          app_label: appLabel,
          model_name: modelName,
        })

        return response.data
      },
      enabled: Boolean(appLabel && modelName),
      staleTime: 1000 * 60 * 10,
    }),

  modelTemplateDefaults: () =>
    queryOptions({
      queryKey: [
        ...BUILDER_SCHEMA_QUERIES._base.queryKey,
        'model-template-defaults',
      ] as const,
      queryFn: async () => {
        const response = await schemaVizModelTemplateDefaultsList()

        return response.data
      },
      staleTime: 1000 * 60 * 10,
    }),

  shapes: () =>
    queryOptions({
      queryKey: [
        ...BUILDER_SCHEMA_QUERIES._base.queryKey,
        'shapes',
      ] as const,
      queryFn: async () => {
        const response = await schemaVizShapesRetrieve()
        const data = response.data as unknown as ShapesApiResponse
        return data.shapes
      },
      staleTime: 1000 * 60 * 30,
    }),
}

export type ShapeEntry = {
  key: string
  label: string
  defaultWidth: number
  defaultHeight: number
  category: string
  svgViewbox: string | null
  svgStrokeWidth: number
  svgElements: Array<{
    tag: string
    attrs: Record<string, string>
    fillMode: string
    strokeMode: string
    strokeDasharray: string | null
  }>
}

type ShapesApiResponse = {
  shapes: ShapeEntry[]
  aliases: Record<string, string>
}
