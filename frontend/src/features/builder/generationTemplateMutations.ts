import type { GenerationTemplateRead } from '@/api/contracts'
import {
  schemaVizGenerationTemplatesCreate,
  schemaVizGenerationTemplatesDestroy,
  schemaVizGenerationTemplatesPublishCreate,
  schemaVizGenerationTemplatesUpdate,
} from '@/api/generated/schema-viz'
import type { RecipeData } from './types'
import { recipeToGenerationTemplateWriteRequest } from './templateRecipe'

export class GenerationTemplateSaveError extends Error {
  /** Raw DRF validation errors, e.g. `{ name: ["..."] }` */
  fieldErrors: Record<string, string[]> | null

  constructor(message: string, fieldErrors?: Record<string, string[]>) {
    super(message)
    this.name = 'GenerationTemplateSaveError'
    this.fieldErrors = fieldErrors ?? null
  }
}

function asTemplateRead(data: unknown): GenerationTemplateRead {
  return data as GenerationTemplateRead
}

/**
 * Parses a DRF-style validation error response body into field→messages map.
 * Handles shapes like `{ name: ["msg"] }`, `{ detail: "msg" }`, and
 * `{ non_field_errors: ["msg"] }`.
 */
function parseDrfErrors(data: unknown): Record<string, string[]> | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null

  const record = data as Record<string, unknown>
  const result: Record<string, string[]> = {}
  let hasFields = false

  for (const [key, value] of Object.entries(record)) {
    if (Array.isArray(value)) {
      const messages = value.filter(
        (item): item is string => typeof item === 'string',
      )
      if (messages.length > 0) {
        result[key] = messages
        hasFields = true
      }
    } else if (typeof value === 'string') {
      result[key] = [value]
      hasFields = true
    }
  }

  return hasFields ? result : null
}

function formatDrfErrors(fieldErrors: Record<string, string[]>): string {
  const messages = Object.values(fieldErrors).flat()
  return messages.join('\n')
}

function throwSaveError(fallbackMessage: string, responseData: unknown): never {
  const fieldErrors = parseDrfErrors(responseData)
  const message = fieldErrors ? formatDrfErrors(fieldErrors) : fallbackMessage
  throw new GenerationTemplateSaveError(message, fieldErrors ?? undefined)
}

function getTemplateWriteRequest({
  recipe,
  scope,
  shareSlug,
  template,
}: {
  recipe: RecipeData
  scope?: 'owner' | 'global'
  shareSlug?: string | null
  template?: GenerationTemplateRead | null
}) {
  const request = recipeToGenerationTemplateWriteRequest(recipe, {
    scope,
    shareSlug,
    template,
  })
  if (!request) {
    throw new GenerationTemplateSaveError(
      'Add at least one model before saving this template.',
    )
  }
  return request
}

export async function saveGenerationTemplateDraft({
  recipe,
  scope,
  shareSlug,
  template,
  templateId,
}: {
  recipe: RecipeData
  scope?: 'owner' | 'global'
  shareSlug?: string | null
  template?: GenerationTemplateRead | null
  templateId?: string | null
}) {
  const request = getTemplateWriteRequest({
    recipe,
    scope,
    shareSlug,
    template,
  })

  if (!templateId) {
    const response = await schemaVizGenerationTemplatesCreate(request)
    const status = response.status as number
    if (status !== 201) {
      throwSaveError(`Could not create template: ${status}`, response.data)
    }
    return {
      created: true,
      template: asTemplateRead(response.data),
    }
  }

  const headers =
    template?.revision == null
      ? undefined
      : {
          'If-Match': `"${template.revision}"`,
        }
  const response = await schemaVizGenerationTemplatesUpdate(
    templateId,
    request,
    headers ? { headers } : undefined,
  )
  const status = response.status as number
  if (status !== 200) {
    throwSaveError(`Could not save template: ${status}`, response.data)
  }

  return {
    created: false,
    template: asTemplateRead(response.data),
  }
}

export async function publishGenerationTemplate(templateId: string) {
  const response = await schemaVizGenerationTemplatesPublishCreate(templateId)
  const status = response.status as number
  if (status !== 200) {
    throwSaveError(`Could not publish template: ${status}`, response.data)
  }
  return asTemplateRead(response.data)
}

export async function deleteGenerationTemplate(templateId: string) {
  const response = await schemaVizGenerationTemplatesDestroy(templateId)
  const status = response.status as number
  if (status !== 204) {
    throwSaveError(`Could not delete template: ${status}`, response.data)
  }
}
