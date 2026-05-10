import { useServerFn } from '@tanstack/react-start'
import { createInstance } from 'i18next'
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import type { ReactNode } from 'react'

import { DEFAULT_LOCALE, normalizeLocale } from './constants'
import type { Locale } from './constants'
import { setLocalePreference } from './localeServerFns'
import { resources } from './resources'

type LocaleContextValue = {
  locale: Locale
  setLocale: (locale: Locale) => void
}

const LocaleContext = createContext<LocaleContextValue | null>(null)

function applyDocumentLocale(locale: Locale) {
  if (typeof document === 'undefined') return
  document.documentElement.lang = locale
}

function createI18nInstance(locale: Locale) {
  const instance = createInstance()

  void instance.use(initReactI18next).init({
    fallbackLng: DEFAULT_LOCALE,
    initAsync: false,
    interpolation: {
      escapeValue: false,
    },
    lng: locale,
    resources,
    supportedLngs: Object.keys(resources),
  })

  return instance
}

export function I18nProvider({
  children,
  initialLocale = DEFAULT_LOCALE,
}: {
  children: ReactNode
  initialLocale?: Locale
}) {
  const persistLocale = useServerFn(setLocalePreference)
  const [locale, setLocaleState] = useState(() => normalizeLocale(initialLocale))
  const [i18nInstance] = useState(() => createI18nInstance(locale))

  const setLocale = useCallback(
    (nextLocale: Locale) => {
      const parsedLocale = normalizeLocale(nextLocale)

      setLocaleState(parsedLocale)
      applyDocumentLocale(parsedLocale)
      void i18nInstance.changeLanguage(parsedLocale)

      persistLocale({ data: parsedLocale }).catch((error) => {
        console.error('Failed to persist locale preference', error)
      })
    },
    [i18nInstance, persistLocale],
  )

  const value = useMemo(
    () => ({
      locale,
      setLocale,
    }),
    [locale, setLocale],
  )

  return (
    <LocaleContext.Provider value={value}>
      <I18nextProvider i18n={i18nInstance}>{children}</I18nextProvider>
    </LocaleContext.Provider>
  )
}

export function useLocale() {
  const context = useContext(LocaleContext)
  if (!context) {
    throw new Error('useLocale must be used inside I18nProvider')
  }

  return context
}

export const useI18n = useLocale
