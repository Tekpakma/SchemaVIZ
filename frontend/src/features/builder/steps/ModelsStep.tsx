import { useQuery } from '@tanstack/react-query'
import { useHotkey } from '@tanstack/react-hotkeys'
import { DragDropProvider } from '@dnd-kit/react'
import { isSortable, useSortable } from '@dnd-kit/react/sortable'
import { SortableKeyboardPlugin } from '@dnd-kit/dom/sortable'
import {
  DatabaseIcon,
  GripVertical,
  LayersIcon,
  PlusIcon,
  SearchIcon,
  X,
} from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import type { ComponentProps, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import type { ModelInfoShort } from '@/api/contracts'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { createRecipeLayer } from '../recipeDefaults'
import { ModelExplorerDialog } from '../model-selection/ModelPickerDialog'
import { getExplorerSourceModels } from '../model-selection/modelExplorer'
import type { BuilderDocumentActions } from '../builderWorkbench'
import { BUILDER_SCHEMA_QUERIES } from '../schemaModelQueries'
import type { RecipeLayer, RecipeModel } from '../types'

interface ModelsStepProps {
  actions: Pick<
    BuilderDocumentActions,
    | 'addLayer'
    | 'addModel'
    | 'removeLayer'
    | 'removeModel'
    | 'reorderModels'
    | 'setModelLayer'
  >
  layers: RecipeLayer[]
  models: RecipeModel[]
}

const MODEL_SORTABLE_GROUP = 'builder-models'
const LAYER_DROP_PREFIX = 'builder-layer-drop:'

function createBuilderId(prefix: string) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`
}

function getSchemaModelId(model: ModelInfoShort) {
  return `${model.appLabel}.${model.modelName}`
}

function toRecipeModel(model: ModelInfoShort, layerId: string): RecipeModel {
  return {
    id: createBuilderId('model'),
    appLabel: model.appLabel,
    appVerboseName: model.appVerboseName,
    modelName: model.modelName,
    modelId: getSchemaModelId(model),
    displayName: model.verboseName || model.modelName,
    layerId,
  }
}

function getNextLayerLabel(layers: RecipeLayer[]) {
  return `L${layers.length + 1}`
}

function getModelsByLayerId(layers: RecipeLayer[], models: RecipeModel[]) {
  const groups = new Map(layers.map((layer) => [layer.id, [] as RecipeModel[]]))

  for (const model of models) {
    const layerModels = groups.get(model.layerId)
    if (layerModels) {
      layerModels.push(model)
    }
  }

  return groups
}

function isLayerDropTargetId(id: string) {
  return id.startsWith(LAYER_DROP_PREFIX)
}

type DragEndEvent = Parameters<
  NonNullable<ComponentProps<typeof DragDropProvider>['onDragEnd']>
>[0]

/**
 * Reorders models inside visual layer groups and moves a model to another group.
 * The first layer is the start lane, so it rejects drops when another start model exists.
 *
 * Uses `source.initialIndex` to find the source in the data array, and derives the
 * target insertion index from the target model's data position — because dnd-kit's
 * OptimisticSortingPlugin mutates `index` during drag and `target.index` reflects
 * the visual (optimistic) position rather than the original data position.
 */
function moveModelBetweenLayerGroups(
  models: RecipeModel[],
  layers: RecipeLayer[],
  event: DragEndEvent,
) {
  const { source, target } = event.operation
  if (!isSortable(source) || !target || !isSortable(target)) return models

  const sourceId = String(source.id)
  const targetId = String(target.id)
  if (isLayerDropTargetId(sourceId)) return models
  if (sourceId === targetId) return models

  const sourceModel = models.find((model) => model.id === sourceId)
  if (!sourceModel) return models

  const targetLayerId = String(target.group)
  const targetLayer = layers.find((layer) => layer.id === targetLayerId)
  if (!targetLayer) return models

  const startLayerId = layers[0]?.id
  const isCrossGroup = sourceModel.layerId !== targetLayerId

  // Block drops into the start layer if it already has a model (unless it's the same model reordering)
  if (isCrossGroup && targetLayerId === startLayerId) {
    const startModels = models.filter((m) => m.layerId === startLayerId)
    if (startModels.length > 0) return models
  }

  const groupedModels = getModelsByLayerId(layers, models)
  const sourceLayerModels = groupedModels.get(sourceModel.layerId)!
  const targetLayerModels = groupedModels.get(targetLayerId)!

  // Find the source by id (stable, not affected by optimistic index changes)
  const sourceIndex = sourceLayerModels.findIndex(
    (model) => model.id === sourceId,
  )
  if (sourceIndex < 0) return models

  // Remove from source
  sourceLayerModels.splice(sourceIndex, 1)

  // Determine insertion index:
  // - For layer drop targets (empty area): append to end
  // - For model targets: find target model's position in the (post-removal) array
  let insertIndex: number
  if (isLayerDropTargetId(targetId)) {
    insertIndex = targetLayerModels.length
  } else {
    const targetModelIndex = targetLayerModels.findIndex(
      (model) => model.id === targetId,
    )
    insertIndex =
      targetModelIndex >= 0 ? targetModelIndex : targetLayerModels.length
  }

  targetLayerModels.splice(insertIndex, 0, {
    ...sourceModel,
    layerId: targetLayerId,
  })

  return layers.flatMap((layer) => groupedModels.get(layer.id) ?? [])
}

function LayerDropTarget({
  children,
  className,
  index,
  layerId,
}: {
  children: ReactNode
  className?: string
  index: number
  layerId: string
}) {
  const sortable = useSortable({
    id: `${LAYER_DROP_PREFIX}${layerId}`,
    index,
    group: layerId,
    type: MODEL_SORTABLE_GROUP,
    plugins: [SortableKeyboardPlugin],
  })

  return (
    <div ref={sortable.targetRef} className={className}>
      {children}
    </div>
  )
}

function SortableModelRow({
  index,
  model,
  onRemove,
}: {
  index: number
  model: RecipeModel
  onRemove: (modelId: string) => void
}) {
  const { t } = useTranslation()
  const sortable = useSortable({
    id: model.id,
    index,
    group: model.layerId,
    type: MODEL_SORTABLE_GROUP,
    plugins: [SortableKeyboardPlugin],
  })

  return (
    <div
      ref={sortable.ref}
      className={cn(
        'group grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-2 rounded-md px-2 py-2 transition-colors hover:bg-accent/50 focus-within:bg-accent/50',
        sortable.isDragSource && 'opacity-60',
        sortable.isDropTarget && 'bg-brand-muted',
      )}
    >
      <DatabaseIcon className="size-3.5 text-muted-foreground" />
      <div className="min-w-0">
        <div className="truncate text-[13.5px] font-medium">
          {model.displayName}
        </div>
        <div className="truncate font-mono text-[10.5px] text-muted-foreground">
          {model.modelId}
        </div>
      </div>
      <button
        ref={sortable.handleRef}
        type="button"
        className="flex size-7 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 hover:bg-accent hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        aria-label={t('builder.models.reorderModel', {
          model: model.displayName,
        })}
      >
        <GripVertical className="size-3.5" />
      </button>
      <button
        type="button"
        className="flex size-7 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 hover:bg-accent hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        aria-label={t('builder.models.removeModel', {
          model: model.displayName,
        })}
        onClick={() => onRemove(model.id)}
      >
        <X className="size-3.5" />
      </button>
    </div>
  )
}

function LayerGroup({
  hasSchemaModels,
  index,
  layer,
  models,
  onAddLayer,
  onAddModel,
  onRemoveLayer,
  onRemoveModel,
}: {
  hasSchemaModels: boolean
  index: number
  layer: RecipeLayer
  models: RecipeModel[]
  onAddLayer: () => void
  onAddModel: (layerId: string) => void
  onRemoveLayer: (layerId: string) => void
  onRemoveModel: (modelId: string) => void
}) {
  const { t } = useTranslation()
  const isStartLayer = index === 0
  const canAddToLayer =
    hasSchemaModels && (!isStartLayer || models.length === 0)
  const title = isStartLayer ? t('builder.models.startLayerTitle') : layer.label

  return (
    <section
      className={cn(
        'border-b border-border/70 py-1.5 first:border-t',
        isStartLayer && 'border-brand/20 bg-brand-muted/15',
      )}
    >
      <div className="flex min-h-9 items-center gap-2 px-2">
        <span
          className={cn(
            'shrink-0 rounded-md px-2 py-0.5 font-mono text-[11px] font-semibold',
            isStartLayer
              ? 'bg-brand text-brand-foreground'
              : 'bg-brand/10 text-brand',
          )}
        >
          {isStartLayer ? t('builder.models.startBadge') : `L${index + 1}`}
        </span>
        <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">
          {layer.label}
        </span>
        <span className="px-1 text-[11px] tabular-nums text-muted-foreground">
          {t('builder.models.groupModelCount', { count: models.length })}
        </span>
        {isStartLayer ? (
          <Button
            variant="ghost"
            size="icon-xs"
            type="button"
            className="text-muted-foreground"
            onClick={onAddLayer}
            aria-label={t('builder.models.addLayer')}
          >
            <PlusIcon className="size-3.5" />
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="icon-xs"
            type="button"
            className="text-muted-foreground hover:text-destructive"
            onClick={() => onRemoveLayer(layer.id)}
            aria-label={t('builder.models.removeLayer', { layer: title })}
          >
            <X className="size-3.5" />
          </Button>
        )}
      </div>

      <LayerDropTarget
        className="ml-5 flex flex-col border-l border-border/70 pl-2"
        index={models.length}
        layerId={layer.id}
      >
        {models.map((model, modelIndex) => (
          <SortableModelRow
            key={model.id}
            model={model}
            index={modelIndex}
            onRemove={onRemoveModel}
          />
        ))}

        {models.length === 0 ? (
          <button
            type="button"
            className="flex min-h-9 items-center gap-2 rounded-md px-2 text-left text-[12.5px] text-muted-foreground transition-colors hover:bg-brand-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
            disabled={!hasSchemaModels || !canAddToLayer}
            onClick={() => onAddModel(layer.id)}
          >
            <SearchIcon className="size-3.5" />
            {isStartLayer
              ? t('builder.models.addStartModel')
              : t('builder.models.addModelToLayer', { layer: title })}
          </button>
        ) : null}

        {models.length > 0 && canAddToLayer ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 justify-start gap-1.5 px-2 text-[12px] text-muted-foreground"
            type="button"
            onClick={() => onAddModel(layer.id)}
          >
            <PlusIcon className="size-3.5" />
            {t('builder.models.addModelToLayer', { layer: title })}
          </Button>
        ) : null}
      </LayerDropTarget>
    </section>
  )
}

export function ModelsStep({ actions, layers, models }: ModelsStepProps) {
  const { t } = useTranslation()
  const modelsQuery = useQuery(BUILDER_SCHEMA_QUERIES.models())
  const [modelPickerOpen, setModelPickerOpen] = useState(false)
  const [targetLayerId, setTargetLayerId] = useState<string | null>(null)

  const modelsByLayerId = useMemo(
    () => getModelsByLayerId(layers, models),
    [layers, models],
  )
  const addedModelIds = useMemo(
    () => new Set(models.map((model) => model.modelId.toLowerCase())),
    [models],
  )
  const startLayer = layers[0]
  const startLayerModels = startLayer
    ? (modelsByLayerId.get(startLayer.id) ?? [])
    : []
  const startModel = startLayerModels[0]
  const hasSchemaModels =
    modelsQuery.data !== undefined && modelsQuery.data.length > 0
  const explorerSourceModelIds = useMemo(
    () =>
      getExplorerSourceModels(layers, models, targetLayerId).map((model) =>
        model.modelId.toLowerCase(),
      ),
    [layers, models, targetLayerId],
  )
  const explorerTargetLayerLabel = useMemo(() => {
    const targetLayer = layers.find((layer) => layer.id === targetLayerId)
    if (targetLayer) return targetLayer.label
    if (startLayerModels.length === 0 && startLayer) return startLayer.label
    return getNextLayerLabel(layers)
  }, [layers, startLayer, startLayerModels.length, targetLayerId])

  const openModelPickerForLayer = useCallback(
    (layerId?: string) => {
      if (!hasSchemaModels) return

      if (layerId === startLayer?.id && startLayerModels.length > 0) {
        return
      }

      setTargetLayerId(layerId ?? null)
      setModelPickerOpen(true)
    },
    [hasSchemaModels, startLayer, startLayerModels.length],
  )

  const handleAddLayer = useCallback(() => {
    actions.addLayer(createRecipeLayer(getNextLayerLabel(layers)))
  }, [actions, layers])

  const handlePickModel = useCallback(
    (schemaModel: ModelInfoShort) => {
      let layerId = targetLayerId
      if (!layerId) {
        if (startLayer && startLayerModels.length === 0) {
          layerId = startLayer.id
        } else {
          const layer = createRecipeLayer(getNextLayerLabel(layers))
          actions.addLayer(layer)
          layerId = layer.id
        }
      }
      if (!layerId) return
      if (layerId === startLayer?.id && startLayerModels.length > 0) return

      actions.addModel(toRecipeModel(schemaModel, layerId))
    },
    [actions, layers, startLayer, startLayerModels.length, targetLayerId],
  )

  const handleModelPickerOpenChange = useCallback((open: boolean) => {
    setModelPickerOpen(open)
    if (!open) setTargetLayerId(null)
  }, [])

  const handleDragEnd: ComponentProps<typeof DragDropProvider>['onDragEnd'] =
    useCallback(
      (event) => {
        if (event.canceled) return

        const result = moveModelBetweenLayerGroups(models, layers, event)
        if (result === models) return
        actions.reorderModels(result)
      },
      [actions, layers, models],
    )

  useHotkey('Mod+K', () => openModelPickerForLayer(), {
    enabled: hasSchemaModels,
  })

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-muted-foreground">
        <span className="inline-flex gap-1 font-medium text-foreground">
          <span>{layers.length}</span>
          <span>
            {t('builder.models.layerSummary', { count: layers.length })}
          </span>
        </span>
        <span>·</span>
        <span className="inline-flex gap-1 font-medium text-foreground">
          <span>{models.length}</span>
          <span>
            {t('builder.models.modelSummary', { count: models.length })}
          </span>
        </span>
        {startModel ? (
          <>
            <span>·</span>
            <span className="text-brand">
              {t('builder.models.startModelSummary', {
                model: startModel.displayName,
              })}
            </span>
          </>
        ) : null}
      </div>

      <DragDropProvider onDragEnd={handleDragEnd}>
        <div className="flex flex-col">
          {layers.map((layer, index) => (
            <LayerGroup
              key={layer.id}
              hasSchemaModels={hasSchemaModels}
              index={index}
              layer={layer}
              models={modelsByLayerId.get(layer.id) ?? []}
              onAddLayer={handleAddLayer}
              onAddModel={openModelPickerForLayer}
              onRemoveLayer={actions.removeLayer}
              onRemoveModel={actions.removeModel}
            />
          ))}
        </div>
      </DragDropProvider>

      {modelsQuery.isError ? (
        <div className="rounded-lg border border-destructive/25 bg-destructive/5 p-3 text-[12.5px] text-destructive">
          {t('builder.models.loadError')}
        </div>
      ) : null}
      {modelsQuery.isFetching && !modelsQuery.data ? (
        <div className="rounded-lg border border-border bg-muted/40 p-3 text-[12.5px] text-muted-foreground">
          {t('builder.models.loading')}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-1 border-t border-border pt-2">
        <Button
          variant="ghost"
          size="sm"
          className="justify-start gap-1.5 text-[12.5px] text-muted-foreground"
          disabled={!hasSchemaModels}
          type="button"
          onClick={() => openModelPickerForLayer()}
        >
          <SearchIcon className="size-3.5" />
          <span className="min-w-0 truncate">
            {t('builder.models.exploreModels')}
          </span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="justify-start gap-1.5 text-[12.5px] text-muted-foreground"
          type="button"
          onClick={handleAddLayer}
        >
          <LayersIcon className="size-3.5" />
          <span className="min-w-0 truncate">
            {t('builder.models.addLayer')}
          </span>
        </Button>
      </div>

      <ModelExplorerDialog
        addedModelIds={addedModelIds}
        models={modelsQuery.data ?? []}
        open={modelPickerOpen}
        sourceModelIds={explorerSourceModelIds}
        targetLayerLabel={explorerTargetLayerLabel}
        onOpenChange={handleModelPickerOpenChange}
        onPickModel={handlePickModel}
      />
    </div>
  )
}
