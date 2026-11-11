import type * as oauth from 'oauth4webapi'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { __resetStartAuthSourcesCacheForTests } from './sources'
import {
  __createStartAuthSessionCookieForTests,
  __setStartAuthTestOverrides,
  getValidAccessToken,
  handleStartAuthRequest,
  proxySchemaVizRequest,
} from './startAuth'
import type { StartAuthUser } from './startAuth'
import { MemoryStartAuthTokenStore } from './tokenStore'
import type { StartAuthTokenRecord } from './tokenStore'

const ENV_KEYS = [
  'NODE_ENV',
  'SCHEMA_VIZ_AUTH_MODE',
  'SCHEMA_VIZ_AUTH_SECRET',
  'SCHEMA_VIZ_SOURCES',
  'SCHEMA_VIZ_DEFAULT_SOURCE',
  'SCHEMA_VIZ_SERVER_BASE_URL',
  'SCHEMA_VIZ_OIDC_ISSUER',
  'SCHEMA_VIZ_OIDC_CLIENT_ID',
] as const

const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]))

const SOURCES = [
  {
    id: 'stagedev',
    label: 'Stage Dev',
    serverBaseUrl: 'http://stagedev.test/django/schema-viz',
    oidc: { issuer: 'http://stagedev.test/django/oauth', clientId: 'draw-stagedev' },
  },
  {
    id: 'qas',
    label: 'QAS',
    serverBaseUrl: 'http://qas.test/django/schema-viz',
    oidc: { issuer: 'http://qas.test/django/oauth', clientId: 'draw-qas' },
  },
  {
    id: 'prod',
    label: 'COSMOS',
    serverBaseUrl: 'http://prod.test/django/schema-viz',
    readOnly: true,
    oidc: { issuer: 'http://prod.test/django/oauth', clientId: 'draw-prod' },
  },
]

const testUser: StartAuthUser = { name: 'Test User', sub: 'user-1' }

function restoreEnv() {
  for (const key of ENV_KEYS) {
    const value = originalEnv[key]
    if (typeof value === 'string') process.env[key] = value
    else delete process.env[key]
  }
  __resetStartAuthSourcesCacheForTests()
}

function configureSources() {
  process.env.NODE_ENV = 'test'
  process.env.SCHEMA_VIZ_AUTH_MODE = 'oidc'
  process.env.SCHEMA_VIZ_AUTH_SECRET = 'test-auth-secret-with-at-least-32-chars'
  process.env.SCHEMA_VIZ_SOURCES = JSON.stringify(SOURCES)
  __resetStartAuthSourcesCacheForTests()
}

function record(overrides: Partial<StartAuthTokenRecord> = {}): StartAuthTokenRecord {
  return {
    createdAt: Date.now(),
    refreshToken: 'refresh-token',
    sessionId: 'session-1',
    updatedAt: Date.now(),
    user: testUser,
    version: 1,
    accessToken: 'access-token',
    accessTokenExpiresAt: Date.now() + 60_000,
    ...overrides,
  }
}

function cookiePair(setCookie: string) {
  return setCookie.split(';')[0]!
}

async function signedInStore(sourceId: string, sessionId = `session-${sourceId}`) {
  const store = new MemoryStartAuthTokenStore()
  await store.write(
    record({ sessionId, sourceId, accessToken: `token-${sourceId}` }),
  )
  __setStartAuthTestOverrides({ tokenStore: store })
  const cookie = cookiePair(
    await __createStartAuthSessionCookieForTests(sessionId, sourceId),
  )
  return { store, cookie }
}

function stubUpstream() {
  const fetchMock = vi.fn<typeof fetch>(
    async () => new Response('{}', { status: 200 }),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

beforeEach(() => {
  restoreEnv()
  configureSources()
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})

afterEach(() => {
  __setStartAuthTestOverrides({ tokenStore: null })
  restoreEnv()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('source selection', () => {
  it('reports the sources and which one is the default', async () => {
    const response = await handleStartAuthRequest(
      new Request('http://app.test/_schema-viz/auth/session'),
    )
    const body = await response!.json()

    expect(body.source).toMatchObject({ id: 'stagedev', isDefault: true })
    expect(
      body.sources.map((source: { id: string; isDefault: boolean }) => [
        source.id,
        source.isDefault,
      ]),
    ).toEqual([
      ['stagedev', true],
      ['qas', false],
      ['prod', false],
    ])
    expect(JSON.stringify(body)).not.toContain('draw-prod')
  })

  it('uses the configured default when the user has not picked a source', async () => {
    process.env.SCHEMA_VIZ_DEFAULT_SOURCE = 'prod'

    const response = await handleStartAuthRequest(
      new Request('http://app.test/_schema-viz/auth/session'),
    )
    const body = await response!.json()

    expect(body.source).toMatchObject({
      id: 'prod',
      isDefault: true,
      readOnly: true,
    })
  })

  it('shows a picked source as not default', async () => {
    const response = await handleStartAuthRequest(
      new Request('http://app.test/_schema-viz/auth/session', {
        headers: { cookie: 'sv_source=qas' },
      }),
    )

    expect((await response!.json()).source).toMatchObject({
      id: 'qas',
      isDefault: false,
    })
  })

  it('does not guess a backend when the configured default is unknown', async () => {
    process.env.SCHEMA_VIZ_DEFAULT_SOURCE = 'typo'
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const response = await handleStartAuthRequest(
      new Request('http://app.test/_schema-viz/auth/session'),
    )

    expect(response?.status).toBe(500)
    expect((await response!.json()).error).toContain('SCHEMA_VIZ_DEFAULT_SOURCE')
  })

  it('follows the sv_source cookie and flags a read-only source', async () => {
    const response = await handleStartAuthRequest(
      new Request('http://app.test/_schema-viz/auth/session', {
        headers: { cookie: 'sv_source=prod' },
      }),
    )
    const body = await response!.json()

    expect(body.source).toMatchObject({ id: 'prod', readOnly: true })
  })

  it('falls back to the default source for an unknown cookie value', async () => {
    const response = await handleStartAuthRequest(
      new Request('http://app.test/_schema-viz/auth/session', {
        headers: { cookie: 'sv_source=evil' },
      }),
    )

    expect((await response!.json()).source.id).toBe('stagedev')
  })

  it('switches the source and returns to the given page', async () => {
    const response = await handleStartAuthRequest(
      new Request(
        'http://app.test/_schema-viz/auth/source?source=qas&next=/builder%3Fx%3D1',
      ),
    )

    expect(response?.status).toBe(302)
    expect(response?.headers.get('location')).toBe('/builder?x=1')
    expect(response?.headers.get('set-cookie')).toContain('sv_source=qas')
  })

  it('refuses an unknown source and never redirects off-site', async () => {
    const unknown = await handleStartAuthRequest(
      new Request('http://app.test/_schema-viz/auth/source?source=nope'),
    )
    expect(unknown?.status).toBe(400)

    const offsite = await handleStartAuthRequest(
      new Request(
        'http://app.test/_schema-viz/auth/source?source=qas&next=https://evil.test/',
      ),
    )
    expect(offsite?.headers.get('location')).toBe('/')
  })

  it('refuses to start a login for an unknown source', async () => {
    const response = await handleStartAuthRequest(
      new Request('http://app.test/_schema-viz/auth/login?source=nope'),
    )

    expect(response?.status).toBe(400)
  })

  it('starts a login with the client of the requested source', async () => {
    __setStartAuthTestOverrides({
      oauth: {
        authorizationServer: {
          authorization_endpoint: 'http://qas.test/django/oauth/authorize/',
        } as oauth.AuthorizationServer,
      },
    })

    const response = await handleStartAuthRequest(
      new Request('http://app.test/_schema-viz/auth/login?source=qas&next=/'),
    )

    expect(response?.status).toBe(302)
    const location = new URL(response!.headers.get('location')!)
    expect(location.searchParams.get('client_id')).toBe('draw-qas')
    expect(location.searchParams.get('redirect_uri')).toBe(
      'http://app.test/_schema-viz/auth/callback',
    )
  })
})

describe('sessions per source', () => {
  it('keeps each source in its own session cookie', async () => {
    const stagedev = await __createStartAuthSessionCookieForTests('a', 'stagedev')
    const prod = await __createStartAuthSessionCookieForTests('b', 'prod')

    expect(cookiePair(stagedev).startsWith('sv_session_stagedev=')).toBe(true)
    expect(cookiePair(prod).startsWith('sv_session_prod=')).toBe(true)
  })

  it('does not accept the session of one source for another', async () => {
    const { cookie } = await signedInStore('qas')
    const fetchMock = stubUpstream()

    const onQas = await proxySchemaVizRequest(
      new Request('http://app.test/schema-viz/graph/', {
        headers: { cookie: `${cookie}; sv_source=qas` },
      }),
    )
    expect(onQas?.status).toBe(200)

    const onStagedev = await proxySchemaVizRequest(
      new Request('http://app.test/schema-viz/graph/', {
        headers: { cookie: `${cookie}; sv_source=stagedev` },
      }),
    )
    expect(onStagedev?.status).toBe(401)
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('sends requests to the backend and token of the selected source', async () => {
    const { cookie } = await signedInStore('qas')
    const fetchMock = stubUpstream()

    await proxySchemaVizRequest(
      new Request('http://app.test/schema-viz/graph/?a=1', {
        headers: { cookie: `${cookie}; sv_source=qas` },
      }),
    )

    const [target, init] = fetchMock.mock.calls[0]!
    expect(String(target)).toBe('http://qas.test/django/schema-viz/graph/?a=1')
    expect((init?.headers as Headers).get('authorization')).toBe('Bearer token-qas')
  })

  it('refreshes a token with the client of the session source', async () => {
    const store = new MemoryStartAuthTokenStore()
    await store.write(
      record({
        sessionId: 'session-qas',
        sourceId: 'qas',
        accessToken: undefined,
        accessTokenExpiresAt: undefined,
      }),
    )
    let capturedClient: oauth.Client | undefined
    __setStartAuthTestOverrides({
      oauth: {
        authorizationServer: {} as oauth.AuthorizationServer,
        processRefreshTokenResponse: vi.fn(async () => ({
          access_token: 'fresh',
          expires_in: 3600,
          token_type: 'bearer' as const,
        })),
        refreshTokenGrantRequest: vi.fn(async (_as, client) => {
          capturedClient = client
          return new Response('{}')
        }),
      },
      tokenStore: store,
    })

    await expect(getValidAccessToken('session-qas')).resolves.toBe('fresh')
    expect(capturedClient?.client_id).toBe('draw-qas')
  })

  it('signs out of the selected source only', async () => {
    const { store, cookie } = await signedInStore('qas')

    const response = await handleStartAuthRequest(
      new Request('http://app.test/_schema-viz/auth/logout', {
        headers: { cookie: `${cookie}; sv_source=qas` },
      }),
    )

    expect(response?.headers.get('set-cookie')).toContain('sv_session_qas=')
    await expect(store.read('session-qas')).resolves.toBeNull()
  })
})

describe('read-only sources', () => {
  async function prodRequest(path: string, init: RequestInit = {}) {
    const { cookie } = await signedInStore('prod')
    const headers = new Headers(init.headers)
    headers.set('cookie', `${cookie}; sv_source=prod`)
    return proxySchemaVizRequest(
      new Request(`http://app.test/schema-viz${path}`, { ...init, headers }),
    )
  }

  it('lets reads through', async () => {
    const fetchMock = stubUpstream()

    const response = await prodRequest('/drawings/')

    expect(response?.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('lets read-only queries through even though they are POSTs', async () => {
    const fetchMock = stubUpstream()

    const response = await prodRequest('/query/records/', {
      method: 'POST',
      body: '{}',
    })

    expect(response?.status).toBe(200)
    expect(String(fetchMock.mock.calls[0]![0])).toBe(
      'http://prod.test/django/schema-viz/query/records/',
    )
  })

  it.each([
    ['POST', '/drawings/'],
    ['PUT', '/drawings/1/'],
    ['PATCH', '/session/'],
    ['DELETE', '/templates/1/'],
  ])('blocks %s %s before it reaches the backend', async (method, path) => {
    const fetchMock = stubUpstream()

    const response = await prodRequest(path, { method, body: '{}' })

    expect(response?.status).toBe(403)
    expect((await response!.json()).detail).toContain('read-only')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refuses method override headers', async () => {
    const fetchMock = stubUpstream()

    const response = await prodRequest('/drawings/1/', {
      headers: { 'x-http-method-override': 'DELETE' },
    })

    expect(response?.status).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refuses a write hidden behind a read path', async () => {
    const fetchMock = stubUpstream()

    const response = await prodRequest('/query/records/%2e%2e/drawings/', {
      method: 'POST',
      body: '{}',
    })

    expect(response?.status).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('still allows writes on a writable source', async () => {
    const { cookie } = await signedInStore('stagedev')
    const fetchMock = stubUpstream()

    const response = await proxySchemaVizRequest(
      new Request('http://app.test/schema-viz/drawings/', {
        method: 'POST',
        body: '{}',
        headers: { cookie: `${cookie}; sv_source=stagedev` },
      }),
    )

    expect(response?.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledOnce()
  })
})
