import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  __resetSourceAuthRedirectStateForTests,
  buildSourceAuthRedirectUrl,
  redirectToLogin,
} from './sourceAuth'

afterEach(() => {
  __resetSourceAuthRedirectStateForTests()
  vi.unstubAllGlobals()
})

describe('source auth redirects', () => {
  it('builds login redirects from the current browser path', () => {
    vi.stubGlobal('window', {
      location: {
        hash: '#section',
        pathname: '/builder',
        search: '?template=1',
      },
    })

    expect(buildSourceAuthRedirectUrl('login')).toBe(
      '/_schema-viz/auth/login?next=%2Fbuilder%3Ftemplate%3D1%23section',
    )
  })

  it('defaults logout redirects to the app root', () => {
    expect(buildSourceAuthRedirectUrl('logout')).toBe(
      '/_schema-viz/auth/logout?next=%2F',
    )
  })

  it('uses document navigation for login because auth is a server redirect endpoint', () => {
    const assign = vi.fn()
    vi.stubGlobal('window', {
      location: {
        assign,
        hash: '',
        pathname: '/canvas',
        search: '',
      },
    })

    redirectToLogin()

    expect(assign).toHaveBeenCalledWith(
      '/_schema-viz/auth/login?next=%2Fcanvas',
    )
  })

  it('deduplicates repeated login redirects from concurrent 401 responses', () => {
    const assign = vi.fn()
    vi.stubGlobal('window', {
      location: {
        assign,
        hash: '',
        pathname: '/',
        search: '',
      },
    })

    redirectToLogin()
    redirectToLogin()

    expect(assign).toHaveBeenCalledTimes(1)
    expect(assign).toHaveBeenCalledWith('/_schema-viz/auth/login?next=%2F')
  })

  it('does not redirect again while already on a source auth route', () => {
    const assign = vi.fn()
    vi.stubGlobal('window', {
      location: {
        assign,
        hash: '',
        pathname: '/_schema-viz/auth/callback',
        search: '?code=test',
      },
    })

    redirectToLogin()

    expect(assign).not.toHaveBeenCalled()
  })
})
