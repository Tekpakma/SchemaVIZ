import { parse as parseCookie } from 'cookie-es'

import { redirectToLogin } from './sourceAuth'

async function parseResponseBody(response: Response) {
  if (response.status === 204) return undefined

  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    return response.json()
  }

  const text = await response.text()
  return text.length === 0 ? undefined : text
}

/**
 * Generated operation paths are `/schema-viz/...`. In the browser they hit the
 * Start proxy as-is; server code passes the Django base URL (which already
 * ends in `/schema-viz`) and the prefix is swapped for it.
 */
function resolveRequestUrl(url: string, baseUrl?: string) {
  const normalizedPath = url.startsWith('/') ? url : `/${url}`
  if (!baseUrl) return normalizedPath

  const operationPath = normalizedPath.startsWith('/schema-viz/')
    ? normalizedPath.slice('/schema-viz'.length)
    : normalizedPath
  return `${baseUrl.replace(/\/+$/, '')}${operationPath}`
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

export type SchemaVizFetchOptions = RequestInit & {
  /** Absolute Django base URL for server-side calls that bypass the proxy. */
  baseUrl?: string
}

export async function schemaVizFetch<T>(
  url: string,
  { baseUrl, ...options }: SchemaVizFetchOptions = {},
): Promise<T> {
  const fullUrl = resolveRequestUrl(url, baseUrl)
  const response = await fetch(fullUrl, {
    ...options,
    credentials: options.credentials ?? 'include',
    headers: createRequestHeaders(options),
  })

  if (response.status === 401 && typeof window !== 'undefined') {
    redirectToLogin()
  }

  const body = await parseResponseBody(response)

  return {
    data: body,
    status: response.status,
    headers: response.headers,
  } as T
}
