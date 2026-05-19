import { queryOptions } from '@tanstack/react-query'

import { GenerationRunResponse } from '@/api/contracts'
import type { GenerationTemplateRead } from '@/api/contracts'
import {
  schemaVizGenerateRunRetrieve,
  schemaVizGenerateTemplateRetrieve,
} from '@/api/generated/schema-viz'

export const SHARED_GENERATION_QUERIES = {
  template: (shareSlug: string) =>
    queryOptions({
      queryKey: ['shared-generation', 'template', shareSlug] as const,
      queryFn: async (): Promise<GenerationTemplateRead> => {
        const response = await schemaVizGenerateTemplateRetrieve(shareSlug)
        if (response.status !== 200) {
          throw new Error('Template not found')
        }
        return response.data as GenerationTemplateRead
      },
      staleTime: 1000 * 60 * 5,
    }),

  run: (shareSlug: string, recordId: string) =>
    queryOptions({
      queryKey: [
        'shared-generation',
        'run',
        shareSlug,
        recordId,
      ] as const,
      queryFn: async () => {
        const response = await schemaVizGenerateRunRetrieve(shareSlug, recordId)
        if (response.status !== 200) {
          throw new Error('Generation failed')
        }
        // Backend returns GenerationRunResponse; the OpenAPI spec types it as void
        return GenerationRunResponse.parse(response.data)
      },
      enabled: Boolean(shareSlug && recordId),
      staleTime: 1000 * 60 * 5,
    }),
}
