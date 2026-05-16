import type { RecipeLayer } from './types'

export const DEFAULT_SWATCHES = ['#C4006A', '#1D8B68', '#6A2B4D', '#18181B']

export function createRecipeLayer(label: string): RecipeLayer {
  return { id: `layer-${crypto.randomUUID().slice(0, 8)}`, label }
}

export function createDefaultLayer(): RecipeLayer {
  return createRecipeLayer('L1')
}

/**
 * Normalizes builder recipe input at store/template boundaries.
 * The builder UI assumes there is always one visual layer available for new models.
 */
export function ensureRecipeHasLayer(layers: RecipeLayer[]): RecipeLayer[] {
  if (layers.length > 0) {
    return layers.map((layer) => ({ ...layer }))
  }

  return [createDefaultLayer()]
}
