import { parse as parseCookie } from 'cookie-es'
import { getAppEnv } from '../utils/env'

export class SchemaVizApiError extends Error {
  status: number
  statusText: string
  body: unknown
  url: string

  constructor({
    body,
    status,
    statusText,
    url,
  }: {
    body: unknown
    status: number
    statusText: string
    url: string
  }) {
    super(`SchemaViz API request failed: ${status} ${statusText}`.trim())
    this.name = 'SchemaVizApiError'
    this.status = status
    this.statusText = statusText
    this.body = body
    this.url = url
  }
}

async function parseResponseBody(response: Response) {
  if (response.status === 204) return undefined

  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    return response.json()
  }

  const text = await response.text()
  return text.length === 0 ? undefined : text
}

function getResolvedBaseUrl() {
  return getAppEnv().VITE_SCHEMA_VIZ_BACKEND_BASE_URL.replace(/\/+$/, '')
}

function resolveRequestUrl(url: string) {
  const normalizedPath = url.replace(/^\/+/, '')

  return new URL(`${getResolvedBaseUrl()}/${normalizedPath}`).toString()
}

function isUnsafeMethod(method: string | undefined) {
  return !['GET', 'HEAD', 'OPTIONS', 'TRACE'].includes(
    (method ?? 'GET').toUpperCase(),
  )
}

function getBrowserCsrfToken() {
  if (typeof document === 'undefined') return undefined

  return parseCookie(document.cookie).csrftoken
}

function createRequestHeaders(options: RequestInit) {
  const headers = new Headers(options.headers)

  if (isUnsafeMethod(options.method) && !headers.has('X-CSRFToken')) {
    const csrfToken = getBrowserCsrfToken()
    if (csrfToken) headers.set('X-CSRFToken', csrfToken)
  }

  return headers
}

export async function schemaVizFetch<T>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  const fullUrl = resolveRequestUrl(url)
  const response = await fetch(fullUrl, {
    ...options,
    credentials: options.credentials ?? 'include',
    headers: createRequestHeaders(options),
  })
  const body = await parseResponseBody(response)

  return {
    data: body,
    status: response.status,
    headers: response.headers,
  } as T
}
