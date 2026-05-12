export type SchemaModelRef = {
  appLabel: string
  modelName: string
}

export function toModelId(appLabel: string, modelName: string): string {
  return `${appLabel}.${modelName}`.toLowerCase()
}

export function splitModelId(modelId: string): SchemaModelRef | null {
  const dot = modelId.indexOf('.')
  if (dot <= 0 || dot >= modelId.length - 1) return null
  return {
    appLabel: modelId.slice(0, dot),
    modelName: modelId.slice(dot + 1),
  }
}
