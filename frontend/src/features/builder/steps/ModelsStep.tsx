import { useQuery } from '@tanstack/react-query'
import { useHotkey } from '@tanstack/react-hotkeys'
import { DragDropProvider } from '@dnd-kit/react'
import { isSortable, useSortable } from '@dnd-kit/react/sortable'
import {
  DatabaseIcon,
  GripVertical,
  InfoIcon,
  LayersIcon,
  PlusIcon,
  X,
} from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import type { ComponentProps, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import type { ModelInfoShort } from '@/api/contracts'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { createRecipeLayer } from '../recipeDefaults'
import { ModelPickerDialog } from '../model-selection/ModelPickerDialog'
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
  const groupedModels = getModelsByLayerId(layers, models)
  const sourceLayerModels = groupedModels.get(sourceModel.layerId)
  const targetLayerModels = groupedModels.get(targetLayerId)
  if (!sourceLayerModels || !targetLayerModels) return models

  const sourceIndex = sourceLayerModels.findIndex(
    (model) => model.id === sourceId,
  )
  if (sourceIndex < 0) return models

  sourceLayerModels.splice(sourceIndex, 1)
  if (targetLayerId === startLayerId && targetLayerModels.length > 0) {
    return models
  }

  const requestedTargetIndex = isLayerDropTargetId(targetId)
    ? targetLayerModels.length
    : target.index
  const insertIndex = Math.max(
    0,
    Math.min(requestedTargetIndex, targetLayerModels.length),
  )

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
  })

  return (
    <div
      ref={sortable.ref}
      className={cn(
        'grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5 transition-colors',
        sortable.isDragSource && 'opacity-60',
        sortable.isDropTarget && 'border-brand/40 bg-brand-muted',
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
        className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
        aria-label={t('builder.models.reorderModel', {
          model: model.displayName,
        })}
      >
        <GripVertical className="size-3.5" />
      </button>
      <button
        type="button"
        className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
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
        'rounded-xl border bg-background p-3',
        isStartLayer ? 'border-brand/25 bg-brand-muted/25' : 'border-border',
      )}
    >
      <div className="flex items-center gap-2 border-b border-border/70 pb-2">
        <span
          className={cn(
            'rounded-md px-2 py-0.5 font-mono text-[11px] font-semibold',
            isStartLayer
              ? 'bg-brand text-brand-foreground'
              : 'bg-brand/10 text-brand',
          )}
        >
          {isStartLayer ? t('builder.models.startBadge') : layer.label}
        </span>
        <h3 className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">
          {title}
        </h3>
        <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[11px] text-muted-foreground">
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
        className="mt-3 flex flex-col gap-2"
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
            className="rounded-lg border border-dashed border-border px-3 py-3 text-left text-[12.5px] text-muted-foreground transition-colors hover:border-brand/40 hover:bg-brand-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
            disabled={!hasSchemaModels || !canAddToLayer}
            onClick={() => onAddModel(layer.id)}
          >
            {isStartLayer
              ? t('builder.models.addStartModel')
              : t('builder.models.addModelToLayer', { layer: title })}
          </button>
        ) : null}

        {models.length > 0 && canAddToLayer ? (
          <Button
            variant="ghost"
            size="sm"
            className="mt-0.5 justify-start gap-1.5 text-[13px] text-muted-foreground"
            type="button"
            onClick={() => onAddModel(layer.id)}
          >
            <PlusIcon className="size-3.5" />
            {t('builder.models.addModelToLayer', { layer: title })}
          </Button>
        ) : null}
      </LayerDropTarget>

      {isStartLayer && models.length > 0 ? (
        <p className="mt-3 flex gap-1.5 text-[12px] leading-relaxed text-muted-foreground">
          <InfoIcon className="mt-0.5 size-3.5 shrink-0" />
          <span>{t('builder.models.startLayerHint')}</span>
        </p>
      ) : null}
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
    () => new Set(models.map((model) => model.modelId)),
    [models],
  )
  const startLayer = layers[0]
  const startLayerModels = startLayer
    ? (modelsByLayerId.get(startLayer.id) ?? [])
    : []
  const startModel = startLayerModels[0]
  const hasSchemaModels =
    modelsQuery.data !== undefined && modelsQuery.data.length > 0

  const openModelPickerForLayer = useCallback(
    (layerId?: string) => {
      if (!hasSchemaModels) return

      let nextTargetLayerId = layerId
      if (!nextTargetLayerId) {
        if (startLayer && startLayerModels.length === 0) {
          nextTargetLayerId = startLayer.id
        } else if (layers[1]) {
          nextTargetLayerId = layers[1].id
        } else {
          const layer = createRecipeLayer(getNextLayerLabel(layers))
          actions.addLayer(layer)
          nextTargetLayerId = layer.id
        }
      }

      if (nextTargetLayerId === startLayer?.id && startLayerModels.length > 0) {
        return
      }

      setTargetLayerId(nextTargetLayerId)
      setModelPickerOpen(true)
    },
    [actions, hasSchemaModels, layers, startLayer, startLayerModels.length],
  )

  const handleAddLayer = useCallback(() => {
    actions.addLayer(createRecipeLayer(getNextLayerLabel(layers)))
  }, [actions, layers])

  const handlePickModel = useCallback(
    (schemaModel: ModelInfoShort) => {
      const layerId = targetLayerId ?? layers[0]?.id
      if (!layerId) return
      if (layerId === startLayer?.id && startLayerModels.length > 0) return

      actions.addModel(toRecipeModel(schemaModel, layerId))
    },
    [actions, layers, startLayer?.id, startLayerModels.length, targetLayerId],
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
        <div className="flex flex-col gap-3">
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

      <div className="grid grid-cols-2 gap-2 border-t border-border pt-3">
        <Button
          variant="outline"
          size="sm"
          className="justify-start gap-1.5 border-dashed text-[13px]"
          disabled={!hasSchemaModels}
          type="button"
          onClick={() => openModelPickerForLayer()}
        >
          <PlusIcon className="size-3.5" />
          <span className="min-w-0 truncate">
            {t('builder.models.addModel')}
          </span>
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="justify-start gap-1.5 text-[13px]"
          type="button"
          onClick={handleAddLayer}
        >
          <LayersIcon className="size-3.5" />
          <span className="min-w-0 truncate">
            {t('builder.models.addLayer')}
          </span>
        </Button>
      </div>

      <ModelPickerDialog
        addedModelIds={addedModelIds}
        models={modelsQuery.data ?? []}
        open={modelPickerOpen}
        onOpenChange={handleModelPickerOpenChange}
        onPickModel={handlePickModel}
      />
    </div>
  )
}
