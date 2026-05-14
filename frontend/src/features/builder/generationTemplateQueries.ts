import { queryOptions } from '@tanstack/react-query'
import { GenerationTemplateNotFoundError } from '@/errors'
import { schemaVizGenerationTemplatesRetrieve } from '@/api/generated/schema-viz'

export {
  GenerationTemplateNotFoundError,
  isGenerationTemplateNotFoundError,
} from '@/errors'

const GENERATION_TEMPLATE_KEY = ['generation-template'] as const

export const GENERATION_TEMPLATE_QUERIES = {
  _base: queryOptions({
    queryKey: GENERATION_TEMPLATE_KEY,
  }),

  detail: (templateId: string) =>
    queryOptions({
      queryKey: [
        ...GENERATION_TEMPLATE_QUERIES._base.queryKey,
        'detail',
        templateId,
      ],
      queryFn: async () => {
        const response = await schemaVizGenerationTemplatesRetrieve(templateId)
        const status = response.status as number
        if (status === 404) {
          throw new GenerationTemplateNotFoundError(templateId)
        }
        if (status !== 200) {
          throw new Error(`Failed to fetch generation template: ${status}`)
        }
        return response.data
      },
      staleTime: 1000 * 60 * 5,
    }),
}
