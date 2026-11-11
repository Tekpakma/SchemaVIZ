import * as z from 'zod'

export { isReadOnlyRequestAllowed } from '@/api/readOnly'

export type StartAuthOidc = {
  issuer: string
  clientId: string
  clientSecret?: string
  scope: string
  providerLabel?: string
}

export type StartAuthBackend = {
  label: string
  description?: string
  backendBaseUrl: string
  basePath?: string
  oidc?: StartAuthOidc
}

/** A backend the user may pick, plus the identity used for cookies and UI. */
export type StartAuthSource = StartAuthBackend & {
  id: string
  /** Blocks every request that could change data on this backend. */
  readOnly: boolean
}

export type PublicStartAuthSource = {
  id: string
  label: string
  description?: string
  readOnly: boolean
}

export const DEFAULT_SOURCE_ID = 'default'
export const SOURCE_COOKIE = 'sv_source'

const DEFAULT_SCOPE = 'openid profile email'
const SOURCE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/

const sourceConfigSchema = z.object({
  id: z.string().regex(SOURCE_ID_PATTERN, {
    message: 'must be 1-32 characters of a-z, 0-9 and "-"',
  }),
  label: z.string().trim().min(1),
  description: z.string().trim().optional(),
  serverBaseUrl: z.string().trim().min(1),
  basePath: z.string().trim().optional(),
  readOnly: z.boolean().default(false),
  oidc: z
    .object({
      issuer: z.string().trim().min(1),
      clientId: z.string().trim().min(1),
      clientSecret: z.string().trim().optional(),
      scope: z.string().trim().optional(),
      providerLabel: z.string().trim().optional(),
    })
    .optional(),
})

const sourceListSchema = z.array(sourceConfigSchema).min(1)

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/g, '')
}

function normalizeBackendBaseUrl(value?: string): string {
  const configured = value?.trim()
  if (configured) return trimTrailingSlashes(configured)
  return 'http://localhost:8000/schema-viz'
}

function legacySource(): StartAuthSource {
  const issuer = process.env.SCHEMA_VIZ_OIDC_ISSUER?.trim()
  const clientId = process.env.SCHEMA_VIZ_OIDC_CLIENT_ID?.trim()
  return {
    id: DEFAULT_SOURCE_ID,
    label: process.env.SCHEMA_VIZ_BACKEND_LABEL?.trim() || 'Schema Viz',
    description: process.env.SCHEMA_VIZ_BACKEND_DESCRIPTION?.trim() || undefined,
    backendBaseUrl: normalizeBackendBaseUrl(
      process.env.SCHEMA_VIZ_SERVER_BASE_URL,
    ),
    basePath: process.env.SCHEMA_VIZ_BASE_PATH?.trim() || undefined,
    readOnly: false,
    oidc:
      issuer && clientId
        ? {
            issuer: trimTrailingSlashes(issuer),
            clientId,
            clientSecret:
              process.env.SCHEMA_VIZ_OIDC_CLIENT_SECRET?.trim() || undefined,
            scope: process.env.SCHEMA_VIZ_OIDC_SCOPE?.trim() || DEFAULT_SCOPE,
            providerLabel:
              process.env.SCHEMA_VIZ_OIDC_PROVIDER_LABEL?.trim() || undefined,
          }
        : undefined,
  }
}

export function parseStartAuthSources(raw: string): Array<StartAuthSource> {
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    throw new Error('SCHEMA_VIZ_SOURCES must be valid JSON.')
  }

  const parsed = sourceListSchema.safeParse(json)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const location = issue?.path.join('.') || 'value'
    throw new Error(
      `SCHEMA_VIZ_SOURCES is invalid at ${location}: ${issue?.message ?? 'unknown error'}`,
    )
  }

  const seen = new Set<string>()
  return parsed.data.map((entry) => {
    if (seen.has(entry.id)) {
      throw new Error(`SCHEMA_VIZ_SOURCES contains the id "${entry.id}" twice.`)
    }
    seen.add(entry.id)

    return {
      id: entry.id,
      label: entry.label,
      description: entry.description || undefined,
      backendBaseUrl: normalizeBackendBaseUrl(entry.serverBaseUrl),
      basePath: entry.basePath || undefined,
      readOnly: entry.readOnly,
      oidc: entry.oidc
        ? {
            issuer: trimTrailingSlashes(entry.oidc.issuer),
            clientId: entry.oidc.clientId,
            clientSecret: entry.oidc.clientSecret || undefined,
            scope: entry.oidc.scope || DEFAULT_SCOPE,
            providerLabel: entry.oidc.providerLabel || undefined,
          }
        : undefined,
    }
  })
}

let cache: { raw: string; sources: Array<StartAuthSource> } | null = null

/**
 * The backends this deployment may talk to. `SCHEMA_VIZ_SOURCES` holds a JSON
 * list; without it the single backend from the `SCHEMA_VIZ_SERVER_BASE_URL` /
 * `SCHEMA_VIZ_OIDC_*` variables is used, so existing deployments keep working.
 */
export function getStartAuthSources(): Array<StartAuthSource> {
  const raw = process.env.SCHEMA_VIZ_SOURCES?.trim()
  if (!raw) return [legacySource()]

  if (cache?.raw === raw) return cache.sources

  const sources = parseStartAuthSources(raw)
  cache = { raw, sources }
  return sources
}

export function getDefaultStartAuthSource(): StartAuthSource {
  const sources = getStartAuthSources()
  const preferred = process.env.SCHEMA_VIZ_DEFAULT_SOURCE?.trim()
  const first = sources[0]
  if (!first) throw new Error('No SchemaViz source is configured.')
  return (preferred && sources.find((source) => source.id === preferred)) || first
}

export function findStartAuthSource(
  id: string | null | undefined,
): StartAuthSource | null {
  if (!id) return null
  return getStartAuthSources().find((source) => source.id === id) ?? null
}

export function toPublicSource(source: StartAuthSource): PublicStartAuthSource {
  return {
    id: source.id,
    label: source.label,
    description: source.description,
    readOnly: source.readOnly,
  }
}

export function __resetStartAuthSourcesCacheForTests(): void {
  cache = null
}
