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

export function isFramedContext(): boolean {
  if (typeof window === 'undefined') return false

  // `window.top` throws on cross-origin access in some browsers, and the
  // comparison itself is enough to detect framing.
  try {
    return window.self !== window.top
  } catch {
    return true
  }
}

// Router-free variant for the fetch interceptor, which runs outside React.
// Components read `embed` from the route's validated search instead.
export function isEmbeddedContext(): boolean {
  if (typeof window === 'undefined') return false
  if (isFramedContext()) return true

  const search = window.location?.search ?? ''
  return new URLSearchParams(search).get('embed') === '1'
}

export function redirectToLogin(): void {
  if (typeof window === 'undefined') return

  // A top-level login redirect inside an iframe either blanks the frame or is
  // blocked by the identity provider's frame-ancestors policy. Embedded views
  // surface an explicit "open in a new tab" prompt instead.
  if (isEmbeddedContext()) return

  if (window.location.pathname.startsWith('/_schema-viz/auth/')) return

  const redirectUrl = buildSourceAuthRedirectUrl('login')
  if (pendingLoginRedirectUrl === redirectUrl) return

  pendingLoginRedirectUrl = redirectUrl
  window.location.assign(redirectUrl)
}

export function __resetSourceAuthRedirectStateForTests(): void {
  pendingLoginRedirectUrl = null
}
