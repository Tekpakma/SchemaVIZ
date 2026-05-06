import { LRUCache } from 'lru-cache'
import { layout } from 'render-tag'
import type { CanvasNode } from '@/features/canvas/model/types'
import { renderTagAccuracy } from '@/features/lexical/exportRenderTagHtml'

type LayoutResult = ReturnType<typeof layout>

const cache = new LRUCache<string, LayoutResult>({
  max: 1000,
})

function getCacheKey(node: CanvasNode): string {
  return `${node.id}:${node.version}:${node.width}`
}

export function getRenderTagLayout(node: CanvasNode): LayoutResult {
  const key = getCacheKey(node)

  const cached = cache.get(key)
  if (cached) return cached

  const result = layout({
    html: node.html,
    width: node.width,
    accuracy: renderTagAccuracy,
  })

  cache.set(key, result)

  return result
}

export function clearRenderTagCache() {
  cache.clear()
}
