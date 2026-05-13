import { describe, expect, it, vi } from 'vitest'

import {
  CANVAS_EDGE_COLOR_VARIABLE,
  CANVAS_NODE_SURFACE_CSS_VALUE,
  CANVAS_NODE_SURFACE_VARIABLE,
  CANVAS_SELECTION_VARIABLE,
  CANVAS_SURFACE_FALLBACKS,
  SCHEMA_NODE_COLOR_SWAP,
  SCHEMA_NODE_FIELD_COLOR,
  SCHEMA_NODE_SUBTITLE_COLOR,
  SCHEMA_NODE_TITLE_COLOR,
  resolveCanvasThemeColor,
} from './themeColors'

describe('resolveCanvasThemeColor', () => {
  it('keeps the DOM overlay and canvas surface wired to the same CSS token', () => {
    expect(CANVAS_NODE_SURFACE_VARIABLE).toBe('--canvas-node-surface')
    expect(CANVAS_NODE_SURFACE_CSS_VALUE).toBe('var(--canvas-node-surface)')
  })

  it('uses unified canvas theme tokens for domain colors', () => {
    expect(CANVAS_EDGE_COLOR_VARIABLE).toBe('--canvas-edge')
    expect(CANVAS_SELECTION_VARIABLE).toBe('--canvas-selection')
  })

  it('uses the exact computed CSS variable value for canvas fills', () => {
    const root = {} as Element
    const surface = 'rgba(16, 30, 34, 0.8)'

    vi.stubGlobal('getComputedStyle', () => ({
      getPropertyValue: (name: string) =>
        name === '--canvas-node-surface' ? ` ${surface} ` : '',
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

  it('maps schema node inline light colors to dark render colors', () => {
    expect(SCHEMA_NODE_COLOR_SWAP.get(SCHEMA_NODE_TITLE_COLOR.light)).toBe(
      SCHEMA_NODE_TITLE_COLOR.dark,
    )
    expect(SCHEMA_NODE_COLOR_SWAP.get(SCHEMA_NODE_SUBTITLE_COLOR.light)).toBe(
      SCHEMA_NODE_SUBTITLE_COLOR.dark,
    )
    expect(SCHEMA_NODE_COLOR_SWAP.get(SCHEMA_NODE_FIELD_COLOR.light)).toBe(
      SCHEMA_NODE_FIELD_COLOR.dark,
    )
  })
})
