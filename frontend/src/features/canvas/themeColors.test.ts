import { describe, expect, it, vi } from 'vitest'

import {
  CANVAS_NODE_SURFACE_CSS_VALUE,
  CANVAS_NODE_SURFACE_VARIABLE,
  CANVAS_SURFACE_FALLBACKS,
  resolveCanvasThemeColor,
} from './themeColors'

describe('resolveCanvasThemeColor', () => {
  it('keeps the DOM overlay and canvas surface wired to the same CSS token', () => {
    expect(CANVAS_NODE_SURFACE_VARIABLE).toBe('--surface-strong')
    expect(CANVAS_NODE_SURFACE_CSS_VALUE).toBe('var(--surface-strong)')
  })

  it('uses the exact computed CSS variable value for canvas fills', () => {
    const root = {} as Element
    const surface = 'rgba(16, 30, 34, 0.8)'

    vi.stubGlobal('getComputedStyle', () => ({
      getPropertyValue: (name: string) =>
        name === '--surface-strong' ? ` ${surface} ` : '',
    }))

    expect(
      resolveCanvasThemeColor({
        fallback: CANVAS_SURFACE_FALLBACKS.dark,
        root,
        variableName: CANVAS_NODE_SURFACE_VARIABLE,
      }),
    ).toBe(surface)

    vi.unstubAllGlobals()
  })

  it('falls back to the per-theme surface when the CSS variable is missing', () => {
    const root = {} as Element

    vi.stubGlobal('getComputedStyle', () => ({
      getPropertyValue: () => '',
    }))

    expect(
      resolveCanvasThemeColor({
        fallback: CANVAS_SURFACE_FALLBACKS.light,
        root,
        variableName: CANVAS_NODE_SURFACE_VARIABLE,
      }),
    ).toBe(CANVAS_SURFACE_FALLBACKS.light)

    vi.unstubAllGlobals()
  })
})
