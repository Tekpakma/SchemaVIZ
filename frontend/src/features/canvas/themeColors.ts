import type { ResolvedTheme } from '@/features/theme/constants'

export const CANVAS_NODE_SURFACE_VARIABLE = '--canvas-node-surface'
export const CANVAS_NODE_SURFACE_CSS_VALUE = `var(${CANVAS_NODE_SURFACE_VARIABLE})`

export const CANVAS_BACKGROUND_FALLBACKS: Record<ResolvedTheme, string> = {
  dark: '#09090b',
  light: '#ffffff',
}

export const CANVAS_SURFACE_FALLBACKS: Record<ResolvedTheme, string> = {
  dark: 'rgba(24, 24, 27, 0.92)',
  light: 'rgba(255, 255, 255, 0.9)',
}

export const CANVAS_NODE_BORDER_FALLBACKS: Record<ResolvedTheme, string> = {
  dark: 'rgba(244, 244, 245, 0.16)',
  light: 'rgba(24, 24, 27, 0.22)',
}

// --- Selection / Interactive ---
export const CANVAS_SELECTION_VARIABLE = '--canvas-selection'
export const CANVAS_SELECT_COLOR = '#3b82f6'
export const CANVAS_SELECT_FILL = 'rgba(59, 130, 246, 0.04)'
export const CANVAS_MARQUEE_FILL = 'rgba(59, 130, 246, 0.10)'
export const CANVAS_HELPER_LINE_COLOR = '#3b82f6'

// --- Edge colors (resolved via CSS variable at runtime) ---
export const CANVAS_EDGE_COLOR_VARIABLE = '--canvas-edge'
export const CANVAS_EDGE_COLOR_FALLBACK: Record<ResolvedTheme, string> = {
  dark: '#8de5db',
  light: '#328f97',
}

// --- Edge label text ---
export const CANVAS_EDGE_LABEL_TEXT_VARIABLE = '--foreground'
export const CANVAS_EDGE_LABEL_TEXT_FALLBACK: Record<ResolvedTheme, string> = {
  dark: '#e2e8f0',
  light: '#1e293b',
}

// --- Schema node inline HTML colors ---
// Light colors are baked into node.html at graph-build time.
// Dark equivalents are swapped in at render time by renderTagCache.
export const SCHEMA_NODE_TITLE_COLOR: Record<ResolvedTheme, string> = {
  light: '#173a40',
  dark: '#e2e8f0',
}
export const SCHEMA_NODE_SUBTITLE_COLOR: Record<ResolvedTheme, string> = {
  light: '#328f97',
  dark: '#8de5db',
}
export const SCHEMA_NODE_FIELD_COLOR: Record<ResolvedTheme, string> = {
  light: '#416166',
  dark: '#94a3b8',
}

/** Maps light-mode color → dark-mode color for render-tag HTML color swapping. */
export const SCHEMA_NODE_COLOR_SWAP: ReadonlyMap<string, string> = new Map([
  [SCHEMA_NODE_TITLE_COLOR.light, SCHEMA_NODE_TITLE_COLOR.dark],
  [SCHEMA_NODE_SUBTITLE_COLOR.light, SCHEMA_NODE_SUBTITLE_COLOR.dark],
  [SCHEMA_NODE_FIELD_COLOR.light, SCHEMA_NODE_FIELD_COLOR.dark],
  ['rgb(0, 0, 0)', 'rgb(226, 232, 240)'],
])

type ResolveCanvasThemeColorParams = {
  fallback: string
  variableName: string
  root?: Element | null
}
export function resolveCanvasThemeColor({
  fallback,
  root,
  variableName,
}: ResolveCanvasThemeColorParams) {
  if (typeof getComputedStyle === 'undefined') return fallback

  const targetRoot =
    root ?? (typeof document === 'undefined' ? null : document.documentElement)

  if (!targetRoot) return fallback

  return (
    getComputedStyle(targetRoot).getPropertyValue(variableName).trim() ||
    fallback
  )
}
