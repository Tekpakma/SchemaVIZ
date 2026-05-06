import type { ResolvedTheme } from '@/features/theme/constants'

export const CANVAS_NODE_SURFACE_VARIABLE = '--surface-strong'
export const CANVAS_NODE_SURFACE_CSS_VALUE = `var(${CANVAS_NODE_SURFACE_VARIABLE})`

export const CANVAS_SURFACE_FALLBACKS: Record<ResolvedTheme, string> = {
  dark: 'rgba(15, 27, 31, 0.92)',
  light: 'rgba(255, 255, 255, 0.9)',
}

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
