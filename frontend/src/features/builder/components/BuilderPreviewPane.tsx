import { useCallback, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Eye, EyeOff, Loader2, RefreshCw, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { BareLoader } from '@/components/GlobalLoader'
import { Button } from '@/components/ui/button'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { cn } from '@/lib/utils'
import { SCHEMA_QUERIES } from '@/features/lexical/dataReference/schemaQueries'
import { BuilderPreview } from '../BuilderPreview'
import type {
  BuilderPreviewCommit,
  BuilderPreviewResize,
} from '../BuilderPreview'
import type { FlushInlineNodeEdit } from '../BuilderInlineEditor'
import type { BuilderDocumentActions } from '../builderWorkbench'
import { GENERATION_PREVIEW_QUERIES } from '../generationPreviewQuery'
import { recipeToInlineDefinition } from '../templateRecipe'
import type {
  ExampleRecord,
  RecipeData,
  RecipeModel,
  RecipeStepKind,
} from '../types'
import { getPreviewErrorMessage } from '#/errors'

type BuilderPreviewPaneProps = {
  actions: Pick<BuilderDocumentActions, 'addExample' | 'setActiveExample'>
  activeExampleId: string | null
  activeStepKind: RecipeStepKind
  examples: ExampleRecord[]
  exportOpen?: boolean
  models: RecipeModel[]
  onCommitNodeText?: (commit: BuilderPreviewCommit) => void
  onExportOpenChange?: (open: boolean) => void
  onNodeResize?: (resize: BuilderPreviewResize) => void
  onNodeSelect?: (nodeId: string | null) => void
  onRegisterFlushInlineEdit?: (flush: FlushInlineNodeEdit | null) => void
  onRenameLayer?: (layerId: string, label: string) => void
  onSetLayerTextContent?: (layerId: string, textContent: unknown) => void
  recipe: RecipeData
}

/**
 * Whether the current step should show traversal edges in the static preview.
 */
function shouldShowEdges(stepKind: RecipeStepKind): boolean {
  return stepKind !== 'layers'
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

/**
 * Returns the canvas interaction mode for the given builder step.
 * The style step uses "edit" mode so users can double-click nodes
 * to open the inline Lexical editor.
 */
function getInteractionMode(
  stepKind: RecipeStepKind,
): 'edit' | 'viewport' | 'static' {
  return stepKind === 'style' ? 'edit' : 'viewport'
}

/**
 * Early modelling steps use deterministic client-side grid positions.
 * The style step also needs the real grouped graph so group labels can be
 * edited in-place; the layout step uses the same path for algorithm previews.
 */
export function shouldAutoLayout(stepKind: RecipeStepKind): boolean {
  return stepKind === 'style' || stepKind === 'layout'
}

function getStartModel(models: RecipeModel[]): RecipeModel | undefined {
  return models[0]
}

function getRecordId(fields: Record<string, unknown>): string {
  const pk = fields.pk ?? fields.id ?? ''
  return String(pk)
}

export function BuilderPreviewPane({
  actions,
  activeExampleId,
  activeStepKind,
  examples,
  exportOpen,
  models,
  onCommitNodeText,
  onExportOpenChange,
  onNodeResize,
  onNodeSelect,
  onRegisterFlushInlineEdit,
  onRenameLayer,
  onSetLayerTextContent,
  recipe,
}: BuilderPreviewPaneProps) {
  const { t } = useTranslation()
  const showEdges = shouldShowEdges(activeStepKind)
  const interactionMode = getInteractionMode(activeStepKind)
  const autoLayout = shouldAutoLayout(activeStepKind)
  // Layer label editing is only available in the style step (step 4)
  const isStyleStep = activeStepKind === 'style'
  const layerCount = t('builder.preview.layerCount', {
    count: recipe.layers.length,
  })
  const edgeCount = t('builder.preview.edgeCount', {
    count: recipe.edges.length,
  })

  // ---------------------------------------------------------------------------
  // Preview toggle + record picker (moved from BuilderHeader)
  // ---------------------------------------------------------------------------
  const [pickerOpen, setPickerOpen] = useState(false)
  const startModel = getStartModel(models)
  const isPreviewActive = activeExampleId != null
  const activeExample = activeExampleId
    ? examples.find((ex) => ex.id === activeExampleId)
    : null
  const flushInlineNodeEditRef = useRef<FlushInlineNodeEdit | null>(null)

  const handleRegisterFlushInlineEdit = useCallback(
    (flush: FlushInlineNodeEdit | null) => {
      flushInlineNodeEditRef.current = flush
      onRegisterFlushInlineEdit?.(flush)
    },
    [onRegisterFlushInlineEdit],
  )

  const existingIds = useMemo(
    () => new Set(examples.map((ex) => ex.idValue)),
    [examples],
  )

  const recordsQuery = useQuery({
    ...SCHEMA_QUERIES.records({
      appLabel: startModel?.appLabel ?? '',
      modelName: startModel?.modelName ?? '',
      page: 1,
      pageSize: 50,
    }),
    enabled: pickerOpen && !!startModel,
  })

  const records = recordsQuery.data?.results ?? []

  const handlePreviewToggle = useCallback(() => {
    flushInlineNodeEditRef.current?.()
    if (typeof document !== 'undefined') {
      const activeElement = document.activeElement
      if (activeElement instanceof HTMLElement) {
        activeElement.blur()
      }
    }

    if (isPreviewActive) {
      actions.setActiveExample(null)
    } else if (startModel) {
      setPickerOpen(true)
    }
  }, [actions, isPreviewActive, startModel])

  const handlePickExistingExample = useCallback(
    (exampleId: string) => {
      actions.setActiveExample(exampleId)
      setPickerOpen(false)
    },
    [actions],
  )

  const handlePickNewRecord = useCallback(
    (record: ExampleRecord) => {
      actions.addExample(record)
      actions.setActiveExample(record.id)
      setPickerOpen(false)
    },
    [actions],
  )

  // ---------------------------------------------------------------------------
  // Live preview: resolve the active example against the generation engine
  // ---------------------------------------------------------------------------
  const hasActiveExample = activeExampleId != null
  const inlineSource = useMemo(
    () => (hasActiveExample ? recipeToInlineDefinition(recipe) : null),
    [hasActiveExample, recipe],
  )
  const recordPk = getRecordPkFromExample(recipe, activeExampleId)

  const queryClient = useQueryClient()
  const queryOptions = GENERATION_PREVIEW_QUERIES.run(
    hasActiveExample ? inlineSource : null,
    recordPk,
  )
  const generationQuery = useQuery(queryOptions)

  const isResolving =
    hasActiveExample && Boolean(inlineSource) && Boolean(recordPk)
  const previewErrorMessage = getPreviewErrorMessage(generationQuery.error)
  const isPreviewLoading =
    isResolving && generationQuery.fetchStatus === 'fetching'

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
                className={cn('size-3', isPreviewLoading && 'animate-spin')}
              />
              {t('builder.preview.recheck')}
            </Button>
          )}
          {isPreviewActive && activeExample && (
            <span className="rounded-full bg-brand/15 px-2.5 py-0.5 text-[11px] font-medium text-brand">
              {activeExample.label}
            </span>
          )}
          <Button
            variant={isPreviewActive ? 'default' : 'ghost'}
            size="xs"
            className="gap-1.5 text-[12px]"
            disabled={!startModel}
            onClick={handlePreviewToggle}
          >
            {isPreviewActive ? (
              <EyeOff className="size-3" />
            ) : (
              <Eye className="size-3" />
            )}
            {t('builder.header.preview')}
          </Button>
        </div>
      </div>

      {isPreviewLoading && <BareLoader nodes={3} speed={280} />}

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
            autoLayout={autoLayout}
            className="min-h-0 flex-1"
            exportOpen={exportOpen}
            interactionMode="viewport"
            onExportOpenChange={onExportOpenChange}
            recipe={recipe}
            showEdges={showEdges}
          />
        </div>
      )}

      {isResolving && generationQuery.data && (
        <BuilderPreview
          autoLayout
          className="min-h-0 flex-1"
          exportOpen={exportOpen}
          generationResponse={generationQuery.data}
          interactionMode="viewport"
          onExportOpenChange={onExportOpenChange}
          recipe={recipe}
          showEdges
        />
      )}

      {!isResolving && (
        <BuilderPreview
          autoLayout={autoLayout}
          className="min-h-0 flex-1"
          exportOpen={exportOpen}
          interactionMode={interactionMode}
          onCommitNodeText={onCommitNodeText}
          onExportOpenChange={onExportOpenChange}
          onNodeResize={onNodeResize}
          onNodeSelect={onNodeSelect}
          onRegisterFlushInlineEdit={handleRegisterFlushInlineEdit}
          onRenameLayer={isStyleStep ? onRenameLayer : undefined}
          onSetLayerTextContent={
            isStyleStep ? onSetLayerTextContent : undefined
          }
          recipe={recipe}
          showEdges={showEdges}
        />
      )}

      {startModel && (
        <CommandDialog
          title={t('builder.header.previewPickerTitle')}
          description={t('builder.header.previewPickerDescription', {
            model: startModel.displayName,
          })}
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          showCloseButton={false}
        >
          <CommandInput placeholder={t('builder.header.previewPickerSearch')} />
          <CommandList>
            {examples.length > 0 && (
              <CommandGroup heading={t('builder.header.pinnedRecords')}>
                {examples.map((ex) => (
                  <CommandItem
                    key={ex.id}
                    value={`${ex.label} ${ex.idValue}`}
                    onSelect={() => handlePickExistingExample(ex.id)}
                  >
                    {activeExampleId === ex.id ? (
                      <Eye className="size-4 text-brand" />
                    ) : (
                      <Check className="size-4 text-muted-foreground" />
                    )}
                    <span className="min-w-0 flex-1 truncate">{ex.label}</span>
                    <span className="font-mono text-[10.5px] text-muted-foreground">
                      {ex.idValue}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {recordsQuery.isLoading && (
              <div className="flex items-center justify-center gap-2 py-6 text-[13px] text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                {t('builder.header.loadingRecords')}
              </div>
            )}
            <CommandEmpty>{t('builder.header.noRecordsFound')}</CommandEmpty>
            {records.length > 0 && (
              <CommandGroup heading={startModel.displayName}>
                {records.map((record) => {
                  const recordId = getRecordId(record.fields)
                  const idValue = `${startModel.appLabel}:${recordId}`
                  const isAdded = existingIds.has(idValue)

                  return (
                    <CommandItem
                      key={idValue}
                      value={`${record.displayName} ${idValue}`}
                      onSelect={() => {
                        if (isAdded) {
                          const existing = examples.find(
                            (ex) => ex.idValue === idValue,
                          )
                          if (existing) {
                            handlePickExistingExample(existing.id)
                          }
                        } else {
                          handlePickNewRecord({
                            id: `ex-${startModel.modelName}-${recordId}`,
                            label: record.displayName,
                            kind: startModel.displayName,
                            idValue,
                            isDefault: examples.length === 0,
                          })
                        }
                      }}
                    >
                      {isAdded ? (
                        <Check className="size-4 text-brand" />
                      ) : (
                        <Search className="size-4" />
                      )}
                      <span className="min-w-0 flex-1 truncate">
                        {record.displayName}
                      </span>
                      <span className="font-mono text-[10.5px] text-muted-foreground">
                        {idValue}
                      </span>
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            )}
          </CommandList>
        </CommandDialog>
      )}
    </section>
  )
}
