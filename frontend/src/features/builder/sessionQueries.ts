import { queryOptions } from '@tanstack/react-query'

import { SessionState } from '@/api/contracts'
import { schemaVizSessionRetrieve } from '@/api/generated/schema-viz'

const BUILDER_SESSION_KEY = ['builder', 'session'] as const

async function fetchBuilderSession() {
  const response = await schemaVizSessionRetrieve()
  const status = response.status as number

  if (status !== 200) {
    throw new Error(`Failed to fetch session: ${status}`)
  }

  return SessionState.parse(response.data)
}

export const BUILDER_SESSION_QUERY = queryOptions({
  queryKey: BUILDER_SESSION_KEY,
  queryFn: fetchBuilderSession,
  staleTime: 1000 * 60 * 5,
})
