import type * as oauth from 'oauth4webapi'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  __createStartAuthSessionCookieForTests,
  __setStartAuthTestOverrides,
  getValidAccessToken,
  proxySchemaVizRequest,
} from './startAuth'
import type { StartAuthUser } from './startAuth'
import { MemoryStartAuthTokenStore } from './tokenStore'
import type { StartAuthTokenRecord } from './tokenStore'

const AUTH_ENV_KEYS = [
  'NODE_ENV',
  'SCHEMA_VIZ_AUTH_MODE',
  'SCHEMA_VIZ_AUTH_SECRET',
  'SCHEMA_VIZ_AUTH_STORE_DIR',
  'SCHEMA_VIZ_OIDC_CLIENT_ID',
  'SCHEMA_VIZ_OIDC_CLIENT_SECRET',
  'SCHEMA_VIZ_OIDC_ISSUER',
  'SCHEMA_VIZ_SERVER_BASE_URL',
] as const

const originalEnv = Object.fromEntries(
  AUTH_ENV_KEYS.map((key) => [key, process.env[key]]),
)

const testUser: StartAuthUser = {
  email: 'user@example.test',
  name: 'Test User',
  sub: 'user-1',
}

function restoreEnv() {
  for (const key of AUTH_ENV_KEYS) {
    const value = originalEnv[key]
    if (typeof value === 'string') {
      process.env[key] = value
    } else {
      delete process.env[key]
    }
  }
}

function configureOidcEnv(clientSecret?: string) {
  process.env.NODE_ENV = 'test'
  process.env.SCHEMA_VIZ_AUTH_MODE = 'oidc'
  process.env.SCHEMA_VIZ_AUTH_SECRET = 'test-auth-secret-with-at-least-32-chars'
  process.env.SCHEMA_VIZ_OIDC_CLIENT_ID = 'schema-viz-local'
  process.env.SCHEMA_VIZ_OIDC_ISSUER = 'http://issuer.test'
  process.env.SCHEMA_VIZ_SERVER_BASE_URL = 'http://localhost:8000/schema-viz'
  if (clientSecret) {
    process.env.SCHEMA_VIZ_OIDC_CLIENT_SECRET = clientSecret
  } else {
    delete process.env.SCHEMA_VIZ_OIDC_CLIENT_SECRET
  }
}

function tokenRecord(
  overrides: Partial<StartAuthTokenRecord> = {},
): StartAuthTokenRecord {
  return {
    createdAt: Date.now(),
    refreshToken: 'refresh-token',
    sessionId: 'session-1',
    updatedAt: Date.now(),
    user: testUser,
    version: 1,
    ...overrides,
  }
}

function cookiePair(setCookie: string) {
  return setCookie.split(';')[0]!
}

beforeEach(() => {
  restoreEnv()
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})

afterEach(() => {
  __setStartAuthTestOverrides({ tokenStore: null })
  restoreEnv()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Start OIDC token refresh client auth', () => {
  it('uses a public PKCE client when no client secret is configured', async () => {
    configureOidcEnv()
    const store = new MemoryStartAuthTokenStore()
    await store.write(
      tokenRecord({
        accessToken: 'expired-access-token',
        accessTokenExpiresAt: Date.now() - 1_000,
      }),
    )

    const tokenAuth = {
      body: new URLSearchParams(),
      headers: new Headers(),
    }
    let capturedClient: oauth.Client | undefined
    const authServer = {} as oauth.AuthorizationServer

    __setStartAuthTestOverrides({
      oauth: {
        authorizationServer: authServer,
        processRefreshTokenResponse: vi.fn(async () => ({
          access_token: 'fresh-access-token',
          expires_in: 3600,
          token_type: 'bearer' as const,
        })),
        refreshTokenGrantRequest: vi.fn(
          async (as, client, clientAuth, refreshToken) => {
            capturedClient = client
            expect(as).toBe(authServer)
            expect(refreshToken).toBe('refresh-token')
            await clientAuth(as, client, tokenAuth.body, tokenAuth.headers)
            return new Response('{}')
          },
        ),
      },
      tokenStore: store,
    })

    await expect(getValidAccessToken('session-1')).resolves.toBe(
      'fresh-access-token',
    )
    expect(capturedClient?.token_endpoint_auth_method).toBe('none')
    expect(tokenAuth.body.get('client_id')).toBe('schema-viz-local')
    expect(tokenAuth.body.get('client_secret')).toBeNull()
    expect(tokenAuth.headers.get('authorization')).toBeNull()
  })

  it('uses client_secret_basic when a client secret is configured', async () => {
    configureOidcEnv('client-secret')
    const store = new MemoryStartAuthTokenStore()
    await store.write(
      tokenRecord({
        accessToken: 'expired-access-token',
        accessTokenExpiresAt: Date.now() - 1_000,
      }),
    )

    const tokenAuth = {
      body: new URLSearchParams(),
      headers: new Headers(),
    }
    let capturedClient: oauth.Client | undefined

    __setStartAuthTestOverrides({
      oauth: {
        authorizationServer: {} as oauth.AuthorizationServer,
        processRefreshTokenResponse: vi.fn(async () => ({
          access_token: 'fresh-access-token',
          expires_in: 3600,
          token_type: 'bearer' as const,
        })),
        refreshTokenGrantRequest: vi.fn(
          async (as, client, clientAuth, _refreshToken) => {
            capturedClient = client
            await clientAuth(as, client, tokenAuth.body, tokenAuth.headers)
            return new Response('{}')
          },
        ),
      },
      tokenStore: store,
    })

    await expect(getValidAccessToken('session-1')).resolves.toBe(
      'fresh-access-token',
    )
    expect(capturedClient?.token_endpoint_auth_method).toBe(
      'client_secret_basic',
    )
    expect(tokenAuth.body.get('client_secret')).toBeNull()
    expect(tokenAuth.headers.get('authorization')).toMatch(/^Basic \S+$/)
  })
})

describe('proxySchemaVizRequest', () => {
  it('clears a stale Start session when the token store record is missing', async () => {
    configureOidcEnv()
    const store = new MemoryStartAuthTokenStore()
    __setStartAuthTestOverrides({ tokenStore: store })
    const sessionCookie = await __createStartAuthSessionCookieForTests('missing')

    const response = await proxySchemaVizRequest(
      new Request('http://app.test/schema-viz/graph/', {
        headers: {
          cookie: cookiePair(sessionCookie),
        },
      }),
    )

    expect(response?.status).toBe(401)
    expect(response?.headers.get('set-cookie')).toContain('sv_session=')
    expect(response?.headers.get('set-cookie')).toContain('Max-Age=0')
  })

  it('forwards DOT bearer tokens to Django and strips browser cookies', async () => {
    configureOidcEnv()
    const store = new MemoryStartAuthTokenStore()
    await store.write(
      tokenRecord({
        accessToken: 'dot-access-token',
        accessTokenExpiresAt: Date.now() + 60_000,
      }),
    )
    __setStartAuthTestOverrides({ tokenStore: store })
    const sessionCookie =
      await __createStartAuthSessionCookieForTests('session-1')
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response('{}', { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const response = await proxySchemaVizRequest(
      new Request('http://app.test/schema-viz/graph/', {
        headers: {
          cookie: `${cookiePair(sessionCookie)}; sessionid=django-session`,
        },
      }),
    )

    expect(response?.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledOnce()
    const [target, init] = fetchMock.mock.calls[0]!
    expect(String(target)).toBe('http://localhost:8000/schema-viz/graph/')
    const headers = init?.headers as Headers
    expect(headers.get('authorization')).toBe('Bearer dot-access-token')
    expect(headers.get('cookie')).toBeNull()
  })
})
