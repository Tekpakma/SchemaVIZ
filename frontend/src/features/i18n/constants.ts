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

export function resolveAcceptLanguage(headerValue: string | null | undefined): Locale {
  if (!headerValue) return DEFAULT_LOCALE

  const candidates: Array<{ locale: string; quality: number }> = []

  for (const rawPart of headerValue.split(',')) {
    const part = rawPart.trim()
    if (!part) continue

    const [locale = '', ...rest] = part.split(';')
    let quality = 1

    for (const restPart of rest) {
      const parameter = restPart.trim()
      if (!parameter.startsWith('q=')) continue

      const parsedQuality = Number(parameter.slice(2))
      quality = Number.isFinite(parsedQuality) ? parsedQuality : 0
    }

    candidates.push({ locale, quality })
  }

  for (const candidate of candidates.sort((a, b) => b.quality - a.quality)) {
    const locale = parseLocale(candidate.locale)
    if (locale) return locale
  }

  return DEFAULT_LOCALE
}

export function resolveLocalePreference({
  acceptLanguage,
  cookieLocale,
}: {
  acceptLanguage?: string | null
  cookieLocale?: string | null
}): Locale {
  return parseLocale(cookieLocale) ?? resolveAcceptLanguage(acceptLanguage)
}
