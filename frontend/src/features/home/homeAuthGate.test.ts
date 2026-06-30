import { describe, expect, it } from 'vitest'

import type { StartAuthSession } from '@/api/startAuthSession'
import {
  canLoadHomeQuickAccess,
  shouldRedirectHomeToLogin,
} from './homeAuthGate'

function createSession(
  overrides: Partial<StartAuthSession> = {},
): StartAuthSession {
  return {
    mode: 'oidc',
    authRequired: true,
    user: null,
    auth: {
      providerLabel: 'Local Django OAuth',
      loginUrl: '/_schema-viz/auth/login',
      logoutUrl: '/_schema-viz/auth/logout',
    },
    ...overrides,
  }
}

describe('home auth gate', () => {
  it('holds home quick-access requests until an authenticated session exists', () => {
    expect(canLoadHomeQuickAccess(undefined)).toBe(false)
    expect(canLoadHomeQuickAccess(createSession())).toBe(false)
    expect(shouldRedirectHomeToLogin(createSession())).toBe(true)
  })

  it('allows quick-access requests for dev/session mode or authenticated OIDC users', () => {
    expect(
      canLoadHomeQuickAccess(
        createSession({ mode: 'dev', authRequired: false }),
      ),
    ).toBe(true)
    expect(
      canLoadHomeQuickAccess(
        createSession({ mode: 'session', authRequired: false }),
      ),
    ).toBe(true)
    expect(
      canLoadHomeQuickAccess(
        createSession({ user: { sub: '1', name: 'kai' } }),
      ),
    ).toBe(true)
    expect(
      shouldRedirectHomeToLogin(
        createSession({ user: { sub: '1', name: 'kai' } }),
      ),
    ).toBe(false)
  })
})
