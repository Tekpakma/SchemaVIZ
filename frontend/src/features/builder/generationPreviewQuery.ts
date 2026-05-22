import { queryOptions } from '@tanstack/react-query'

import type { GeneratedNode } from '@/api/contracts'
import {
  GenerationRunRequestRequest,
  GenerationRunResponse,
} from '@/api/contracts'
import { schemaVizGenerationRunsCreate } from '@/api/generated/schema-viz'
import type { InlineGenerationSource } from './templateRecipe'

// Re-export generated types used by downstream modules
export type { GeneratedNode, GenerationRunResponse }

export type GenerationRunResult = GenerationRunResponse['result']

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

const GENERATION_PREVIEW_KEY = ['builder', 'generation-preview'] as const

function getErrorMessage(responseData: unknown, status: number) {
  if (responseData && typeof responseData === 'object') {
    const record = responseData as Record<string, unknown>
    const message = record.detail ?? record.error ?? record.message
    if (typeof message === 'string' && message.trim()) return message
  }

  return `Generation run failed: ${status}`
}

async function runGenerationPreview(data: GenerationRunRequestRequest) {
  const response = await schemaVizGenerationRunsCreate(data)

  if (response.status !== 200) {
    throw new Error(getErrorMessage(response.data, response.status))
  }

  return GenerationRunResponse.parse(response.data)
}

export const GENERATION_PREVIEW_QUERIES = {
  run: (source: InlineGenerationSource | null, recordId: string | null) =>
    queryOptions({
      queryKey: [
        ...GENERATION_PREVIEW_KEY,
        source?.rootModel ?? '',
        recordId ?? '',
        JSON.stringify(source?.inlineDefinition ?? {}),
        JSON.stringify(source?.layoutSettings ?? {}),
      ],
      queryFn: async () => {
        if (!source || !recordId) {
          throw new Error('Missing source or recordId')
        }

        return runGenerationPreview(
          GenerationRunRequestRequest.parse({
            mode: 'live',
            recordId,
            source: {
              inlineDefinition: source.inlineDefinition,
              rootModel: source.rootModel,
              layoutSettings: source.layoutSettings,
            },
          }),
        )
      },
      enabled: Boolean(source && recordId),
      retry: false,
      staleTime: 1000 * 60 * 5,
    }),
}
