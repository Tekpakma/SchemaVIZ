export const DEFAULT_LOCALE = 'en'
export const SUPPORTED_LOCALES = ['en', 'de'] as const
export const LOCALE_COOKIE_NAME = 'schema-viz-locale'
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365
export const LOCALE_HEADER = 'X-SchemaViz-Locale'

export type Locale = (typeof SUPPORTED_LOCALES)[number]

export function isLocale(value: unknown): value is Locale {
  return SUPPORTED_LOCALES.includes(value as Locale)
}

export function parseLocale(value: unknown): Locale | null {
  if (typeof value !== 'string') return null

  const normalized = value.trim().toLowerCase()
  if (!normalized) return null

  const baseLocale = normalized.split('-', 1)[0]
  return isLocale(baseLocale) ? baseLocale : null
}

export function normalizeLocale(value: unknown): Locale {
  return parseLocale(value) ?? DEFAULT_LOCALE
}

export function resolveLocalePreference({
  cookieLocale,
}: {
  cookieLocale?: string | null
}): Locale {
  return parseLocale(cookieLocale) ?? DEFAULT_LOCALE
}
