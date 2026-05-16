import { useState } from 'react'
import { createFileRoute, notFound } from '@tanstack/react-router'
import * as zod from 'zod'

import { BuilderPage } from '@/features/builder/BuilderPage'
import {
  openBuilderTabFromIntent

} from '@/features/builder/builderWorkbench'
import type { BuilderOpenIntent } from '@/features/builder/builderWorkbench';
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
    if (!deps.id) {
      return {
        intent: {
          type: 'draft',
        } satisfies BuilderOpenIntent,
      }
    }

    try {
      const template = await context.queryClient.ensureQueryData(
        GENERATION_TEMPLATE_QUERIES.detail(deps.id),
      )
      return {
        intent: {
          type: 'template',
          template,
        } satisfies BuilderOpenIntent,
      }
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
  const { intent } = Route.useLoaderData()
  const [tabId] = useState(() => openBuilderTabFromIntent(intent))

  return <BuilderPage tabId={tabId} />
}
