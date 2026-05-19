import { useMemo } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { Loader2 } from 'lucide-react'

import { BuilderPreview } from '@/features/builder/BuilderPreview'
import { SHARED_GENERATION_QUERIES } from '@/features/builder/sharedGenerationQueries'
import { createRecipeFromTemplate } from '@/features/builder/templateRecipe'
import { BrandLogo } from '@/components/navbar/BrandLogo'

const searchSchema = z.object({
  embed: z.coerce.number().optional().default(0),
})

export const Route = createFileRoute('/generate/$slug/$recordId')({
  ssr: false,
  validateSearch: searchSchema,
  loader: ({ context: { queryClient }, params: { slug, recordId } }) =>
    Promise.all([
      queryClient.ensureQueryData(SHARED_GENERATION_QUERIES.template(slug)),
      queryClient.ensureQueryData(
        SHARED_GENERATION_QUERIES.run(slug, recordId),
      ),
    ]),
  pendingComponent: GenerateViewPending,
  component: GenerateViewPage,
})

function GenerateViewPending() {
  return (
    <div className="flex h-dvh w-dvw items-center justify-center bg-background">
      <Loader2 className="size-8 animate-spin text-muted-foreground" />
    </div>
  )
}

function GenerateViewPage() {
  const { slug, recordId } = Route.useParams()
  const { embed } = Route.useSearch()
  const isEmbed = embed === 1

  const { data: template } = useSuspenseQuery(
    SHARED_GENERATION_QUERIES.template(slug),
  )
  const { data: runData } = useSuspenseQuery(
    SHARED_GENERATION_QUERIES.run(slug, recordId),
  )

  const recipe = useMemo(() => createRecipeFromTemplate(template), [template])

  if (isEmbed) {
    return (
      <div className="h-dvh w-dvw overflow-hidden bg-background">
        <BuilderPreview
          recipe={recipe}
          generationResponse={runData}
          interactionMode="static"
        />
      </div>
    )
  }

  return (
    <div className="flex h-dvh w-dvw flex-col bg-background">
      <header className="flex items-center gap-3 border-b border-border px-3 py-2">
        <BrandLogo />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[13px] font-semibold text-foreground">
            {template.name || 'Untitled'}
          </h1>
        </div>
      </header>
      <main className="relative min-h-0 flex-1">
        <BuilderPreview
          recipe={recipe}
          generationResponse={runData}
          interactionMode="viewport"
        />
      </main>
    </div>
  )
}
