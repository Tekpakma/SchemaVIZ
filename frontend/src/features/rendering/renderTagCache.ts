import { LRUCache } from 'lru-cache'
import { layout } from 'render-tag'
import type { CanvasNode } from '@/features/canvas/model/types'
import type { ResolvedTheme } from '@/features/theme/constants'
import { renderTagAccuracy } from '@/features/lexical/exportRenderTagHtml'
import { SCHEMA_NODE_COLOR_SWAP } from '@/features/canvas/themeColors'

type LayoutResult = ReturnType<typeof layout>

const cache = new LRUCache<string, LayoutResult>({
  max: 1000,
})

function getCacheKey(
  node: CanvasNode,
  showResolved: boolean,
  theme: ResolvedTheme,
): string {
  return `${node.id}:${node.version}:${node.width}:${showResolved ? 'r' : 't'}:${theme}`
}

function unresolveDataReferences(html: string): string {
  return html.replace(
    /<span data-lexical-data-reference="([^"]+)">[^<]*<\/span>/g,
    (_match, path: string) =>
      `<span data-lexical-data-reference="${path}">{{${path}}}</span>`,
  )
}

function applyDarkModeColors(html: string): string {
  let result = html
  for (const [lightColor, darkColor] of SCHEMA_NODE_COLOR_SWAP) {
    result = result.replaceAll(lightColor, darkColor)
  }
  return result
}

export function getRenderTagLayout(
  node: CanvasNode,
  showResolved = true,
  theme: ResolvedTheme = 'light',
): LayoutResult | null {
  const key = getCacheKey(node, showResolved, theme)

  const cached = cache.get(key)
  if (cached) return cached

  // render-tag requires width > 0 — bail early if the node hasn't been sized yet
  if (node.width <= 0) return null

  let html = showResolved ? node.html : unresolveDataReferences(node.html)

  if (theme === 'dark') {
    html = applyDarkModeColors(html)
  }

  const result = layout({
    html,
    width: node.width,
    accuracy: renderTagAccuracy,
  })

  cache.set(key, result)

  return result
}

export function clearRenderTagCache() {
  cache.clear()
}
