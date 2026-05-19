import type { StartAuthSession } from '@/api/startAuthSession'

export function canLoadHomeQuickAccess(
  session: StartAuthSession | undefined,
): boolean {
  return Boolean(session && (!session.authRequired || session.user))
}

export function shouldRedirectHomeToLogin(
  session: StartAuthSession | undefined,
): boolean {
  return Boolean(session?.authRequired && !session.user)
}
