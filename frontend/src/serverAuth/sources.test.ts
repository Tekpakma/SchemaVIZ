import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  DEFAULT_SOURCE_ID,
  __resetStartAuthSourcesCacheForTests,
  findStartAuthSource,
  getDefaultStartAuthSource,
  getStartAuthSources,
  parseStartAuthSources,
  toPublicSource,
} from './sources'

const KEYS = [
  'SCHEMA_VIZ_SOURCES',
  'SCHEMA_VIZ_DEFAULT_SOURCE',
  'SCHEMA_VIZ_SERVER_BASE_URL',
  'SCHEMA_VIZ_OIDC_ISSUER',
  'SCHEMA_VIZ_OIDC_CLIENT_ID',
  'SCHEMA_VIZ_OIDC_SCOPE',
  'SCHEMA_VIZ_BACKEND_LABEL',
  'SCHEMA_VIZ_OIDC_PROVIDER_LABEL',
] as const

const originalEnv = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]))

function restoreEnv() {
  for (const key of KEYS) {
    const value = originalEnv[key]
    if (typeof value === 'string') process.env[key] = value
    else delete process.env[key]
  }
  __resetStartAuthSourcesCacheForTests()
}

const stagedev = {
  id: 'stagedev',
  label: 'Stage Dev',
  serverBaseUrl: 'https://stagedev.example/django/schema-viz/',
  oidc: {
    issuer: 'https://stagedev.example/django/oauth/',
    clientId: 'draw',
    providerLabel: 'Stage Dev',
  },
}

const prod = {
  id: 'prod',
  label: 'COSMOS',
  description: 'Production data',
  serverBaseUrl: 'https://prod.example/django/schema-viz',
  readOnly: true,
  oidc: { issuer: 'https://prod.example/django/oauth', clientId: 'draw' },
}

beforeEach(restoreEnv)
afterEach(restoreEnv)

describe('parseStartAuthSources', () => {
  it('normalizes URLs, applies defaults and keeps the order', () => {
    const sources = parseStartAuthSources(JSON.stringify([stagedev, prod]))

    expect(sources.map((source) => source.id)).toEqual(['stagedev', 'prod'])
    expect(sources[0]).toMatchObject({
      backendBaseUrl: 'https://stagedev.example/django/schema-viz',
      readOnly: false,
      oidc: {
        issuer: 'https://stagedev.example/django/oauth',
        scope: 'openid profile email',
        providerLabel: 'Stage Dev',
      },
    })
    expect(sources[1]).toMatchObject({ readOnly: true, description: 'Production data' })
  })

  it('rejects input that is not JSON', () => {
    expect(() => parseStartAuthSources('not json')).toThrow('valid JSON')
  })

  it('rejects an empty list', () => {
    expect(() => parseStartAuthSources('[]')).toThrow('SCHEMA_VIZ_SOURCES')
  })

  it('rejects ids that are unsafe for cookie names', () => {
    expect(() =>
      parseStartAuthSources(JSON.stringify([{ ...stagedev, id: 'Stage Dev;' }])),
    ).toThrow('id')
  })

  it('rejects duplicate ids', () => {
    expect(() =>
      parseStartAuthSources(JSON.stringify([stagedev, stagedev])),
    ).toThrow('"stagedev" twice')
  })

  it('requires a base URL', () => {
    const { serverBaseUrl: _omit, ...withoutUrl } = stagedev
    expect(() => parseStartAuthSources(JSON.stringify([withoutUrl]))).toThrow(
      'serverBaseUrl',
    )
  })
})

describe('getStartAuthSources', () => {
  it('falls back to the single backend from the legacy variables', () => {
    process.env.SCHEMA_VIZ_SERVER_BASE_URL = 'https://legacy.example/schema-viz/'
    process.env.SCHEMA_VIZ_OIDC_ISSUER = 'https://legacy.example/oauth/'
    process.env.SCHEMA_VIZ_OIDC_CLIENT_ID = 'legacy'
    process.env.SCHEMA_VIZ_BACKEND_LABEL = 'Legacy'

    const sources = getStartAuthSources()

    expect(sources).toHaveLength(1)
    expect(sources[0]).toMatchObject({
      id: DEFAULT_SOURCE_ID,
      label: 'Legacy',
      backendBaseUrl: 'https://legacy.example/schema-viz',
      readOnly: false,
      oidc: { issuer: 'https://legacy.example/oauth', clientId: 'legacy' },
    })
  })

  it('prefers SCHEMA_VIZ_SOURCES over the legacy variables', () => {
    process.env.SCHEMA_VIZ_SERVER_BASE_URL = 'https://legacy.example/schema-viz'
    process.env.SCHEMA_VIZ_SOURCES = JSON.stringify([stagedev, prod])

    expect(getStartAuthSources().map((source) => source.id)).toEqual([
      'stagedev',
      'prod',
    ])
  })

  it('picks up a changed configuration', () => {
    process.env.SCHEMA_VIZ_SOURCES = JSON.stringify([stagedev])
    expect(getStartAuthSources()).toHaveLength(1)

    process.env.SCHEMA_VIZ_SOURCES = JSON.stringify([stagedev, prod])
    expect(getStartAuthSources()).toHaveLength(2)
  })
})

describe('default and lookup', () => {
  beforeEach(() => {
    process.env.SCHEMA_VIZ_SOURCES = JSON.stringify([stagedev, prod])
  })

  it('uses the first source as the default', () => {
    expect(getDefaultStartAuthSource().id).toBe('stagedev')
  })

  it('honours SCHEMA_VIZ_DEFAULT_SOURCE and ignores unknown values', () => {
    process.env.SCHEMA_VIZ_DEFAULT_SOURCE = 'prod'
    expect(getDefaultStartAuthSource().id).toBe('prod')

    process.env.SCHEMA_VIZ_DEFAULT_SOURCE = 'nope'
    expect(getDefaultStartAuthSource().id).toBe('stagedev')
  })

  it('finds sources by id only', () => {
    expect(findStartAuthSource('prod')?.id).toBe('prod')
    expect(findStartAuthSource('PROD')).toBeNull()
    expect(findStartAuthSource('')).toBeNull()
    expect(findStartAuthSource(undefined)).toBeNull()
  })

  it('never exposes OIDC settings to the browser', () => {
    const publicSource = toPublicSource(findStartAuthSource('prod')!)

    expect(publicSource).toEqual({
      id: 'prod',
      label: 'COSMOS',
      description: 'Production data',
      readOnly: true,
    })
    expect(JSON.stringify(publicSource)).not.toContain('prod.example')
  })
})
