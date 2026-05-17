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

function resolveRequestUrl(url: string) {
  const normalizedPath = url.startsWith('/') ? url : `/${url}`
  return normalizedPath
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
