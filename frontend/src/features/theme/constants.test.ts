import { describe, expect, it } from 'vitest'

import { DEFAULT_THEME_MODE, parseThemeMode, resolveThemeMode } from './constants'

describe('theme constants', () => {
  it('defaults invalid theme preferences to system', () => {
    expect(parseThemeMode('not-a-theme')).toBe(DEFAULT_THEME_MODE)
    expect(parseThemeMode(null)).toBe(DEFAULT_THEME_MODE)
  })

  it('resolves explicit themes without checking system preference', () => {
    expect(resolveThemeMode('light', true)).toBe('light')
    expect(resolveThemeMode('dark', false)).toBe('dark')
  })

  it('resolves system theme from the current system preference', () => {
    expect(resolveThemeMode('system', true)).toBe('dark')
    expect(resolveThemeMode('system', false)).toBe('light')
  })
})
