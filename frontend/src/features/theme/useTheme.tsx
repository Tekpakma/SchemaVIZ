import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { useServerFn } from '@tanstack/react-start'
import type { ReactNode } from 'react'

import {
  DEFAULT_THEME_MODE,
  parseThemeMode,
  resolveThemeMode,
} from './constants'
import type { ResolvedTheme, ThemeMode } from './constants'
import { setThemePreference } from './themeServerFns'

type ThemeContextValue = {
  resolvedTheme: ResolvedTheme
  setTheme: (theme: ThemeMode) => void
  theme: ThemeMode
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

function applyResolvedTheme(resolvedTheme: ResolvedTheme) {
  if (typeof document === 'undefined') return

  document.documentElement.classList.toggle('dark', resolvedTheme === 'dark')
  document.documentElement.style.colorScheme = resolvedTheme
}

function getInitialResolvedTheme(initialTheme: ThemeMode): ResolvedTheme {
  return resolveThemeMode(initialTheme, getSystemTheme() === 'dark')
}

export function ThemeProvider({
  children,
  initialTheme = DEFAULT_THEME_MODE,
}: {
  children: ReactNode
  initialTheme?: ThemeMode
}) {
  const persistTheme = useServerFn(setThemePreference)
  const [theme, setThemeState] = useState(() => parseThemeMode(initialTheme))
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() =>
    getInitialResolvedTheme(parseThemeMode(initialTheme)),
  )

  useEffect(() => {
    const updateResolvedTheme = () => {
      const nextResolvedTheme = resolveThemeMode(theme, getSystemTheme() === 'dark')
      setResolvedTheme(nextResolvedTheme)
      applyResolvedTheme(nextResolvedTheme)
    }

    updateResolvedTheme()

    if (theme !== 'system') return

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    mediaQuery.addEventListener('change', updateResolvedTheme)

    return () => {
      mediaQuery.removeEventListener('change', updateResolvedTheme)
    }
  }, [theme])

  const setTheme = useCallback(
    (nextTheme: ThemeMode) => {
      const parsedTheme = parseThemeMode(nextTheme)
      const nextResolvedTheme = resolveThemeMode(
        parsedTheme,
        getSystemTheme() === 'dark',
      )

      setThemeState(parsedTheme)
      setResolvedTheme(nextResolvedTheme)
      applyResolvedTheme(nextResolvedTheme)

      persistTheme({ data: parsedTheme }).catch((error) => {
        console.error('Failed to persist theme preference', error)
      })
    },
    [persistTheme],
  )

  const value = useMemo(
    () => ({
      resolvedTheme,
      setTheme,
      theme,
    }),
    [resolvedTheme, setTheme, theme],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = use(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used inside ThemeProvider')
  }

  return context
}
