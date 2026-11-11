const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS', 'TRACE'])

/**
 * POST endpoints that only read data. Everything else that is not a safe HTTP
 * method is blocked on read-only sources, including saving drawings,
 * templates and user preferences.
 */
const READ_ONLY_POST_PATHS = [
  /^\/query\/(metadata|neighborhood|record|records)$/,
  /^\/export$/,
  /^\/route\/probe$/,
  /^\/template-compatibility$/,
  /^\/template-uniqueness$/,
  /^\/generation-runs$/,
  /^\/generation-runs\/validate$/,
]

function normalizeOperationPath(path: string): string | null {
  const withoutQuery = (path.split(/[?#]/, 1)[0] ?? '')

  let decoded: string
  try {
    decoded = decodeURIComponent(withoutQuery)
  } catch {
    return null
  }

  if (decoded.split('/').includes('..') || decoded.includes('//')) return null

  const normalized = decoded.replace(/\/+$/g, '')
  return normalized.startsWith('/') ? normalized : `/${normalized}`
}

/**
 * Decides whether a request to a read-only source may be forwarded.
 * `operationPath` is relative to the backend base URL, e.g. `/query/records/`.
 */
export function isReadOnlyRequestAllowed(
  method: string | undefined,
  operationPath: string,
): boolean {
  const upperMethod = (method ?? 'GET').toUpperCase()
  if (SAFE_METHODS.has(upperMethod)) return true
  if (upperMethod !== 'POST') return false

  const normalized = normalizeOperationPath(operationPath)
  if (!normalized) return false

  return READ_ONLY_POST_PATHS.some((pattern) => pattern.test(normalized))
}
