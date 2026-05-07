export const THEME_COOKIE_NAME = 'schema-viz-theme'
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365
export const DEFAULT_THEME_MODE = 'system'

export const THEME_MODES = ['light', 'dark', 'system'] as const

export type ThemeMode = (typeof THEME_MODES)[number]
export type ResolvedTheme = 'light' | 'dark'

export function parseThemeMode(value: unknown): ThemeMode {
  return THEME_MODES.includes(value as ThemeMode)
    ? (value as ThemeMode)
    : DEFAULT_THEME_MODE
}

export function resolveThemeMode(
  theme: ThemeMode,
  prefersDark: boolean,
): ResolvedTheme {
  if (theme === 'system') return prefersDark ? 'dark' : 'light'
  return theme
}
