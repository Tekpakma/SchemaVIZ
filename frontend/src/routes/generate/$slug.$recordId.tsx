import { lazy, Suspense, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { DownloadIcon, ExternalLinkIcon, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { isFramedContext } from '@/api/sourceAuth'
import { Button } from '@/components/ui/button'
import { FilterImpactNotice } from '@/features/builder/FilterImpactNotice'
import { hasFilterImpact } from '@/features/builder/generationDiagnostics'
import { SHARED_GENERATION_QUERIES } from '@/features/builder/sharedGenerationQueries'
import { createRecipeFromTemplate } from '@/features/builder/templateRecipe'
import { BrandLogo } from '@/components/navbar/BrandLogo'
import { DeleteGenerationTemplateButton } from '@/features/builder/DeleteGenerationTemplateButton'
import { GenerateRecordSwitcher } from '@/features/builder/GenerateRecordSwitcher'

const BuilderPreview = lazy(async () => {
  const module = await import('@/features/builder/BuilderPreview')
  return { default: module.BuilderPreview }
})

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
  errorComponent: GenerateViewError,
  component: GenerateViewPage,
})

function GenerateViewPending() {
  return (
    <div className="flex h-dvh w-dvw items-center justify-center bg-background">
      <Loader2 className="size-8 animate-spin text-muted-foreground" />
    </div>
  )
}

function GenerateViewError({ error }: { error: Error }) {
  const { t } = useTranslation()
  const { embed } = Route.useSearch()
  // Inside an iframe the login redirect is suppressed, so the failure surfaces
  // here. Breaking out of the frame is the only way to complete a login.
  const embedded = embed === 1 || isFramedContext()

  return (
    <div className="flex h-dvh w-dvw items-center justify-center bg-background p-6">
      <div className="max-w-sm space-y-3 text-center">
        <h2 className="text-sm font-semibold text-foreground">
          {embedded
            ? t('sharedGeneration.embedError.title')
            : t('sharedGeneration.error.title')}
        </h2>
        <p className="text-[13px] text-muted-foreground">
          {embedded
            ? t('sharedGeneration.embedError.description')
            : error.message}
        </p>
        {embedded ? (
          <Button asChild size="sm" variant="outline">
            <a
              href={typeof window === 'undefined' ? '#' : window.location.href}
              rel="noreferrer"
              target="_blank"
            >
              <ExternalLinkIcon className="size-3.5" />
              {t('sharedGeneration.embedError.openInNewTab')}
            </a>
          </Button>
        ) : null}
      </div>
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

  const recipe = createRecipeFromTemplate(template)
  const rootModelId =
    template.publishedVersion?.rootModel ??
    template.draftVersion?.rootModel ??
    ''
  const exportFilterNotice = hasFilterImpact(runData)
    ? t('filterImpact.exportNotice')
    : undefined

  if (isEmbed) {
    return (
      <div className="h-dvh w-dvw overflow-hidden bg-background">
        <Suspense fallback={<GenerateViewPending />}>
          <BuilderPreview
            recipe={recipe}
            generationResponse={runData}
            interactionMode="static"
          />
        </Suspense>
      </div>
    )
  }

  return (
    <div className="flex h-dvh w-dvw flex-col bg-background text-foreground">
      <header className="relative z-10 flex items-center gap-3 border-b border-border/70 bg-background/90 px-3 py-2 shadow-[0_1px_0_0_color-mix(in_oklab,var(--foreground)_3%,transparent)] backdrop-blur-md">
        <BrandLogo />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[13px] font-semibold text-foreground">
            {template.name || t('builder.header.titlePlaceholder')}
          </h1>
        </div>
        <GenerateRecordSwitcher
          recordId={recordId}
          rootModelId={rootModelId}
          slug={slug}
        />
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
      <main className="relative flex min-h-0 flex-1 flex-col">
        <FilterImpactNotice response={runData} />
        <Suspense fallback={<GenerateViewPending />}>
          <BuilderPreview
            className="min-h-0 flex-1"
            exportFilterNotice={exportFilterNotice}
            exportOpen={exportOpen}
            onExportOpenChange={setExportOpen}
            recipe={recipe}
            generationResponse={runData}
            interactionMode="viewport"
          />
        </Suspense>
      </main>
    </div>
  )
}
