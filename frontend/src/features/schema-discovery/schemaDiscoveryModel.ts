import type { ModelInfo } from '@/api/contracts'

// The models list endpoint omits fields/relations/methods; only model-details carries them.
export type SchemaDiscoveryModel = Omit<
  ModelInfo,
  'fields' | 'relations' | 'methods'
> &
  Partial<Pick<ModelInfo, 'fields' | 'relations' | 'methods'>>

export function getSchemaModelId(model: SchemaDiscoveryModel) {
  return `${model.appLabel}.${model.modelName}`
}

export function findSchemaModel(
  models: SchemaDiscoveryModel[],
  modelId: string | null,
) {
  if (!modelId) return null
  return models.find((model) => getSchemaModelId(model) === modelId) ?? null
}

export function filterSchemaModels(
  models: SchemaDiscoveryModel[],
  query: string,
) {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return models

  return models.filter((model) => {
    const searchable = [
      getSchemaModelId(model),
      model.verboseName,
      model.verboseNamePlural,
      model.appVerboseName,
      model.dbTable,
      ...(model.fields ?? []).map((field) => field.name),
      ...(model.relations ?? []).map((relation) => relation.name),
    ]
      .join(' ')
      .toLowerCase()

    return searchable.includes(normalizedQuery)
  })
}

export function groupSchemaModelsByApp(models: SchemaDiscoveryModel[]) {
  const groups = new Map<string, SchemaDiscoveryModel[]>()

  for (const model of models) {
    const group = groups.get(model.appVerboseName) ?? []
    group.push(model)
    groups.set(model.appVerboseName, group)
  }

  return Array.from(groups, ([appName, appModels]) => ({
    appName,
    models: appModels,
  }))
}

export function getSchemaDiscoveryStats(models: SchemaDiscoveryModel[]) {
  const appLabels = new Set(models.map((model) => model.appLabel))
  return {
    appCount: appLabels.size,
    modelCount: models.length,
    relationCount: models.reduce(
      (count, model) => count + (model.relations ?? []).length,
      0,
    ),
  }
}
