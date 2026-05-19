import { queryOptions } from '@tanstack/react-query'

import {
  GenerationTemplateOwnRecentQuickAccess,
  PaginatedGenerationTemplateQuickAccessEntryList,
} from '@/api/contracts'
import {
  schemaVizGenerationTemplateQuickAccessFeaturedList,
  schemaVizGenerationTemplateQuickAccessRetrieve,
} from '@/api/generated/schema-viz'
import type { SchemaVizGenerationTemplateQuickAccessFeaturedListParams } from '@/api/generated/schema-viz'

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

export class HomeQuickAccessRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'HomeQuickAccessRequestError'
  }
}

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

async function fetchOwnRecentQuickAccess() {
  const response = await schemaVizGenerationTemplateQuickAccessRetrieve()
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
  const response =
    await schemaVizGenerationTemplateQuickAccessFeaturedList(params)
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
