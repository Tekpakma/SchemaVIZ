import { LRUCache } from 'lru-cache'
import { layout } from 'render-tag'
import type { CanvasNode } from '@/features/canvas/model/types'
import type { ResolvedTheme } from '@/features/theme/constants'
import { renderTagAccuracy } from '@/features/lexical/exportRenderTagHtml'
import { SCHEMA_NODE_COLOR_SWAP } from '@/features/canvas/themeColors'

type LayoutResult = ReturnType<typeof layout>

// Layout results are small (~few hundred bytes) and recomputing them
// (Lexical render + render-tag layout) is expensive (~1-5 ms per node).
// At 5000+ nodes a cap of 1000 thrashes constantly during viewport
// changes. 50k entries is ~25 MB worst-case — cheap insurance.
const cache = new LRUCache<string, LayoutResult>({
  max: 50_000,
})

/**
 * 32-bit DJB2-ish string hash. Collisions are vanishingly unlikely for the
 * length of HTML we produce, and any collision would only mean a single
 * stale render — not a security or correctness boundary.
 */
function hashString(s: string): number {
  let h = 5381
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0
  }
  return h
}

function getCacheKey(
  node: CanvasNode,
  showResolved: boolean,
  theme: ResolvedTheme,
): string {
  // Include a hash of `html` in the key. The cache is module-scoped, so
  // it survives canvas store unmount/remount cycles (e.g. when the
  // builder preview toggles between edit and live-preview modes). If we
  // keyed on `node.version` alone, a remounted node — whose version
  // resets to 1 — would collide with a stale entry from the previous
  // mount and return the pre-edit layout. Hashing the html gives a
  // content-addressed key that's correct regardless of version.
  return `${node.id}:${hashString(node.html)}:${node.width}:${showResolved ? 'r' : 't'}:${theme}`
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
