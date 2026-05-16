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
import type {
  ExampleRecord,
  LayoutAlgorithm,
  RecipeData,
  RecipeFilter,
  RecipeLayer,
  RecipeModel,
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
  reorderLayers: (layers: RecipeLayer[]) => void
  addModel: (model: RecipeModel) => void
  removeModel: (id: string) => void
  reorderModels: (models: RecipeModel[]) => void
  setModelLayer: (modelId: string, layerId: string) => void
  addExample: (example: ExampleRecord) => void
  removeExample: (id: string) => void
  setDefaultExample: (id: string) => void
  setActiveExample: (id: string | null) => void
  addEdge: (edge: TraversalEdge) => void
  removeEdge: (id: string) => void
  toggleEdgeAuto: (id: string) => void
  addFilter: (filter: RecipeFilter) => void
  removeFilter: (id: string) => void
  setSwatch: (index: number, color: string) => void
  setLayoutAlgorithm: (algorithm: LayoutAlgorithm) => void
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

    const markDirty = () => {
      workbenchActions.markDirty(tabId)
    }

    return {
      tabId,
      activeExampleId: document.activeExampleId,
      activeStep: steps[document.activeStepIndex]!,
      activeStepIndex: document.activeStepIndex,
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
        setSwatch: (index: number, color: string) => {
          builderActions.setSwatch(tabId, index, color)
          markDirty()
        },
        setLayoutAlgorithm: (algorithm: LayoutAlgorithm) => {
          builderActions.setLayoutAlgorithm(tabId, algorithm)
          markDirty()
        },
      } satisfies BuilderDocumentActions,
    }
  }, [builderActions, document, steps, tabId, workbenchActions])
}
