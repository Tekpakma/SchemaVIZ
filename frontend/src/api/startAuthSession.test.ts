import { afterEach, describe, expect, it, vi } from 'vitest'

import { fetchStartAuthSession } from './startAuthSession'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchStartAuthSession', () => {
  it('parses the public Start auth session', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            mode: 'oidc',
            authRequired: true,
            user: { sub: '1', name: 'kai' },
            auth: {
              providerLabel: 'Local Django OAuth',
              loginUrl: '/_schema-viz/auth/login',
              logoutUrl: '/_schema-viz/auth/logout',
            },
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        ),
      ),
    )

    await expect(fetchStartAuthSession()).resolves.toMatchObject({
      authRequired: true,
      mode: 'oidc',
      user: { sub: '1' },
    })
  })

  it('uses endpoint detail text for session request failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ detail: 'Session unavailable' }), {
          status: 503,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    )

    await expect(fetchStartAuthSession()).rejects.toThrow('Session unavailable')
  })
})
