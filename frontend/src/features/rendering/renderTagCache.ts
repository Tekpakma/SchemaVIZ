import { LRUCache } from 'lru-cache'
import { layout } from 'render-tag'
import type { CanvasNode } from '@/features/canvas/model/types'
import { renderTagAccuracy } from '@/features/lexical/exportRenderTagHtml'

type LayoutResult = ReturnType<typeof layout>

const cache = new LRUCache<string, LayoutResult>({
  max: 1000,
})

function getCacheKey(node: CanvasNode, showResolved: boolean): string {
  return `${node.id}:${node.version}:${node.width}:${showResolved ? 'r' : 't'}`
}

function unresolveDataReferences(html: string): string {
  return html.replace(
    /<span data-lexical-data-reference="([^"]+)">[^<]*<\/span>/g,
    (_match, path: string) =>
      `<span data-lexical-data-reference="${path}">{{${path}}}</span>`,
  )
}

export function getRenderTagLayout(
  node: CanvasNode,
  showResolved = true,
): LayoutResult {
  const key = getCacheKey(node, showResolved)

  const cached = cache.get(key)
  if (cached) return cached

  const html = showResolved ? node.html : unresolveDataReferences(node.html)

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
