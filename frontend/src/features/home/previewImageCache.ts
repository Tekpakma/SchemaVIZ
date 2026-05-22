/**
 * Simple LRU in-memory cache for template preview images.
 *
 * After a Konva canvas renders on the home screen, we capture its pixels
 * via `stage.toDataURL()` and store the resulting data-URL here. On the
 * next mount of the same template (e.g. navigating back from the builder)
 * the cached image is shown as a plain `<img>`, avoiding the cost of
 * creating a CanvasStoreProvider, running ELK layout, and rendering a
 * full Konva stage.
 */

const MAX_ENTRIES = 50

const cache = new Map<string, string>()

export function getPreviewCacheKey(
  templateId: string,
  updatedAt: string,
  variant: string,
): string {
  return `${templateId}:${updatedAt}:${variant}`
}

export function getCachedPreview(key: string): string | null {
  const entry = cache.get(key)
  if (!entry) return null
  // LRU: move to end so the most recently accessed entry survives eviction
  cache.delete(key)
  cache.set(key, entry)
  return entry
}

export function setCachedPreview(key: string, dataUrl: string): void {
  if (cache.has(key)) {
    cache.delete(key)
  } else if (cache.size >= MAX_ENTRIES) {
    // Evict least recently used (first map entry)
    const oldest = cache.keys().next().value
    if (oldest !== undefined) cache.delete(oldest)
  }
  cache.set(key, dataUrl)
}
