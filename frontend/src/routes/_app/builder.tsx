import { createFileRoute, notFound } from '@tanstack/react-router'
import * as zod from 'zod'

import { BuilderPage } from '@/features/builder/BuilderPage'
import {
  GENERATION_TEMPLATE_QUERIES,
  isGenerationTemplateNotFoundError,
} from '@/features/builder/generationTemplateQueries'

const builderSearchSchema = zod.object({
  templateId: zod.string().optional(),
})
export const Route = createFileRoute('/_app/builder')({
  validateSearch: builderSearchSchema,
  loaderDeps: ({ search }) => ({ id: search.templateId }),
  ssr: false,
  loader: async ({ context, deps }) => {
    if (!deps.id) return ({ template: null })
    try {
      const template = await context.queryClient.ensureQueryData(
        GENERATION_TEMPLATE_QUERIES.detail(deps.id)
      )
      return ({ template })
    } catch (error) {
      if (isGenerationTemplateNotFoundError(error)) {
        throw notFound()
      }
      throw error
    }
  },
  component: BuilderRoute,
})

function BuilderRoute() {
  const { template } = Route.useLoaderData()

  return <BuilderPage template={template} />
}
