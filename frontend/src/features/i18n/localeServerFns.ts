import { createServerFn } from '@tanstack/react-start'
import {
  getCookie,
  getRequestHeader,
  setCookie,
  setResponseHeaders,
} from '@tanstack/react-start/server'

import {
  LOCALE_COOKIE_MAX_AGE,
  LOCALE_COOKIE_NAME,
  parseLocale,
  resolveLocalePreference,
} from './constants'
import type { Locale } from './constants'

export const getLocalePreference = createServerFn({ method: 'GET' }).handler(
  async () => {
    setResponseHeaders(
      new Headers({
        'cache-control': 'private, no-store',
        vary: 'Cookie, Accept-Language',
      }),
    )

    return resolveLocalePreference({
      acceptLanguage: getRequestHeader('accept-language'),
      cookieLocale: getCookie(LOCALE_COOKIE_NAME),
    })
  },
)

export const setLocalePreference = createServerFn({ method: 'POST' })
  .inputValidator((data: Locale) => parseLocale(data) ?? 'en')
  .handler(async ({ data }) => {
    setCookie(LOCALE_COOKIE_NAME, data, {
      httpOnly: true,
      maxAge: LOCALE_COOKIE_MAX_AGE,
      path: '/',
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    })

    return data
  })
