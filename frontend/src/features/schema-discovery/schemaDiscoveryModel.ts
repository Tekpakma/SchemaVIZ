import type { ModelInfo } from '@/api/contracts'

export function getSchemaModelId(model: ModelInfo) {
  return `${model.appLabel}.${model.modelName}`
}

export function findSchemaModel(models: ModelInfo[], modelId: string | null) {
  if (!modelId) return null
  return models.find((model) => getSchemaModelId(model) === modelId) ?? null
}

export function filterSchemaModels(models: ModelInfo[], query: string) {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return models

  return models.filter((model) => {
    const searchable = [
      getSchemaModelId(model),
      model.verboseName,
      model.verboseNamePlural,
      model.appVerboseName,
      model.dbTable,
      ...model.fields.map((field) => field.name),
      ...model.relations.map((relation) => relation.name),
    ]
      .join(' ')
      .toLowerCase()

    return searchable.includes(normalizedQuery)
  })
}

export function groupSchemaModelsByApp(models: ModelInfo[]) {
  const groups = new Map<string, ModelInfo[]>()

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

export function getSchemaDiscoveryStats(models: ModelInfo[]) {
  const appLabels = new Set(models.map((model) => model.appLabel))
  return {
    appCount: appLabels.size,
    modelCount: models.length,
    relationCount: models.reduce(
      (count, model) => count + model.relations.length,
      0,
    ),
  }
}
