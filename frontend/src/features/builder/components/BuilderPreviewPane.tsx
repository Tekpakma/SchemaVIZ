import { useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { BareLoader } from '@/components/GlobalLoader'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { BuilderPreview } from '../BuilderPreview'
import { GENERATION_PREVIEW_QUERIES } from '../generationPreviewQuery'
import { recipeToInlineDefinition } from '../templateRecipe'
import type { RecipeData, RecipeStepKind } from '../types'
import { getPreviewErrorMessage } from '#/errors'

type BuilderPreviewPaneProps = {
  activeExampleId: string | null
  activeStepKind: RecipeStepKind
  recipe: RecipeData
}

/**
 * Extracts the backend record PK from an example's `idValue` ("appLabel:pk").
 */
function getRecordPkFromExample(
  recipe: RecipeData,
  exampleId: string | null,
): string | null {
  if (!exampleId) return null

  const example = recipe.examples.find((ex) => ex.id === exampleId)
  if (!example) return null

  // idValue format is "appLabel:pk"
  const colonIndex = example.idValue.indexOf(':')
  return colonIndex >= 0 ? example.idValue.slice(colonIndex + 1) : null
}


export function BuilderPreviewPane({
  activeExampleId,
  activeStepKind,
  recipe,
}: BuilderPreviewPaneProps) {
  const { t } = useTranslation()
  const showEdges = activeStepKind !== 'layers'
  const layerCount = t('builder.preview.layerCount', {
    count: recipe.layers.length,
  })
  const edgeCount = t('builder.preview.edgeCount', {
    count: recipe.edges.length,
  })

  // Resolve the example record against the generation engine
  const isExamplesStep = activeStepKind === 'examples'
  const inlineSource = useMemo(
    () => (isExamplesStep ? recipeToInlineDefinition(recipe) : null),
    [isExamplesStep, recipe],
  )
  const recordPk = getRecordPkFromExample(recipe, activeExampleId)

  const queryClient = useQueryClient()
  const queryOptions = GENERATION_PREVIEW_QUERIES.run(
    isExamplesStep ? inlineSource : null,
    recordPk,
  )
  const generationQuery = useQuery(queryOptions)

  const isResolving = isExamplesStep && activeExampleId != null
  const activeExample = activeExampleId
    ? recipe.examples.find((ex) => ex.id === activeExampleId)
    : null
  const previewErrorMessage = getPreviewErrorMessage(generationQuery.error)
  const isPreviewLoading =
    isResolving && generationQuery.fetchStatus === 'fetching'

  // TODO: Wire to backend generation-runs invalidation endpoint
  const handleRecheck = () => {
    void queryClient.invalidateQueries({ queryKey: queryOptions.queryKey })
  }

  return (
    <section className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-border px-4">
        <h2 className="text-[13px] font-medium text-foreground">
          {t('builder.preview.title')}
        </h2>
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-muted-foreground">
            {isResolving && activeExample
              ? t('builder.preview.resolvedFor', {
                record: activeExample.label,
              })
              : showEdges
                ? t('builder.preview.layerAndEdgeCount', {
                  edges: edgeCount,
                  layers: layerCount,
                })
                : layerCount}
          </span>
          {isResolving && (
            <Button
              disabled={isPreviewLoading}
              onClick={handleRecheck}
              size="xs"
              variant="ghost"
            >
              <RefreshCw
                className={cn(
                  'size-3',
                  isPreviewLoading && 'animate-spin',
                )}
              />
              {t('builder.preview.recheck')}
            </Button>
          )}
        </div>
      </div>

      {isPreviewLoading && (
        <BareLoader nodes={3} speed={280} />
      )}

      {isResolving && generationQuery.isError && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2">
          <p className="text-[13px] text-destructive">
            {t('builder.preview.resolveError')}
          </p>
          {previewErrorMessage ? (
            <p className="max-w-[42rem] px-6 text-center text-[12px] text-muted-foreground">
              {previewErrorMessage}
            </p>
          ) : null}
          <Button
            className="mt-1"
            onClick={handleRecheck}
            size="sm"
            variant="outline"
          >
            <RefreshCw className="size-3.5" />
            {t('builder.preview.retry')}
          </Button>
          <BuilderPreview
            className="min-h-0 flex-1"
            recipe={recipe}
            showEdges={showEdges}
          />
        </div>
      )}

      {isResolving && generationQuery.data && (
        <BuilderPreview
          className="min-h-0 flex-1"
          generationResult={generationQuery.data.result}
          recipe={recipe}
          showEdges
        />
      )}

      {!isResolving && (
        <BuilderPreview
          className="min-h-0 flex-1"
          recipe={recipe}
          showEdges={showEdges}
        />
      )}
    </section>
  )
}
