import * as R from 'remeda'

import type { ModelInfoShort, RelationInfo } from '@/api/contracts'
import { toModelId } from '@/features/lexical/dataReference/modelUtils'
import type { RecipeLayer, RecipeModel } from '../types'

export type ExplorerRelationDirection = 'forward' | 'reverse'

export interface ExplorerRelation {
  direction: ExplorerRelationDirection
  name: string
  type: string
}

export interface RelatedExplorerModel {
  model: ModelInfoShort
  modelId: string
  relations: ExplorerRelation[]
}

export function getSchemaModelId(
  model: Pick<ModelInfoShort, 'appLabel' | 'modelName'>,
) {
  return toModelId(model.appLabel, model.modelName)
}

export function indexExplorerModels(models: ModelInfoShort[]) {
  return new Map(models.map((model) => [getSchemaModelId(model), model]))
}

export function groupRelatedExplorerModels(
  relations: RelationInfo[],
  modelIndex: ReadonlyMap<string, ModelInfoShort>,
): RelatedExplorerModel[] {
  const grouped = new Map<string, RelatedExplorerModel>()

  for (const relation of relations) {
    const modelId = relation.relatedModel.toLowerCase()
    const model = modelIndex.get(modelId)
    if (!model) continue

    const entry = grouped.get(modelId) ?? {
      model,
      modelId,
      relations: [],
    }
    entry.relations.push({
      direction: relation.reverse ? 'reverse' : 'forward',
      name: relation.name,
      type: relation.type,
    })
    grouped.set(modelId, entry)
  }

  return R.sortBy(
    [...grouped.values()],
    (entry) => entry.model.appVerboseName || entry.model.appLabel,
    (entry) => entry.model.verboseName || entry.model.modelName,
  )
}

/**
 * Finds the closest populated layer before the target. A global add creates a
 * layer after the current outline, so its source is the last populated layer.
 */
export function getExplorerSourceModels(
  layers: RecipeLayer[],
  models: RecipeModel[],
  targetLayerId: string | null,
): RecipeModel[] {
  const targetIndex = targetLayerId
    ? layers.findIndex((layer) => layer.id === targetLayerId)
    : layers.length
  const startIndex = targetIndex < 0 ? layers.length - 1 : targetIndex - 1

  for (let index = startIndex; index >= 0; index -= 1) {
    const layerId = layers[index]?.id
    const layerModels = models.filter((model) => model.layerId === layerId)
    if (layerModels.length > 0) return layerModels
  }

  return []
}
