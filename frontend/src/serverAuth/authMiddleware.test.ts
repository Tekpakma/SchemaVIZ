import { describe, expect, it, vi } from 'vitest'

import { authFunctionMiddleware } from './authMiddleware'
import type { StartAuthContext } from './startAuth'

type AuthFunctionServerOptions = Parameters<
  NonNullable<typeof authFunctionMiddleware.options.server>
>[0]

function createMiddlewareOptions(context: { auth?: StartAuthContext | null }) {
  return {
    context,
    data: undefined,
    method: 'GET',
    next: vi.fn(async (ctx?: { context?: unknown }) => ({
      'use functions must return the result of next()': true,
      context: ctx?.context ?? {},
      headers: {},
      sendContext: {},
    })),
    serverFnMeta: { id: 'test-fn' },
    signal: new AbortController().signal,
  }
}

describe('authFunctionMiddleware', () => {
  it('fails closed when auth context is absent', async () => {
    const options = createMiddlewareOptions(
      {},
    ) as unknown as AuthFunctionServerOptions

    await expect(
      authFunctionMiddleware.options.server?.(options),
    ).rejects.toThrow('Unauthorized')
  })

  it('passes non-null auth through to protected handlers', async () => {
    const auth: StartAuthContext = {
      accessToken: 'access-token',
      kind: 'browser',
      sessionId: 'session-1',
      user: {
        name: 'Test User',
        sub: 'user-1',
      },
    }
    const options = createMiddlewareOptions({
      auth,
    }) as unknown as AuthFunctionServerOptions

    await authFunctionMiddleware.options.server?.(options)

    expect(options.next).toHaveBeenCalledWith({ context: { auth } })
  })
})
