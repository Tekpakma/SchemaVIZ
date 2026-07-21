import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import {
  AlertTriangleIcon,
  CheckIcon,
  MousePointerClickIcon,
  SaveIcon,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { StyleTemplate } from '@/api/contracts'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { CANVAS_NODE_SHAPES } from '@/features/canvas/nodeShapes'
import { createTemplateTextContent } from '@/features/lexical/templateTextContent'
import type { BuilderDocumentActions } from '../builderWorkbench'
import { getModelIdFromBuilderGroupNodeId } from '../builderPreviewLayout'
import { getLayersWithoutNodeContext } from '../layerNodeContext'
import { GroupingControls } from './GroupingControls'
import {
  BUILDER_SCHEMA_QUERIES,
  saveBuilderStyleTemplateDraft,
} from '../schemaModelQueries'
import type { ShapeEntry } from '../schemaModelQueries'
import type {
  RecipeGroupRule,
  RecipeLayer,
  RecipeModel,
  RecipeStyleDraft,
  TraversalEdge,
} from '../types'

interface StyleStepProps {
  actions: Pick<
    BuilderDocumentActions,
    | 'addGroupRule'
    | 'markStyleDraftSaved'
    | 'removeGroupRule'
    | 'setModelStyleTemplate'
    | 'setStyleDraft'
    | 'setStyleDraftSaveState'
  >
  edges: TraversalEdge[]
  groupRules: RecipeGroupRule[]
  layers: RecipeLayer[]
  models: RecipeModel[]
  selectedCanvasNodeId?: string | null
  styleDrafts: Record<string, RecipeStyleDraft>
  swatches: string[]
}

const QUICK_STYLE_VALUE = '__quick_style__'

function getModelLabel(model: RecipeModel) {
  return model.alias || model.displayName
}

function getSafeColor(value: string) {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : '#18181B'
}

function getModelLayerIndex(model: RecipeModel, layers: RecipeLayer[]) {
  const layerIndex = layers.findIndex((layer) => layer.id === model.layerId)
  return layerIndex >= 0 ? layerIndex : 0
}

function getModelSwatchIndex(
  model: RecipeModel,
  layers: RecipeLayer[],
  swatches: string[],
) {
  if (swatches.length === 0) return 0
  return getModelLayerIndex(model, layers) % swatches.length
}

function getModelAccent(
  model: RecipeModel,
  layers: RecipeLayer[],
  swatches: string[],
) {
  const swatch = swatches[getModelSwatchIndex(model, layers, swatches)]
  return getSafeColor(swatch ?? '#18181B')
}

type TypeSpecificData = {
  shapeKey?: string
  borderColor?: string
  backgroundColor?: string
}

function readTypeSpecificData(value: unknown): TypeSpecificData {
  if (!value || typeof value !== 'object') return {}
  const record = value as Record<string, unknown>
  return {
    shapeKey: typeof record.shapeKey === 'string' ? record.shapeKey : undefined,
    borderColor:
      typeof record.borderColor === 'string' ? record.borderColor : undefined,
    backgroundColor:
      typeof record.backgroundColor === 'string'
        ? record.backgroundColor
        : undefined,
  }
}

function findTemplateById(
  templates: StyleTemplate[],
  styleTemplateId: string | null | undefined,
) {
  if (!styleTemplateId) return null
  return templates.find((template) => template.id === styleTemplateId) ?? null
}

function createQuickDraft(model: RecipeModel): RecipeStyleDraft {
  const label = getModelLabel(model)
  return {
    sourceTemplateId: null,
    persistedTemplateId: null,
    name: `${label} node`,
    textContent: createTemplateTextContent(label),
    visualStyles: {},
    dimensions: {},
    typeSpecificData: {},
    dirty: true,
    saveState: 'idle',
  }
}

function createDraftFromTemplate(
  model: RecipeModel,
  template: StyleTemplate,
): RecipeStyleDraft {
  return {
    sourceTemplateId: template.id ?? null,
    persistedTemplateId: null,
    name: `${template.name} copy`,
    textContent:
      template.textContent ?? createTemplateTextContent(getModelLabel(model)),
    visualStyles: template.visualStyles ?? {},
    dimensions: template.dimensions ?? {},
    typeSpecificData: template.typeSpecificData ?? {},
    dirty: false,
    saveState: 'idle',
  }
}

export type StyleSelectionContext =
  | { kind: 'group'; model: RecipeModel }
  | { kind: 'model'; model: RecipeModel }
  | { kind: 'none'; model: null }

export function getStyleSelectionContext({
  models,
  selectedCanvasNodeId,
}: {
  models: RecipeModel[]
  selectedCanvasNodeId?: string | null
}): StyleSelectionContext {
  if (!selectedCanvasNodeId) return { kind: 'none', model: null }

  const groupModelId = getModelIdFromBuilderGroupNodeId(selectedCanvasNodeId)
  if (groupModelId) {
    const model = models.find((candidate) => candidate.id === groupModelId)
    if (!model) return { kind: 'none', model: null }
    return {
      kind: 'group',
      model,
    }
  }

  const model = models.find(
    (candidate) => candidate.id === selectedCanvasNodeId,
  )
  if (!model) return { kind: 'none', model: null }
  return {
    kind: 'model',
    model,
  }
}

export function getGroupingEdgesForStyleSelection({
  edges,
  selectionContext,
}: {
  edges: TraversalEdge[]
  selectionContext: StyleSelectionContext
}) {
  if (selectionContext.kind === 'none') return edges

  const modelId = selectionContext.model.id
  if (selectionContext.kind === 'group') {
    return edges.filter((edge) => (edge.fromModelId ?? edge.from) === modelId)
  }

  return edges.filter(
    (edge) =>
      (edge.fromModelId ?? edge.from) === modelId ||
      (edge.toModelId ?? edge.to) === modelId,
  )
}

export function resolveStyleDraftForModelInitialization({
  existingDraft,
  model,
  templates,
  templatesPending,
}: {
  existingDraft: RecipeStyleDraft | undefined
  model: RecipeModel
  templates: StyleTemplate[]
  templatesPending: boolean
}): RecipeStyleDraft | null {
  if (existingDraft) return null

  if (model.styleTemplateId) {
    const template = findTemplateById(templates, model.styleTemplateId)
    if (template) return createDraftFromTemplate(model, template)
    if (templatesPending) return null
  }

  return createQuickDraft(model)
}

// ---------------------------------------------------------------------------
// Dimension controls (local state, commits on blur to avoid remount per keystroke)
// ---------------------------------------------------------------------------

function DimensionInput({
  label,
  min,
  onCommit,
  value,
}: {
  label: string
  min: number
  onCommit: (value: number) => void
  value: number
}) {
  const valueText = String(value)
  const [local, setLocal] = useState(valueText)
  const [prevValue, setPrevValue] = useState(value)

  if (value !== prevValue) {
    setPrevValue(value)
    setLocal(valueText)
  }

  const commitValue = () => {
    const v = parseInt(local, 10)
    if (!isNaN(v) && v >= min) {
      onCommit(v)
    } else {
      setLocal(valueText)
    }
  }

  return (
    <label className="grid gap-1 text-[11px] text-muted-foreground">
      {label}
      <Input
        className="h-7 px-2 font-mono text-[11px]"
        min={min}
        onBlur={commitValue}
        onChange={(event) => setLocal(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commitValue()
        }}
        type="number"
        value={local}
      />
    </label>
  )
}

function DimensionControls({
  height,
  minHeight,
  minWidth,
  onHeightChange,
  onWidthChange,
  width,
}: {
  height: number
  minHeight?: number
  minWidth?: number
  onHeightChange: (value: number) => void
  onWidthChange: (value: number) => void
  width: number
}) {
  const { t } = useTranslation()

  return (
    <div className="grid grid-cols-2 gap-2">
      <DimensionInput
        label={t('builder.style.width')}
        min={minWidth ?? CANVAS_NODE_SHAPES.box.minSize.width}
        onCommit={onWidthChange}
        value={width}
      />
      <DimensionInput
        label={t('builder.style.height')}
        min={minHeight ?? CANVAS_NODE_SHAPES.box.minSize.height}
        onCommit={onHeightChange}
        value={height}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shape + color controls
// ---------------------------------------------------------------------------

function ShapeAndColorControls({
  onBackgroundColorChange,
  onBorderColorChange,
  onShapeChange,
  shapes,
  typeSpecific,
}: {
  onBackgroundColorChange: (color: string) => void
  onBorderColorChange: (color: string) => void
  onShapeChange: (shapeKey: string) => void
  shapes: ShapeEntry[]
  typeSpecific: TypeSpecificData
}) {
  const { t } = useTranslation()
  const currentShape = typeSpecific.shapeKey || 'default'

  return (
    <div className="grid gap-2">
      {/* Shape selector */}
      <label className="grid gap-1 text-[11px] text-muted-foreground">
        {t('builder.style.shape')}
        <Select value={currentShape} onValueChange={onShapeChange}>
          <SelectTrigger className="h-8 text-[12px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {shapes.map((shape) => (
              <SelectItem key={shape.key} value={shape.key}>
                {shape.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>

      {/* Border + Background color */}
      <div className="flex gap-3">
        <label className="grid gap-1 text-[11px] text-muted-foreground">
          {t('builder.style.borderColor')}
          <input
            className="h-7 w-10 rounded-md border border-input bg-transparent p-0.5"
            onChange={(event) => onBorderColorChange(event.target.value)}
            type="color"
            value={getSafeColor(typeSpecific.borderColor ?? '#18181B')}
          />
        </label>
        <label className="grid gap-1 text-[11px] text-muted-foreground">
          {t('builder.style.backgroundColor')}
          <input
            className="h-7 w-10 rounded-md border border-input bg-transparent p-0.5"
            onChange={(event) => onBackgroundColorChange(event.target.value)}
            type="color"
            value={getSafeColor(typeSpecific.backgroundColor ?? '#FFFFFF')}
          />
        </label>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Selected node panel: template + save
// ---------------------------------------------------------------------------

function SelectedNodePanel({
  actions,
  activeDraft,
  activeModel,
  layers,
  onDimensionChange,
  onSave,
  onShapeChange,
  onTemplateChange,
  onTypeSpecificChange,
  saveMutation,
  shapes,
  swatches,
  templates,
}: {
  actions: StyleStepProps['actions']
  activeDraft: RecipeStyleDraft
  activeModel: RecipeModel
  layers: RecipeLayer[]
  onDimensionChange: (key: 'width' | 'height', value: number) => void
  onSave: () => void
  onShapeChange: (shapeKey: string) => void
  onTemplateChange: (value: string) => void
  onTypeSpecificChange: (key: keyof TypeSpecificData, value: string) => void
  saveMutation: { isPending: boolean }
  shapes: ShapeEntry[]
  swatches: string[]
  templates: StyleTemplate[]
}) {
  const { t } = useTranslation()
  const accent = getModelAccent(activeModel, layers, swatches)

  const dims = activeDraft.dimensions as
    { width?: number; height?: number } | null | undefined
  const typeSpecific = readTypeSpecificData(activeDraft.typeSpecificData)
  const activeShape = shapes.find(
    (s) => s.key === (typeSpecific.shapeKey || 'default'),
  )
  const defaultWidth =
    activeShape?.defaultWidth ?? CANVAS_NODE_SHAPES.box.defaultSize.width
  const defaultHeight =
    activeShape?.defaultHeight ?? CANVAS_NODE_SHAPES.box.defaultSize.height
  const nodeWidth = dims?.width || defaultWidth
  const nodeHeight = dims?.height || defaultHeight

  return (
    <div className="grid gap-3 rounded-lg border border-border bg-card p-3">
      {/* Selected node indicator */}
      <div className="flex min-w-0 items-center gap-2">
        <span
          className="size-3.5 rounded border border-border"
          style={{ backgroundColor: accent }}
        />
        <span className="min-w-0 truncate text-[13px] font-semibold">
          {getModelLabel(activeModel)}
        </span>
        <span className="ml-auto min-w-0 max-w-[12rem] truncate font-mono text-[10px] text-muted-foreground">
          {activeModel.modelId}
        </span>
      </div>

      {/* Shape + colors */}
      {shapes.length > 0 && (
        <ShapeAndColorControls
          onBackgroundColorChange={(color) =>
            onTypeSpecificChange('backgroundColor', color)
          }
          onBorderColorChange={(color) =>
            onTypeSpecificChange('borderColor', color)
          }
          onShapeChange={onShapeChange}
          shapes={shapes}
          typeSpecific={typeSpecific}
        />
      )}

      {/* Dimensions */}
      <DimensionControls
        height={nodeHeight}
        onHeightChange={(v) => onDimensionChange('height', v)}
        onWidthChange={(v) => onDimensionChange('width', v)}
        width={nodeWidth}
      />

      {/* Template selector */}
      <label className="grid gap-1 text-[11px] text-muted-foreground">
        {t('builder.style.savedTemplates')}
        <Select
          value={activeModel.styleTemplateId ?? QUICK_STYLE_VALUE}
          onValueChange={onTemplateChange}
        >
          <SelectTrigger className="h-8 text-[12px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={QUICK_STYLE_VALUE}>
              {t('builder.style.quickStyle')}
            </SelectItem>
            {templates.map((template) =>
              template.id ? (
                <SelectItem key={template.id} value={template.id}>
                  {template.name}
                </SelectItem>
              ) : null,
            )}
          </SelectContent>
        </Select>
      </label>

      {/* Template name */}
      <label className="grid gap-1 text-[11px] text-muted-foreground">
        {t('builder.style.nodeTemplateName')}
        <Input
          className="h-7 text-[12px]"
          placeholder={t('builder.style.templateName')}
          value={activeDraft.name}
          onChange={(event) => {
            actions.setStyleDraft(activeModel.id, {
              ...activeDraft,
              name: event.target.value,
              dirty: true,
              saveState: 'idle',
              error: undefined,
            })
          }}
        />
      </label>

      <div className="flex items-center justify-end gap-2">
        {activeDraft.saveState === 'saved' ? (
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <CheckIcon className="size-3" />
            {t('builder.style.saved')}
          </span>
        ) : null}
        <Button
          type="button"
          size="xs"
          disabled={saveMutation.isPending || !activeDraft.name.trim()}
          onClick={onSave}
        >
          <SaveIcon className="size-3" />
          {saveMutation.isPending
            ? t('builder.style.saving')
            : t('builder.style.saveTemplate')}
        </Button>
      </div>

      {activeDraft.error ? (
        <p className="text-[11px] text-destructive">{activeDraft.error}</p>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main StyleStep component
// ---------------------------------------------------------------------------

export function StyleStep({
  actions,
  edges,
  groupRules,
  layers,
  models,
  selectedCanvasNodeId,
  styleDrafts,
  swatches,
}: StyleStepProps) {
  const { t } = useTranslation()
  const layersWithoutNodeContext = useMemo(
    () => getLayersWithoutNodeContext(layers, models),
    [layers, models],
  )
  const queryClient = useQueryClient()

  // The active model is driven by canvas selection. Promoted group nodes map
  // back to their source model so the same style draft persists group labels.
  const selectionContext = useMemo(
    () => getStyleSelectionContext({ models, selectedCanvasNodeId }),
    [selectedCanvasNodeId, models],
  )
  const activeModel = selectionContext.model
  const visibleGroupingEdges = useMemo(
    () =>
      getGroupingEdgesForStyleSelection({
        edges,
        selectionContext,
      }),
    [edges, selectionContext],
  )
  const showGroupingControls = visibleGroupingEdges.length > 0

  const { data: shapes = [] } = useQuery(BUILDER_SCHEMA_QUERIES.shapes())
  const templateQueries = useQueries({
    queries: models.map((model) =>
      BUILDER_SCHEMA_QUERIES.styleTemplates(model.appLabel, model.modelName),
    ),
  })

  const templatesByModelId = useMemo(() => {
    const result = new Map<string, StyleTemplate[]>()
    for (const [index, model] of models.entries()) {
      result.set(model.id, templateQueries[index]?.data ?? [])
    }
    return result
  }, [models, templateQueries])

  const activeTemplates = activeModel
    ? (templatesByModelId.get(activeModel.id) ?? [])
    : []
  const activeModelIndex = activeModel
    ? models.findIndex((model) => model.id === activeModel.id)
    : -1
  const activeDraft = activeModel
    ? (styleDrafts[activeModel.id] ??
      resolveStyleDraftForModelInitialization({
        existingDraft: undefined,
        model: activeModel,
        templates: activeTemplates,
        templatesPending:
          activeModelIndex >= 0
            ? (templateQueries[activeModelIndex]?.isPending ?? false)
            : false,
      }) ??
      createQuickDraft(activeModel))
    : null
  const saveMutation = useMutation({
    mutationFn: async ({
      draft,
      model,
    }: {
      draft: RecipeStyleDraft
      model: RecipeModel
    }) =>
      saveBuilderStyleTemplateDraft({
        draft,
        model,
      }),
    onError: (error, variables) => {
      actions.setStyleDraftSaveState(
        variables.model.id,
        'error',
        error instanceof Error ? error.message : t('builder.style.saveError'),
      )
    },
    onSuccess: (template, variables) => {
      if (!template.id) {
        actions.setStyleDraftSaveState(
          variables.model.id,
          'error',
          t('builder.style.saveError'),
        )
        return
      }
      actions.markStyleDraftSaved(
        variables.model.id,
        {
          ...variables.draft,
          name: template.name,
          textContent: template.textContent ?? variables.draft.textContent,
          visualStyles: template.visualStyles ?? variables.draft.visualStyles,
          dimensions: template.dimensions ?? variables.draft.dimensions,
          typeSpecificData:
            template.typeSpecificData ?? variables.draft.typeSpecificData,
        },
        template.id,
      )
      void queryClient.invalidateQueries({
        queryKey: BUILDER_SCHEMA_QUERIES._base.queryKey,
      })
    },
  })

  function selectTemplate(value: string) {
    if (!activeModel) return
    if (value === QUICK_STYLE_VALUE) {
      actions.setModelStyleTemplate(activeModel.id, null)
      actions.setStyleDraft(activeModel.id, createQuickDraft(activeModel))
      return
    }

    const template = findTemplateById(activeTemplates, value)
    if (!template?.id) return
    actions.setModelStyleTemplate(activeModel.id, template.id)
    actions.setStyleDraft(
      activeModel.id,
      createDraftFromTemplate(activeModel, template),
    )
  }

  function handleDimensionChange(key: 'width' | 'height', value: number) {
    if (!activeModel || !activeDraft) return
    const currentDims = (activeDraft.dimensions ?? {}) as Record<
      string,
      unknown
    >
    actions.setStyleDraft(activeModel.id, {
      ...activeDraft,
      dimensions: { ...currentDims, [key]: value },
      dirty: true,
      saveState: 'idle',
      error: undefined,
    })
  }

  function handleShapeChange(shapeKey: string) {
    if (!activeModel || !activeDraft) return
    const currentTypeSpecific = readTypeSpecificData(
      activeDraft.typeSpecificData,
    )
    const shape = shapes.find((s) => s.key === shapeKey)
    actions.setStyleDraft(activeModel.id, {
      ...activeDraft,
      typeSpecificData: { ...currentTypeSpecific, shapeKey },
      dimensions: {
        width: shape?.defaultWidth ?? CANVAS_NODE_SHAPES.box.defaultSize.width,
        height:
          shape?.defaultHeight ?? CANVAS_NODE_SHAPES.box.defaultSize.height,
      },
      dirty: true,
      saveState: 'idle',
      error: undefined,
    })
  }

  function handleTypeSpecificChange(
    key: keyof TypeSpecificData,
    value: string,
  ) {
    if (!activeModel || !activeDraft) return
    const currentTypeSpecific = readTypeSpecificData(
      activeDraft.typeSpecificData,
    )
    actions.setStyleDraft(activeModel.id, {
      ...activeDraft,
      typeSpecificData: { ...currentTypeSpecific, [key]: value },
      dirty: true,
      saveState: 'idle',
      error: undefined,
    })
  }

  function handleSave() {
    if (!activeModel || !activeDraft || saveMutation.isPending) return
    actions.setStyleDraftSaveState(activeModel.id, 'saving')
    saveMutation.mutate({
      draft: activeDraft,
      model: activeModel,
    })
  }

  if (models.length === 0) {
    return (
      <div className="py-8 text-center text-[12px] text-muted-foreground">
        {t('builder.style.noModels')}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Hint: how to edit */}
      <div className="flex items-start gap-2 rounded-md border border-border bg-muted/30 px-3 py-2.5">
        <MousePointerClickIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="text-[12px] leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground">
            {t('builder.style.inlineHintTitle')}
          </span>{' '}
          {t('builder.style.inlineHintDescription')}
        </div>
      </div>

      {layersWithoutNodeContext.length > 0 ? (
        <div
          role="status"
          className="flex items-start gap-2 rounded-md border border-amber-500/25 bg-amber-500/10 px-3 py-2.5 text-amber-800 dark:text-amber-200"
        >
          <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
          <div className="text-[12px] leading-relaxed">
            <div className="font-medium">
              {t('builder.style.nodeContextWarningTitle')}
            </div>
            <div className="mt-0.5 opacity-90">
              {t('builder.style.nodeContextWarning', {
                count: layersWithoutNodeContext.length,
                layers: layersWithoutNodeContext
                  .map((layer) => layer.label)
                  .join(', '),
              })}
            </div>
          </div>
        </div>
      ) : null}

      {/* Selected node panel — shows when a node is selected on canvas */}
      {activeModel && activeDraft ? (
        <>
          <SelectedNodePanel
            actions={actions}
            activeDraft={activeDraft}
            activeModel={activeModel}
            layers={layers}
            onDimensionChange={handleDimensionChange}
            onSave={handleSave}
            onShapeChange={handleShapeChange}
            onTemplateChange={selectTemplate}
            onTypeSpecificChange={handleTypeSpecificChange}
            saveMutation={saveMutation}
            shapes={shapes}
            swatches={swatches}
            templates={activeTemplates}
          />

          {showGroupingControls ? (
            <GroupingControls
              actions={actions}
              edges={visibleGroupingEdges}
              groupRules={groupRules}
              models={models}
            />
          ) : null}
        </>
      ) : (
        <>
          {showGroupingControls ? (
            <GroupingControls
              actions={actions}
              edges={visibleGroupingEdges}
              groupRules={groupRules}
              models={models}
            />
          ) : null}
          <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-[12px] text-muted-foreground">
            {t('builder.style.selectNodeHint')}
          </div>
        </>
      )}

      {templateQueries.some((query) => query.isError) ? (
        <p className="text-[11px] text-destructive">
          {t('builder.style.templateLoadError')}
        </p>
      ) : null}
    </div>
  )
}
