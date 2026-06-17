import { queryOptions } from '@tanstack/react-query'
import * as zod from 'zod'

import { Drawing, GenerationTemplateList, ModelInfo } from '@/api/contracts'
import {
  schemaVizDrawingsList,
  schemaVizGenerationTemplatesList,
  schemaVizModelsList,
} from '@/api/generated/schema-viz'

const COMMAND_CENTER_KEY = ['command-center'] as const

async function fetchCommandCenterTemplates() {
  const response = await schemaVizGenerationTemplatesList()
  return zod.array(GenerationTemplateList).parse(response.data)
}

async function fetchCommandCenterDrawings() {
  const response = await schemaVizDrawingsList()
  return zod.array(Drawing).parse(response.data)
}

async function fetchCommandCenterModels() {
  const response = await schemaVizModelsList({ excludeDjango: true })

  if (response.status !== 200) {
    throw new Error(`Failed to fetch models: ${response.status}`)
  }

  return zod.array(ModelInfo).parse(response.data)
}

export const COMMAND_CENTER_QUERIES = {
  templates: (enabled: boolean) =>
    queryOptions({
      queryKey: [...COMMAND_CENTER_KEY, 'templates'] as const,
      queryFn: fetchCommandCenterTemplates,
      enabled,
      staleTime: 1000 * 60 * 5,
    }),

  drawings: (enabled: boolean) =>
    queryOptions({
      queryKey: [...COMMAND_CENTER_KEY, 'drawings'] as const,
      queryFn: fetchCommandCenterDrawings,
      enabled,
      staleTime: 1000 * 60 * 5,
    }),

  models: (enabled: boolean) =>
    queryOptions({
      queryKey: [...COMMAND_CENTER_KEY, 'models'] as const,
      queryFn: fetchCommandCenterModels,
      enabled,
      staleTime: 1000 * 60 * 10,
    }),
}
