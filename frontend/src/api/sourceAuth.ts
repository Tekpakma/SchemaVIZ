type SourceAuthRedirectKind = 'login' | 'logout'

const AUTH_PATHS: Record<SourceAuthRedirectKind, string> = {
  login: '/_schema-viz/auth/login',
  logout: '/_schema-viz/auth/logout',
}

let pendingLoginRedirectUrl: string | null = null

function currentBrowserPath(): string {
  if (typeof window === 'undefined') return '/'
  return `${window.location.pathname}${window.location.search}${window.location.hash}`
}

export function buildSourceAuthRedirectUrl(
  kind: SourceAuthRedirectKind,
  options: { next?: string } = {},
): string {
  const searchParams = new URLSearchParams()
  const next = options.next ?? (kind === 'logout' ? '/' : currentBrowserPath())

  if (next) {
    searchParams.set('next', next)
  }

  const search = searchParams.toString()
  return search ? `${AUTH_PATHS[kind]}?${search}` : AUTH_PATHS[kind]
}

export function redirectToLogin(): void {
  if (typeof window === 'undefined') return

  if (window.location.pathname.startsWith('/_schema-viz/auth/')) return

  const redirectUrl = buildSourceAuthRedirectUrl('login')
  if (pendingLoginRedirectUrl === redirectUrl) return

  pendingLoginRedirectUrl = redirectUrl
  window.location.assign(redirectUrl)
}

export function __resetSourceAuthRedirectStateForTests(): void {
  pendingLoginRedirectUrl = null
}
