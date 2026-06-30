import { queryOptions } from '@tanstack/react-query'
import * as zod from 'zod'

import {
  GenerationTemplateList,
  GenerationTemplateOwnRecentQuickAccess,
  PaginatedGenerationTemplateQuickAccessEntryList,
} from '@/api/contracts'
import {
  getSchemaVizGenerationTemplateQuickAccessFeaturedListUrl,
  getSchemaVizGenerationTemplateQuickAccessRetrieveUrl,
} from '@/api/generated/schema-viz'
import type { SchemaVizGenerationTemplateQuickAccessFeaturedListParams } from '@/api/generated/schema-viz'
import {
  createHomeTemplateEntryFromListTemplate,
  type GenerationTemplateListWithSample,
} from './homeTemplatePreview'

const HOME_QUICK_ACCESS_KEY = ['home', 'quick-access'] as const
export const HOME_FEATURED_TEMPLATE_LIMIT = 8

function getErrorMessage(responseData: unknown, status: number) {
  if (responseData && typeof responseData === 'object') {
    const record = responseData as Record<string, unknown>
    const message = record.detail ?? record.error ?? record.message
    if (typeof message === 'string' && message.trim()) return message
  }

  return `Failed to fetch home templates: ${status}`
}

async function parseQuickAccessResponseBody(response: Response) {
  if (response.status === 204) return undefined

  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    return response.json()
  }

  const text = await response.text()
  return text.length === 0 ? undefined : text
}

async function fetchHomeQuickAccess(url: string) {
  const response = await fetch(url, {
    credentials: 'include',
    headers: {
      accept: 'application/json',
    },
  })

  return {
    data: await parseQuickAccessResponseBody(response),
    headers: response.headers,
    status: response.status,
  }
}
export class HomeQuickAccessRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'HomeQuickAccessRequestError'
  }
}

const GenerationTemplateSample = zod.object({
  recordId: zod.string().nullable(),
  recordDisplayName: zod.string().nullable(),
  status: zod.enum(['ready', 'no_record', 'error']),
  run: zod.unknown().optional(),
})
const GenerationTemplateListWithSampleSchema = GenerationTemplateList.extend({
  sample: GenerationTemplateSample.optional(),
})

export function shouldRetryHomeQuickAccessRequest(
  failureCount: number,
  error: Error,
) {
  if (
    error instanceof HomeQuickAccessRequestError &&
    (error.status === 401 || error.status === 403)
  ) {
    return false
  }

  return failureCount < 3
}

async function fetchAllTemplates() {
  const response = await fetchHomeQuickAccess(
    '/schema-viz/generation-templates/?includeSample=true',
  )
  const status = response.status as number

  if (status !== 200) {
    throw new HomeQuickAccessRequestError(
      getErrorMessage(response.data, status),
      status,
    )
  }

  return zod
    .array(GenerationTemplateListWithSampleSchema)
    .parse(response.data)
    .map((template) =>
      createHomeTemplateEntryFromListTemplate(
        template as GenerationTemplateListWithSample,
      ),
    )
}

async function fetchOwnRecentQuickAccess() {
  const response = await fetchHomeQuickAccess(
    getSchemaVizGenerationTemplateQuickAccessRetrieveUrl(),
  )
  const status = response.status as number

  if (status !== 200) {
    throw new HomeQuickAccessRequestError(
      getErrorMessage(response.data, status),
      status,
    )
  }

  return GenerationTemplateOwnRecentQuickAccess.parse(response.data)
}

async function fetchFeaturedQuickAccess(
  params: SchemaVizGenerationTemplateQuickAccessFeaturedListParams,
) {
  const response = await fetchHomeQuickAccess(
    getSchemaVizGenerationTemplateQuickAccessFeaturedListUrl(params),
  )
  const status = response.status as number

  if (status !== 200) {
    throw new HomeQuickAccessRequestError(
      getErrorMessage(response.data, status),
      status,
    )
  }

  return PaginatedGenerationTemplateQuickAccessEntryList.parse(response.data)
}

export const HOME_QUICK_ACCESS_QUERIES = {
  _base: queryOptions({
    queryKey: HOME_QUICK_ACCESS_KEY,
  }),

  ownRecent: () =>
    queryOptions({
      queryKey: [...HOME_QUICK_ACCESS_KEY, 'own-recent'] as const,
      queryFn: fetchOwnRecentQuickAccess,
      retry: shouldRetryHomeQuickAccessRequest,
      retryOnMount: false,
      staleTime: 1000 * 60 * 5,
    }),

  all: () =>
    queryOptions({
      queryKey: [...HOME_QUICK_ACCESS_KEY, 'all'] as const,
      queryFn: fetchAllTemplates,
      retry: shouldRetryHomeQuickAccessRequest,
      retryOnMount: false,
      staleTime: 1000 * 60 * 5,
    }),

  featured: (
    params: SchemaVizGenerationTemplateQuickAccessFeaturedListParams = {},
  ) =>
    queryOptions({
      queryKey: [
        ...HOME_QUICK_ACCESS_KEY,
        'featured',
        params.limit ?? null,
        params.offset ?? null,
      ] as const,
      queryFn: () => fetchFeaturedQuickAccess(params),
      retry: shouldRetryHomeQuickAccessRequest,
      retryOnMount: false,
      staleTime: 1000 * 60 * 5,
    }),
}
