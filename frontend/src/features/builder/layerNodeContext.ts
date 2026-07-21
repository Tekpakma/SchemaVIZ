import type { RecipeLayer, RecipeModel } from './types'

/** Layers without any model cannot produce a preview node with data scope. */
export function getLayersWithoutNodeContext(
  layers: RecipeLayer[],
  models: RecipeModel[],
) {
  const layerIdsWithModels = new Set(models.map((model) => model.layerId))
  return layers.filter((layer) => !layerIdsWithModels.has(layer.id))
}

export function hasCompleteLayerNodeContext(
  layers: RecipeLayer[],
  models: RecipeModel[],
) {
  return layers.length > 0 && getLayersWithoutNodeContext(layers, models).length === 0
}
