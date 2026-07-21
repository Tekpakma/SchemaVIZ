import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  DatabaseIcon,
  Loader2Icon,
  SearchIcon,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { ModelInfoShort } from '@/api/contracts'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { BUILDER_SCHEMA_QUERIES } from '../schemaModelQueries'
import {
  getSchemaModelId,
  groupRelatedExplorerModels,
  indexExplorerModels,
} from './modelExplorer'

function groupModelsByApp(models: ModelInfoShort[]) {
  const groups = new Map<string, ModelInfoShort[]>()

  for (const model of models) {
    const appName = model.appVerboseName || model.appLabel
    groups.set(appName, [...(groups.get(appName) ?? []), model])
  }

  return [...groups.entries()]
}

interface ModelExplorerDialogProps {
  addedModelIds: Set<string>
  models: ModelInfoShort[]
  open: boolean
  sourceModelIds: string[]
  targetLayerLabel: string
  onOpenChange: (open: boolean) => void
  onPickModel: (model: ModelInfoShort) => void
}

function ModelExplorerContent({
  addedModelIds,
  models,
  sourceModelIds,
  targetLayerLabel,
  onOpenChange,
  onPickModel,
}: Omit<ModelExplorerDialogProps, 'open'>) {
  const { t } = useTranslation()
  const modelIndex = useMemo(() => indexExplorerModels(models), [models])
  const sourceModels = useMemo(
    () =>
      sourceModelIds
        .map((modelId) => modelIndex.get(modelId.toLowerCase()))
        .filter((model): model is ModelInfoShort => model !== undefined),
    [modelIndex, sourceModelIds],
  )
  const [activeModelId, setActiveModelId] = useState(
    sourceModels[0] ? getSchemaModelId(sourceModels[0]) : null,
  )
  const [history, setHistory] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const activeModel = activeModelId ? modelIndex.get(activeModelId) : undefined
  const detailsQuery = useQuery(
    BUILDER_SCHEMA_QUERIES.modelDetails(
      activeModel?.appLabel ?? '',
      activeModel?.modelName ?? '',
    ),
  )
  const relatedModels = useMemo(
    () =>
      groupRelatedExplorerModels(
        detailsQuery.data?.relations ?? [],
        modelIndex,
      ),
    [detailsQuery.data?.relations, modelIndex],
  )
  const groupedModels = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase()
    const filteredModels = normalizedSearch
      ? models.filter((model) =>
          [
            model.verboseName,
            model.modelName,
            model.appLabel,
            model.appVerboseName,
          ].some((value) =>
            value.toLocaleLowerCase().includes(normalizedSearch),
          ),
        )
      : models
    return groupModelsByApp(filteredModels)
  }, [models, search])
  const isAdded = activeModel
    ? addedModelIds.has(getSchemaModelId(activeModel))
    : false

  const navigateToModel = (model: ModelInfoShort) => {
    const nextModelId = getSchemaModelId(model)
    if (nextModelId === activeModelId) return
    if (activeModelId) setHistory((current) => [...current, activeModelId])
    setActiveModelId(nextModelId)
  }

  const selectSourceModel = (model: ModelInfoShort) => {
    setHistory([])
    setActiveModelId(getSchemaModelId(model))
  }

  const goBack = () => {
    setHistory((current) => {
      const previousModelId = current.at(-1)
      if (previousModelId) setActiveModelId(previousModelId)
      return current.slice(0, -1)
    })
  }

  return (
    <>
      <DialogHeader className="border-b border-border px-5 py-4 pr-12">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <DialogTitle className="text-base">
            {t('builder.modelExplorer.title')}
          </DialogTitle>
          <span className="text-xs font-medium text-brand">
            {t('builder.modelExplorer.targetLayer', {
              layer: targetLayerLabel,
            })}
          </span>
        </div>
        <DialogDescription className="text-xs">
          {t('builder.modelExplorer.description')}
        </DialogDescription>
      </DialogHeader>

      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="flex min-h-[220px] flex-col border-b border-border md:min-h-0 md:border-r md:border-b-0">
          <label className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-3">
            <SearchIcon className="size-4 text-muted-foreground" />
            <span className="sr-only">{t('builder.modelExplorer.search')}</span>
            <input
              autoFocus
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('builder.modelExplorer.search')}
              className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </label>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {groupedModels.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                {t('builder.modelExplorer.noSearchResults')}
              </p>
            ) : (
              groupedModels.map(([appName, appModels]) => (
                <section key={appName} className="mb-3 last:mb-0">
                  <h3 className="px-2 py-1 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                    {appName}
                  </h3>
                  {appModels.map((model) => {
                    const modelId = getSchemaModelId(model)
                    const selected = modelId === activeModelId
                    return (
                      <button
                        key={modelId}
                        type="button"
                        className={cn(
                          'flex w-full items-center gap-2 rounded-md px-2 py-2 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                          selected && 'bg-accent text-accent-foreground',
                        )}
                        aria-current={selected ? 'true' : undefined}
                        onClick={() => navigateToModel(model)}
                      >
                        <DatabaseIcon className="size-3.5 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                          {model.verboseName || model.modelName}
                        </span>
                        {addedModelIds.has(modelId) ? (
                          <CheckIcon className="size-3.5 shrink-0 text-brand" />
                        ) : null}
                      </button>
                    )
                  })}
                </section>
              ))
            )}
          </div>
        </aside>

        <main className="flex min-h-[320px] min-w-0 flex-col">
          {sourceModels.length > 0 ? (
            <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-border px-4 py-2.5">
              <span className="mr-1 text-[11px] text-muted-foreground">
                {t('builder.modelExplorer.exploreFrom')}
              </span>
              {sourceModels.map((model) => {
                const modelId = getSchemaModelId(model)
                return (
                  <button
                    key={modelId}
                    type="button"
                    className={cn(
                      'rounded-full border border-border px-2.5 py-1 text-[11px] font-medium transition-colors hover:border-brand/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                      modelId === activeModelId &&
                        history.length === 0 &&
                        'border-brand/30 bg-brand-muted text-brand',
                    )}
                    onClick={() => selectSourceModel(model)}
                  >
                    {model.verboseName || model.modelName}
                  </button>
                )
              })}
            </div>
          ) : null}

          {!activeModel ? (
            <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
              <DatabaseIcon className="mb-3 size-7 text-muted-foreground" />
              <p className="text-sm font-medium">
                {t('builder.modelExplorer.noSelection')}
              </p>
              <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
                {t('builder.modelExplorer.selectHint')}
              </p>
            </div>
          ) : (
            <>
              <div className="flex shrink-0 items-start gap-3 border-b border-border px-5 py-4">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  type="button"
                  className="mt-0.5 shrink-0"
                  disabled={history.length === 0}
                  aria-label={t('builder.modelExplorer.back')}
                  onClick={goBack}
                >
                  <ArrowLeftIcon className="size-4" />
                </Button>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-base font-semibold">
                    {activeModel.verboseName || activeModel.modelName}
                  </h3>
                  <p className="truncate font-mono text-[11px] text-muted-foreground">
                    {getSchemaModelId(activeModel)}
                  </p>
                </div>
                <Button
                  size="sm"
                  type="button"
                  disabled={isAdded}
                  className="shrink-0"
                  onClick={() => {
                    onPickModel(activeModel)
                    onOpenChange(false)
                  }}
                >
                  {isAdded ? <CheckIcon className="size-3.5" /> : null}
                  {isAdded
                    ? t('builder.modelExplorer.alreadyAdded')
                    : t('builder.modelExplorer.addToLayer', {
                        layer: targetLayerLabel,
                      })}
                </Button>
              </div>

              <div
                className="min-h-0 flex-1 overflow-y-auto px-5 py-4"
                aria-live="polite"
              >
                <h4 className="mb-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                  {t('builder.modelExplorer.directRelations')}
                </h4>
                {detailsQuery.isFetching ? (
                  <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                    <Loader2Icon className="size-4 animate-spin" />
                    {t('builder.modelExplorer.loadingRelations')}
                  </div>
                ) : detailsQuery.isError ? (
                  <p className="py-8 text-sm text-destructive">
                    {t('builder.modelExplorer.relationsError')}
                  </p>
                ) : relatedModels.length === 0 ? (
                  <p className="py-8 text-sm text-muted-foreground">
                    {t('builder.modelExplorer.noRelations')}
                  </p>
                ) : (
                  <div className="divide-y divide-border">
                    {relatedModels.map((related) => (
                      <button
                        key={related.modelId}
                        type="button"
                        className="group flex w-full items-start gap-3 px-1 py-3 text-left hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                        onClick={() => navigateToModel(related.model)}
                      >
                        <DatabaseIcon className="mt-1 size-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-baseline gap-x-2">
                            <span className="text-[13px] font-semibold">
                              {related.model.verboseName ||
                                related.model.modelName}
                            </span>
                            <span className="text-[10.5px] text-muted-foreground">
                              {related.model.appVerboseName ||
                                related.model.appLabel}
                            </span>
                          </span>
                          <span className="mt-1 flex flex-wrap gap-1">
                            {related.relations.map((relation) => (
                              <span
                                key={`${relation.direction}:${relation.name}:${relation.type}`}
                                className="rounded bg-muted px-1.5 py-0.5 font-mono text-[9.5px] text-muted-foreground"
                              >
                                {relation.name} ·{' '}
                                {t(
                                  `builder.modelExplorer.${relation.direction}`,
                                )}{' '}
                                · {relation.type}
                              </span>
                            ))}
                          </span>
                        </span>
                        <ArrowRightIcon className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </main>
      </div>
    </>
  )
}

export function ModelExplorerDialog({
  open,
  onOpenChange,
  ...props
}: ModelExplorerDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(720px,calc(100vh-2rem))] max-h-[calc(100vh-2rem)] w-[min(1080px,calc(100vw-2rem))] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none">
        {open ? (
          <ModelExplorerContent
            key={`${props.targetLayerLabel}:${props.sourceModelIds.join(',')}`}
            {...props}
            onOpenChange={onOpenChange}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
