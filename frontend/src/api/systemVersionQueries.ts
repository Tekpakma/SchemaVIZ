import { queryOptions } from '@tanstack/react-query'

import { BackendVersionResponse } from '@/api/generated/zod'
import { schemaVizVersionRetrieve } from '@/api/generated/schema-viz'

const SYSTEM_VERSION_KEY = ['system', 'version'] as const

function getErrorMessage(responseData: unknown, status: number) {
  if (responseData && typeof responseData === 'object') {
    const record = responseData as Record<string, unknown>
    const message = record.detail ?? record.error ?? record.message
    if (typeof message === 'string' && message.trim()) return message
  }

  return `Failed to fetch backend version: ${status}`
}

export class BackendVersionRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'BackendVersionRequestError'
  }
}

export async function fetchBackendVersion() {
  const response = await schemaVizVersionRetrieve()
  const status = response.status as number

  if (status !== 200) {
    throw new BackendVersionRequestError(
      getErrorMessage(response.data, status),
      status,
    )
  }

  return BackendVersionResponse.parse(response.data).version
}

export const SYSTEM_VERSION_QUERIES = {
  backend: () =>
    queryOptions({
      queryKey: [...SYSTEM_VERSION_KEY, 'backend'] as const,
      queryFn: fetchBackendVersion,
      staleTime: 1000 * 60 * 5,
    }),
}
