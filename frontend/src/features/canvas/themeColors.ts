import type { ResolvedTheme } from '@/features/theme/constants'

export const CANVAS_NODE_SURFACE_VARIABLE = '--surface-strong'
export const CANVAS_NODE_SURFACE_CSS_VALUE = `var(${CANVAS_NODE_SURFACE_VARIABLE})`

export const CANVAS_SURFACE_FALLBACKS: Record<ResolvedTheme, string> = {
  dark: 'rgba(15, 27, 31, 0.92)',
  light: 'rgba(255, 255, 255, 0.9)',
}

// --- Selection / Interactive ---
export const CANVAS_SELECT_COLOR = '#3b82f6'
export const CANVAS_SELECT_FILL = 'rgba(59, 130, 246, 0.04)'
export const CANVAS_MARQUEE_FILL = 'rgba(59, 130, 246, 0.10)'
export const CANVAS_HELPER_LINE_COLOR = '#2563eb'

// --- Edge colors (resolved via CSS variable at runtime) ---
export const CANVAS_EDGE_COLOR_VARIABLE = '--lagoon-deep'
export const CANVAS_EDGE_COLOR_FALLBACK: Record<ResolvedTheme, string> = {
  dark: '#8de5db',
  light: '#328f97',
}

// --- Schema node inline HTML colors (light-mode only for now) ---
export const SCHEMA_NODE_TITLE_COLOR = '#173a40'
export const SCHEMA_NODE_SUBTITLE_COLOR = '#328f97'
export const SCHEMA_NODE_FIELD_COLOR = '#416166'

export function resolveCanvasThemeColor({
  fallback,
  root = typeof document === 'undefined' ? null : document.documentElement,
  variableName,
}: {
  fallback: string
  root?: Element | null
  variableName: string
}) {
  if (!root || typeof getComputedStyle === 'undefined') return fallback

  return (
    getComputedStyle(root).getPropertyValue(variableName).trim() || fallback
  )
}

