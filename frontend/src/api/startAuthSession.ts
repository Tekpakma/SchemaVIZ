import { queryOptions } from '@tanstack/react-query'
import * as z from 'zod'

export const StartAuthSessionSchema = z.object({
  mode: z.enum(['dev', 'oidc']),
  authRequired: z.boolean(),
  user: z
    .object({
      sub: z.string(),
      name: z.string().optional(),
      email: z.string().optional(),
    })
    .passthrough()
    .nullable(),
  auth: z.object({
    providerLabel: z.string(),
    loginUrl: z.string(),
    logoutUrl: z.string(),
  }),
})

export type StartAuthSession = z.infer<typeof StartAuthSessionSchema>

function getStartAuthSessionErrorMessage(
  responseData: unknown,
  status: number,
) {
  if (responseData && typeof responseData === 'object') {
    const record = responseData as Record<string, unknown>
    const message = record.detail ?? record.error ?? record.message
    if (typeof message === 'string' && message.trim()) return message
  }

  return `Failed to fetch auth session: ${status}`
}

async function parseResponseBody(response: Response) {
  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    return response.json()
  }

  const text = await response.text()
  return text.length === 0 ? undefined : text
}

export async function fetchStartAuthSession(): Promise<StartAuthSession> {
  const response = await fetch('/_schema-viz/auth/session', {
    credentials: 'include',
    headers: {
      accept: 'application/json',
    },
  })
  const body = await parseResponseBody(response)

  if (!response.ok) {
    throw new Error(getStartAuthSessionErrorMessage(body, response.status))
  }

  return StartAuthSessionSchema.parse(body)
}

export const START_AUTH_SESSION_QUERY = queryOptions({
  queryKey: ['start-auth', 'session'] as const,
  queryFn: fetchStartAuthSession,
  refetchOnMount: 'always',
  retry: false,
  staleTime: 0,
})
