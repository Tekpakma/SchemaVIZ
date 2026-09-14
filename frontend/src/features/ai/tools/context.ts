import type { StartAuthContext } from '@/serverAuth/startAuth'
import { getStartAuthBackend } from '@/serverAuth/startAuth'
import type { SchemaVizFetchOptions } from '@/api/fetch'
import { getForwardedBackendHeaders } from '@/features/canvas/layout.server'

/**
 * Request-scoped state for server tool implementations. Passed to `chat()` as
 * `context` per request, so no tool ever reaches for module-level auth.
 */
export type AiToolContext = {
  auth: StartAuthContext
  /** Public origin of this app; without it tools hand back relative links. */
  appOrigin?: string
}

// Tools run on the server, so the generated client must talk to Django
// directly instead of the browser-facing proxy path.
export function backendRequestInit(
  context: AiToolContext,
): SchemaVizFetchOptions {
  return {
    headers: getForwardedBackendHeaders(context.auth),
    baseUrl: getStartAuthBackend().backendBaseUrl,
  }
}

export function appUrl(context: AiToolContext, path: string): string {
  return context.appOrigin ? new URL(path, context.appOrigin).toString() : path
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
