import type { StartAuthContext } from '@/serverAuth/startAuth'
import { getForwardedBackendHeaders } from '@/features/canvas/layout.server'

/**
 * Request-scoped state for server tool implementations. Passed to `chat()` as
 * `context` per request, so no tool ever reaches for module-level auth.
 */
export type AiToolContext = {
  auth: StartAuthContext
}

export function backendRequestInit(context: AiToolContext): RequestInit {
  return { headers: getForwardedBackendHeaders(context.auth) }
}

// Generated clients return a success|error union discriminated by status.
export function unwrapOk<T extends { status: number; data: unknown }>(
  response: T,
  what: string,
): Extract<T, { status: 200 }>['data'] {
  if (response.status !== 200) {
    throw new Error(`Failed to ${what}: ${response.status}`)
  }
  return response.data
}
