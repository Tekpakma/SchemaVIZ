import { useMemo } from 'react'

import type { GenerationTemplateRead } from '@/api/contracts'
import {
  getBuilderActionsSnapshot,
  useBuilderActions,
  useBuilderDocument,
  useBuilderSteps,
} from '@/store/builderStore'
import {
  getWorkbenchActionsSnapshot,
  useWorkbenchActions,
} from '@/store/workbenchStore'
import type { WorkbenchTabId } from '@/store/workbenchStore'
import type { CanvasGroupLayoutPolicy } from '@/features/canvas/model/types'
import type {
  ExampleRecord,
  LayoutAlgorithm,
  RecipeData,
  RecipeFilter,
  RecipeGroupRule,
  RecipeLayer,
  RecipeLayoutDirection,
  RecipeModel,
  RecipeStyleDraft,
  RecipeStyleDraftSaveState,
  TraversalEdge,
} from './types'
import { createBlankRecipe, createRecipeFromTemplate } from './templateRecipe'

const DEFAULT_BUILDER_DRAFT_LOCAL_ID = 'default'
const UNTITLED_BUILDER_TITLE = 'Untitled template'

export type BuilderDocumentActions = {
  setActiveStep: (index: number) => void
  nextStep: () => void
  prevStep: () => void
  setTitle: (title: string) => void
  addLayer: (layer: RecipeLayer) => void
  removeLayer: (id: string) => void
  renameLayer: (id: string, label: string) => void
  reorderLayers: (layers: RecipeLayer[]) => void
  addModel: (model: RecipeModel) => void
  removeModel: (id: string) => void
  reorderModels: (models: RecipeModel[]) => void
  setModelLayer: (modelId: string, layerId: string) => void
  setModelStyleTemplate: (
    modelId: string,
    styleTemplateId: string | null,
  ) => void
  clearStyleDraft: (modelId: string) => void
  markStyleDraftSaved: (
    modelId: string,
    draft: RecipeStyleDraft,
    styleTemplateId: string,
  ) => void
  setStyleDraft: (modelId: string, draft: RecipeStyleDraft) => void
  setStyleDraftSaveState: (
    modelId: string,
    saveState: RecipeStyleDraftSaveState,
    error?: string,
  ) => void
  addExample: (example: ExampleRecord) => void
  removeExample: (id: string) => void
  setDefaultExample: (id: string) => void
  setActiveExample: (id: string | null) => void
  addEdge: (edge: TraversalEdge) => void
  removeEdge: (id: string) => void
  toggleEdgeAuto: (id: string) => void
  addFilter: (filter: RecipeFilter) => void
  removeFilter: (id: string) => void
  addGroupRule: (rule: RecipeGroupRule) => void
  removeGroupRule: (id: string) => void
  setGroupLayout: (groupLayout: CanvasGroupLayoutPolicy) => void
  setLayoutAlgorithm: (algorithm: LayoutAlgorithm) => void
  setLayoutDirection: (direction: RecipeLayoutDirection) => void
}

export type BuilderOpenIntent =
  | {
      type: 'draft'
      localId?: string
    }
  | {
      type: 'template'
      template: GenerationTemplateRead
    }

function getBuilderTabTitle(title: string) {
  return title.trim() || UNTITLED_BUILDER_TITLE
}

export function seedBuilderDocumentForTab(
  tabId: WorkbenchTabId,
  recipe: RecipeData,
) {
  const didSeed = getBuilderActionsSnapshot().seedDocument(tabId, recipe)

  if (didSeed) {
    getWorkbenchActionsSnapshot().renameTab(
      tabId,
      getBuilderTabTitle(recipe.title),
    )
  }

  return didSeed
}

export function openBuilderDraftTab(localId = DEFAULT_BUILDER_DRAFT_LOCAL_ID) {
  const tabId = getWorkbenchActionsSnapshot().openTab({
    kind: 'generation-builder',
    title: UNTITLED_BUILDER_TITLE,
    resource: {
      type: 'draft',
      localId,
    },
  })

  seedBuilderDocumentForTab(tabId, createBlankRecipe())

  return tabId
}

export function openDefaultBuilderDraftTab() {
  return openBuilderDraftTab()
}

export function openBuilderTemplateTab(template: GenerationTemplateRead) {
  const tabId = getWorkbenchActionsSnapshot().openTab({
    kind: 'generation-builder',
    title: template.name,
    resource: {
      type: 'template',
      id: template.id,
    },
  })

  seedBuilderDocumentForTab(tabId, createRecipeFromTemplate(template))

  return tabId
}

export function setBuilderDocumentTitle(tabId: WorkbenchTabId, title: string) {
  getBuilderActionsSnapshot().setTitle(tabId, title)
  getWorkbenchActionsSnapshot().renameTab(tabId, getBuilderTabTitle(title))
  getWorkbenchActionsSnapshot().markDirty(tabId)
}

export function markBuilderTemplateSaved(
  tabId: WorkbenchTabId,
  template: GenerationTemplateRead,
) {
  const workbenchActions = getWorkbenchActionsSnapshot()
  workbenchActions.retargetTab(
    tabId,
    {
      type: 'template',
      id: template.id,
    },
    getBuilderTabTitle(template.name),
  )
  workbenchActions.markDirty(tabId, false)
}

export function openBuilderTabFromIntent(intent: BuilderOpenIntent) {
  if (intent.type === 'template') {
    return openBuilderTemplateTab(intent.template)
  }

  return openBuilderDraftTab(intent.localId)
}

export function getBuilderOpenIntentKey(intent: BuilderOpenIntent) {
  if (intent.type === 'template') {
    return `template:${intent.template.id}`
  }

  return `draft:${intent.localId ?? DEFAULT_BUILDER_DRAFT_LOCAL_ID}`
}

export function useBuilderDocumentView(tabId: WorkbenchTabId | null) {
  const document = useBuilderDocument(tabId)
  const steps = useBuilderSteps()
  const builderActions = useBuilderActions()
  const workbenchActions = useWorkbenchActions()

  return useMemo(() => {
    if (!tabId || !document) return null
    const activeStepIndex = Math.min(
      document.activeStepIndex,
      Math.max(steps.length - 1, 0),
    )
    const activeStep = steps[activeStepIndex]
    if (!activeStep) return null

    const markDirty = () => {
      workbenchActions.markDirty(tabId)
    }

    return {
      tabId,
      activeExampleId: document.activeExampleId,
      activeStep,
      activeStepIndex,
      recipe: document.recipe,
      steps,
      actions: {
        setActiveStep: (index: number) => {
          builderActions.setActiveStep(tabId, index)
        },
        nextStep: () => {
          builderActions.nextStep(tabId)
        },
        prevStep: () => {
          builderActions.prevStep(tabId)
        },
        setTitle: (title: string) => {
          setBuilderDocumentTitle(tabId, title)
        },
        addLayer: (layer: RecipeLayer) => {
          builderActions.addLayer(tabId, layer)
          markDirty()
        },
        removeLayer: (id: string) => {
          builderActions.removeLayer(tabId, id)
          markDirty()
        },
        renameLayer: (id: string, label: string) => {
          builderActions.renameLayer(tabId, id, label)
          markDirty()
        },
        reorderLayers: (layers: RecipeLayer[]) => {
          builderActions.reorderLayers(tabId, layers)
          markDirty()
        },
        addModel: (model: RecipeModel) => {
          builderActions.addModel(tabId, model)
          markDirty()
        },
        removeModel: (id: string) => {
          builderActions.removeModel(tabId, id)
          markDirty()
        },
        reorderModels: (models: RecipeModel[]) => {
          builderActions.reorderModels(tabId, models)
          markDirty()
        },
        setModelLayer: (modelId: string, layerId: string) => {
          builderActions.setModelLayer(tabId, modelId, layerId)
          markDirty()
        },
        setModelStyleTemplate: (
          modelId: string,
          styleTemplateId: string | null,
        ) => {
          builderActions.setModelStyleTemplate(tabId, modelId, styleTemplateId)
          markDirty()
        },
        clearStyleDraft: (modelId: string) => {
          builderActions.clearStyleDraft(tabId, modelId)
          markDirty()
        },
        markStyleDraftSaved: (
          modelId: string,
          draft: RecipeStyleDraft,
          styleTemplateId: string,
        ) => {
          builderActions.markStyleDraftSaved(
            tabId,
            modelId,
            draft,
            styleTemplateId,
          )
          markDirty()
        },
        setStyleDraft: (modelId: string, draft: RecipeStyleDraft) => {
          builderActions.setStyleDraft(tabId, modelId, draft)
          markDirty()
        },
        setStyleDraftSaveState: (
          modelId: string,
          saveState: RecipeStyleDraftSaveState,
          error?: string,
        ) => {
          builderActions.setStyleDraftSaveState(
            tabId,
            modelId,
            saveState,
            error,
          )
        },
        addExample: (example: ExampleRecord) => {
          builderActions.addExample(tabId, example)
          markDirty()
        },
        removeExample: (id: string) => {
          builderActions.removeExample(tabId, id)
          markDirty()
        },
        setDefaultExample: (id: string) => {
          builderActions.setDefaultExample(tabId, id)
          markDirty()
        },
        setActiveExample: (id: string | null) => {
          builderActions.setActiveExample(tabId, id)
        },
        addEdge: (edge: TraversalEdge) => {
          builderActions.addEdge(tabId, edge)
          markDirty()
        },
        removeEdge: (id: string) => {
          builderActions.removeEdge(tabId, id)
          markDirty()
        },
        toggleEdgeAuto: (id: string) => {
          builderActions.toggleEdgeAuto(tabId, id)
          markDirty()
        },
        addFilter: (filter: RecipeFilter) => {
          builderActions.addFilter(tabId, filter)
          markDirty()
        },
        removeFilter: (id: string) => {
          builderActions.removeFilter(tabId, id)
          markDirty()
        },
        addGroupRule: (rule: RecipeGroupRule) => {
          builderActions.addGroupRule(tabId, rule)
          markDirty()
        },
        removeGroupRule: (id: string) => {
          builderActions.removeGroupRule(tabId, id)
          markDirty()
        },
        setGroupLayout: (groupLayout: CanvasGroupLayoutPolicy) => {
          builderActions.setGroupLayout(tabId, groupLayout)
          markDirty()
        },
        setLayoutAlgorithm: (algorithm: LayoutAlgorithm) => {
          builderActions.setLayoutAlgorithm(tabId, algorithm)
          markDirty()
        },
        setLayoutDirection: (direction: RecipeLayoutDirection) => {
          builderActions.setLayoutDirection(tabId, direction)
          markDirty()
        },
      } satisfies BuilderDocumentActions,
    }
  }, [builderActions, document, steps, tabId, workbenchActions])
}
