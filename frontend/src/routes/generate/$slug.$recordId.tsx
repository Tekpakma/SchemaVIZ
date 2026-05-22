import { useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { DownloadIcon, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { BuilderPreview } from '@/features/builder/BuilderPreview'
import { SHARED_GENERATION_QUERIES } from '@/features/builder/sharedGenerationQueries'
import { createRecipeFromTemplate } from '@/features/builder/templateRecipe'
import { BrandLogo } from '@/components/navbar/BrandLogo'
import { DeleteGenerationTemplateButton } from '@/features/builder/DeleteGenerationTemplateButton'

const searchSchema = z.object({
  embed: z.coerce.number().optional().default(0),
})

export const Route = createFileRoute('/generate/$slug/$recordId')({
  validateSearch: searchSchema,
  ssr: false,
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
  const { t } = useTranslation()
  const { slug, recordId } = Route.useParams()
  const { embed } = Route.useSearch()
  const isEmbed = embed === 1
  const [exportOpen, setExportOpen] = useState(false)

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
            {template.name || t('builder.header.titlePlaceholder')}
          </h1>
        </div>
        <DeleteGenerationTemplateButton template={template} />
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-[13px]"
          onClick={() => setExportOpen(true)}
        >
          <DownloadIcon className="size-3.5" />
          {t('builder.header.share')}
        </Button>
      </header>
      <main className="relative min-h-0 flex-1">
        <BuilderPreview
          exportOpen={exportOpen}
          onExportOpenChange={setExportOpen}
          recipe={recipe}
          generationResponse={runData}
          interactionMode="viewport"
        />
      </main>
    </div>
  )
}
