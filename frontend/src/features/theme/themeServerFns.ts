import { createServerFn } from '@tanstack/react-start'
import {
  deleteCookie,
  getCookie,
  setCookie,
  setResponseHeaders,
} from '@tanstack/react-start/server'

import {
  DEFAULT_THEME_MODE,
  THEME_COOKIE_MAX_AGE,
  THEME_COOKIE_NAME,
  parseThemeMode,
} from './constants'
import type { ThemeMode } from './constants'

export const getThemePreference = createServerFn({ method: 'GET' }).handler(
  async () => {
    setResponseHeaders(
      new Headers({
        'cache-control': 'private, no-store',
        vary: 'Cookie',
      }),
    )
    return parseThemeMode(getCookie(THEME_COOKIE_NAME) ?? DEFAULT_THEME_MODE)
  },
)

export const setThemePreference = createServerFn({ method: 'POST' })
  .validator((data: ThemeMode) => parseThemeMode(data))
  .handler(async ({ data }) => {
    if (data === DEFAULT_THEME_MODE) {
      deleteCookie(THEME_COOKIE_NAME, {
        path: '/',
      })

      return data
    }

    setCookie(THEME_COOKIE_NAME, data, {
      httpOnly: true,
      maxAge: THEME_COOKIE_MAX_AGE,
      path: '/',
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    })

    return data
  })
