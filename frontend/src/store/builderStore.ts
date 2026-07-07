import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import type {
  ExampleRecord,
  LayoutAlgorithm,
  RecipeData,
  RecipeFilter,
  RecipeGroupRule,
  RecipeLayer,
  RecipeLayoutDirection,
  RecipeModel,
  RecipeStep,
  RecipeStyleDraft,
  RecipeStyleDraftSaveState,
  TraversalEdge,
} from '@/features/builder/types'
import { DEFAULT_RECIPE_GROUP_LAYOUT } from '@/features/builder/types'
import type { CanvasGroupLayoutPolicy } from '@/features/canvas/model/types'
import {
  DEFAULT_SWATCHES,
  createDefaultLayer,
  createRecipeLayer,
  ensureRecipeHasLayer,
} from '@/features/builder/recipeDefaults'
import type { WorkbenchTabId } from './workbenchStore'

const RECIPE_STEPS: RecipeStep[] = [
  {
    id: 's1',
    kind: 'layers',
    title: 'builder.steps.layers.title',
    detail: 'builder.steps.layers.detail',
  },
  {
    id: 's2',
    kind: 'traversal',
    title: 'builder.steps.traversal.title',
    detail: 'builder.steps.traversal.detail',
  },
  {
    id: 's3',
    kind: 'filters',
    title: 'builder.steps.filters.title',
    detail: 'builder.steps.filters.detail',
  },
  {
    id: 's4',
    kind: 'style',
    title: 'builder.steps.style.title',
    detail: 'builder.steps.style.detail',
  },
  {
    id: 's5',
    kind: 'layout',
    title: 'builder.steps.layout.title',
    detail: 'builder.steps.layout.detail',
  },
]

export type BuilderDocumentState = {
  activeExampleId: string | null
  activeStepIndex: number
  recipe: RecipeData
  isSeeded: boolean
}

type BuilderState = {
  documentsByTabId: Record<WorkbenchTabId, BuilderDocumentState>
  steps: RecipeStep[]
  actions: BuilderActions
}

type BuilderActions = {
  ensureDocument: (tabId: WorkbenchTabId) => void
  seedDocument: (tabId: WorkbenchTabId, recipe: RecipeData) => boolean
  setActiveStep: (tabId: WorkbenchTabId, index: number) => void
  nextStep: (tabId: WorkbenchTabId) => void
  prevStep: (tabId: WorkbenchTabId) => void
  setTitle: (tabId: WorkbenchTabId, title: string) => void

  addLayer: (tabId: WorkbenchTabId, layer: RecipeLayer) => void
  removeLayer: (tabId: WorkbenchTabId, id: string) => void
  renameLayer: (tabId: WorkbenchTabId, id: string, label: string) => void
  setLayerTextContent: (
    tabId: WorkbenchTabId,
    id: string,
    textContent: unknown,
  ) => void
  reorderLayers: (tabId: WorkbenchTabId, layers: RecipeLayer[]) => void
  addModel: (tabId: WorkbenchTabId, model: RecipeModel) => void
  removeModel: (tabId: WorkbenchTabId, id: string) => void
  reorderModels: (tabId: WorkbenchTabId, models: RecipeModel[]) => void
  setModelLayer: (
    tabId: WorkbenchTabId,
    modelId: string,
    layerId: string,
  ) => void
  setModelStyleTemplate: (
    tabId: WorkbenchTabId,
    modelId: string,
    styleTemplateId: string | null,
  ) => void
  clearStyleDraft: (tabId: WorkbenchTabId, modelId: string) => void
  markStyleDraftSaved: (
    tabId: WorkbenchTabId,
    modelId: string,
    draft: RecipeStyleDraft,
    styleTemplateId: string,
  ) => void
  setStyleDraft: (
    tabId: WorkbenchTabId,
    modelId: string,
    draft: RecipeStyleDraft,
  ) => void
  setStyleDraftSaveState: (
    tabId: WorkbenchTabId,
    modelId: string,
    saveState: RecipeStyleDraftSaveState,
    error?: string,
  ) => void

  addExample: (tabId: WorkbenchTabId, example: ExampleRecord) => void
  removeExample: (tabId: WorkbenchTabId, id: string) => void
  setDefaultExample: (tabId: WorkbenchTabId, id: string) => void
  setActiveExample: (tabId: WorkbenchTabId, id: string | null) => void

  addEdge: (tabId: WorkbenchTabId, edge: TraversalEdge) => void
  removeEdge: (tabId: WorkbenchTabId, id: string) => void
  toggleEdgeAuto: (tabId: WorkbenchTabId, id: string) => void

  addFilter: (tabId: WorkbenchTabId, filter: RecipeFilter) => void
  removeFilter: (tabId: WorkbenchTabId, id: string) => void

  addGroupRule: (tabId: WorkbenchTabId, rule: RecipeGroupRule) => void
  removeGroupRule: (tabId: WorkbenchTabId, id: string) => void

  setGroupLayout: (
    tabId: WorkbenchTabId,
    groupLayout: CanvasGroupLayoutPolicy,
  ) => void
  setLayoutAlgorithm: (
    tabId: WorkbenchTabId,
    algorithm: LayoutAlgorithm,
  ) => void
  setLayoutDirection: (
    tabId: WorkbenchTabId,
    direction: RecipeLayoutDirection,
  ) => void
}

function createInitialRecipe(): RecipeData {
  return {
    title: '',
    layers: [createDefaultLayer()],
    models: [],
    examples: [],
    edges: [],
    filters: [],
    groupRules: [],
    groupLayout: { ...DEFAULT_RECIPE_GROUP_LAYOUT },
    styleDrafts: {},
    swatches: [...DEFAULT_SWATCHES],
    layoutAlgorithm: 'Layered',
    layoutDirection: 'LR',
    shareSlug: '',
    promoteTarget: '',
    promoteVisibility: 'shared',
    promoteAudience: '',
  }
}

function cloneRecipe(recipe: RecipeData): RecipeData {
  const groupLayout =
    (recipe as Partial<RecipeData>).groupLayout ?? DEFAULT_RECIPE_GROUP_LAYOUT
  const layoutDirection =
    (recipe as Partial<RecipeData>).layoutDirection ?? 'LR'
  const clonedRecipe: RecipeData = {
    ...recipe,
    layers: ensureRecipeHasLayer(recipe.layers),
    models: [],
    examples: recipe.examples.map((example) => ({ ...example })),
    edges: recipe.edges.map((edge) => ({ ...edge })),
    filters: recipe.filters.map((filter) => ({ ...filter })),
    groupRules: recipe.groupRules.map((rule) => ({
      ...rule,
      layout: cloneJsonValue(rule.layout),
    })),
    groupLayout: cloneJsonValue(groupLayout),
    styleDrafts: cloneStyleDrafts(recipe.styleDrafts),
    swatches: [...recipe.swatches],
    layoutDirection,
  }
  clonedRecipe.models = normalizeModelsForLayerRules(
    clonedRecipe,
    recipe.models,
  )
  return clonedRecipe
}

function cloneJsonValue<T>(value: T): T {
  if (value == null) return value

  try {
    return JSON.parse(JSON.stringify(value)) as T
  } catch {
    return value
  }
}

function cloneStyleDraft(draft: RecipeStyleDraft): RecipeStyleDraft {
  return {
    ...draft,
    textContent: cloneJsonValue(draft.textContent),
    visualStyles: cloneJsonValue(draft.visualStyles),
    dimensions: cloneJsonValue(draft.dimensions),
    typeSpecificData: cloneJsonValue(draft.typeSpecificData),
  }
}

function cloneStyleDrafts(
  styleDrafts: Record<string, RecipeStyleDraft>,
): Record<string, RecipeStyleDraft> {
  return Object.fromEntries(
    Object.entries(styleDrafts).map(([modelId, draft]) => [
      modelId,
      cloneStyleDraft(draft),
    ]),
  )
}

function createBuilderDocumentState(
  recipe = createInitialRecipe(),
): BuilderDocumentState {
  return {
    activeExampleId: null,
    activeStepIndex: 0,
    recipe: cloneRecipe(recipe),
    isSeeded: false,
  }
}

function createInitialBuilderState() {
  return {
    documentsByTabId: {},
    steps: RECIPE_STEPS,
  }
}

function getBuilderDocument(
  state: BuilderState,
  tabId: WorkbenchTabId | null | undefined,
) {
  return tabId ? state.documentsByTabId[tabId] : null
}

function ensureBuilderDocument(
  state: BuilderState,
  tabId: WorkbenchTabId,
): BuilderDocumentState {
  state.documentsByTabId[tabId] ??= createBuilderDocumentState()
  return state.documentsByTabId[tabId]
}

function ensureSecondaryLayer(recipe: RecipeData) {
  if (recipe.layers.length > 1) return recipe.layers[1]!.id

  const layer = createRecipeLayer(`L${recipe.layers.length + 1}`)
  recipe.layers.push(layer)
  return layer.id
}

function normalizeModelsForLayerRules(
  recipe: RecipeData,
  models: RecipeModel[],
) {
  const layers = ensureRecipeHasLayer(recipe.layers)
  recipe.layers = layers

  const validLayerIds = new Set(layers.map((layer) => layer.id))
  const startLayerId = layers[0]!.id
  let hasStartModel = false

  return models.map((model) => {
    const requestedLayerId = validLayerIds.has(model.layerId)
      ? model.layerId
      : startLayerId

    if (requestedLayerId !== startLayerId) {
      return { ...model, layerId: requestedLayerId }
    }

    if (!hasStartModel) {
      hasStartModel = true
      return { ...model, layerId: startLayerId }
    }

    return {
      ...model,
      layerId: ensureSecondaryLayer(recipe),
    }
  })
}

function canPlaceModelInLayer(
  recipe: RecipeData,
  modelId: string | null,
  layerId: string,
) {
  const startLayerId = recipe.layers[0]?.id
  if (layerId !== startLayerId) return true

  return !recipe.models.some(
    (model) => model.layerId === startLayerId && model.id !== modelId,
  )
}

function seedBuilderDocument(
  state: BuilderState,
  tabId: WorkbenchTabId,
  recipe: RecipeData,
): boolean {
  const document = ensureBuilderDocument(state, tabId)
  if (document.isSeeded) return false

  document.recipe = cloneRecipe(recipe)
  document.isSeeded = true
  return true
}

const useBuilderStore = create<BuilderState>()(
  devtools(
    immer((set) => ({
      ...createInitialBuilderState(),
      actions: {
        ensureDocument: (tabId) =>
          set(
            (state) => {
              ensureBuilderDocument(state, tabId)
            },
            false,
            'builder/ensureDocument',
          ),

        seedDocument: (tabId, recipe) => {
          let didSeed = false
          set(
            (state) => {
              didSeed = seedBuilderDocument(state, tabId, recipe)
            },
            false,
            'builder/seedDocument',
          )

          return didSeed
        },

        setActiveStep: (tabId, index) =>
          set(
            (state) => {
              const document = ensureBuilderDocument(state, tabId)
              document.activeStepIndex = Math.max(
                0,
                Math.min(index, state.steps.length - 1),
              )
            },
            false,
            'builder/setActiveStep',
          ),

        nextStep: (tabId) =>
          set(
            (state) => {
              const document = ensureBuilderDocument(state, tabId)
              document.activeStepIndex = Math.min(
                document.activeStepIndex + 1,
                state.steps.length - 1,
              )
            },
            false,
            'builder/nextStep',
          ),

        prevStep: (tabId) =>
          set(
            (state) => {
              const document = ensureBuilderDocument(state, tabId)
              document.activeStepIndex = Math.max(
                document.activeStepIndex - 1,
                0,
              )
            },
            false,
            'builder/prevStep',
          ),

        setTitle: (tabId, title) =>
          set(
            (state) => {
              ensureBuilderDocument(state, tabId).recipe.title = title
            },
            false,
            'builder/setTitle',
          ),

        addLayer: (tabId, layer) =>
          set(
            (state) => {
              ensureBuilderDocument(state, tabId).recipe.layers.push({
                ...layer,
              })
            },
            false,
            'builder/addLayer',
          ),

        removeLayer: (tabId, id) =>
          set(
            (state) => {
              const document = ensureBuilderDocument(state, tabId)

              // Always keep at least one layer
              if (document.recipe.layers.length <= 1) return

              document.recipe.layers = document.recipe.layers.filter(
                (layer) => layer.id !== id,
              )

              document.recipe.models = normalizeModelsForLayerRules(
                document.recipe,
                document.recipe.models.map((model) =>
                  model.layerId === id
                    ? { ...model, layerId: document.recipe.layers[0]!.id }
                    : model,
                ),
              )
            },
            false,
            'builder/removeLayer',
          ),

        renameLayer: (tabId, id, label) =>
          set(
            (state) => {
              const document = ensureBuilderDocument(state, tabId)
              const layer = document.recipe.layers.find((l) => l.id === id)
              if (layer) layer.label = label
            },
            false,
            'builder/renameLayer',
          ),

        setLayerTextContent: (tabId, id, textContent) =>
          set(
            (state) => {
              const document = ensureBuilderDocument(state, tabId)
              const layer = document.recipe.layers.find((l) => l.id === id)
              if (layer) layer.textContent = textContent
            },
            false,
            'builder/setLayerTextContent',
          ),

        reorderLayers: (tabId, layers) =>
          set(
            (state) => {
              const document = ensureBuilderDocument(state, tabId)
              document.recipe.layers = ensureRecipeHasLayer(layers)

              const layerIds = new Set(
                document.recipe.layers.map((layer) => layer.id),
              )
              const fallbackLayerId = document.recipe.layers[0]!.id
              document.recipe.models = normalizeModelsForLayerRules(
                document.recipe,
                document.recipe.models.map((model) =>
                  layerIds.has(model.layerId)
                    ? model
                    : { ...model, layerId: fallbackLayerId },
                ),
              )
            },
            false,
            'builder/reorderLayers',
          ),

        addModel: (tabId, model) =>
          set(
            (state) => {
              const document = ensureBuilderDocument(state, tabId)
              const layerIds = new Set(
                document.recipe.layers.map((layer) => layer.id),
              )
              const layerId = layerIds.has(model.layerId)
                ? model.layerId
                : document.recipe.layers[0]!.id
              if (!canPlaceModelInLayer(document.recipe, null, layerId)) return

              document.recipe.models.push({
                ...model,
                layerId,
              })
            },
            false,
            'builder/addModel',
          ),

        removeModel: (tabId, id) =>
          set(
            (state) => {
              const document = ensureBuilderDocument(state, tabId)
              document.recipe.models = document.recipe.models.filter(
                (model) => model.id !== id,
              )
              document.recipe.edges = document.recipe.edges.filter(
                (edge) => edge.fromModelId !== id && edge.toModelId !== id,
              )
              document.recipe.filters = document.recipe.filters.filter(
                (filter) => filter.modelId !== id,
              )
            },
            false,
            'builder/removeModel',
          ),

        reorderModels: (tabId, models) =>
          set(
            (state) => {
              const document = ensureBuilderDocument(state, tabId)
              document.recipe.models = normalizeModelsForLayerRules(
                document.recipe,
                models,
              )
            },
            false,
            'builder/reorderModels',
          ),

        setModelLayer: (tabId, modelId, layerId) =>
          set(
            (state) => {
              const document = ensureBuilderDocument(state, tabId)
              if (!canPlaceModelInLayer(document.recipe, modelId, layerId)) {
                return
              }
              const model = document.recipe.models.find(
                (candidate) => candidate.id === modelId,
              )
              if (model) model.layerId = layerId
            },
            false,
            'builder/setModelLayer',
          ),

        setModelStyleTemplate: (tabId, modelId, styleTemplateId) =>
          set(
            (state) => {
              const model = ensureBuilderDocument(
                state,
                tabId,
              ).recipe.models.find((candidate) => candidate.id === modelId)
              if (model) {
                model.styleTemplateId = styleTemplateId
              }
            },
            false,
            'builder/setModelStyleTemplate',
          ),

        clearStyleDraft: (tabId, modelId) =>
          set(
            (state) => {
              delete ensureBuilderDocument(state, tabId).recipe.styleDrafts[
                modelId
              ]
            },
            false,
            'builder/clearStyleDraft',
          ),

        markStyleDraftSaved: (tabId, modelId, draft, styleTemplateId) =>
          set(
            (state) => {
              const document = ensureBuilderDocument(state, tabId)
              const model = document.recipe.models.find(
                (candidate) => candidate.id === modelId,
              )
              if (model) model.styleTemplateId = styleTemplateId
              document.recipe.styleDrafts[modelId] = {
                ...cloneStyleDraft(draft),
                persistedTemplateId: styleTemplateId,
                sourceTemplateId: draft.sourceTemplateId,
                dirty: false,
                saveState: 'saved',
                error: undefined,
              }
            },
            false,
            'builder/markStyleDraftSaved',
          ),

        setStyleDraft: (tabId, modelId, draft) =>
          set(
            (state) => {
              ensureBuilderDocument(state, tabId).recipe.styleDrafts[modelId] =
                cloneStyleDraft(draft)
            },
            false,
            'builder/setStyleDraft',
          ),

        setStyleDraftSaveState: (tabId, modelId, saveState, error) =>
          set(
            (state) => {
              const draft = ensureBuilderDocument(state, tabId).recipe
                .styleDrafts[modelId]
              if (!draft) return
              draft.saveState = saveState
              draft.error = error
            },
            false,
            'builder/setStyleDraftSaveState',
          ),

        addExample: (tabId, example) =>
          set(
            (state) => {
              ensureBuilderDocument(state, tabId).recipe.examples.push({
                ...example,
              })
            },
            false,
            'builder/addExample',
          ),

        removeExample: (tabId, id) =>
          set(
            (state) => {
              const document = ensureBuilderDocument(state, tabId)
              document.recipe.examples = document.recipe.examples.filter(
                (example) => example.id !== id,
              )
            },
            false,
            'builder/removeExample',
          ),

        setDefaultExample: (tabId, id) =>
          set(
            (state) => {
              for (const example of ensureBuilderDocument(state, tabId).recipe
                .examples) {
                example.isDefault = example.id === id
              }
            },
            false,
            'builder/setDefaultExample',
          ),

        setActiveExample: (tabId, id) =>
          set(
            (state) => {
              ensureBuilderDocument(state, tabId).activeExampleId = id
            },
            false,
            'builder/setActiveExample',
          ),

        addEdge: (tabId, edge) =>
          set(
            (state) => {
              ensureBuilderDocument(state, tabId).recipe.edges.push({ ...edge })
            },
            false,
            'builder/addEdge',
          ),

        removeEdge: (tabId, id) =>
          set(
            (state) => {
              const document = ensureBuilderDocument(state, tabId)
              document.recipe.edges = document.recipe.edges.filter(
                (edge) => edge.id !== id,
              )
            },
            false,
            'builder/removeEdge',
          ),

        toggleEdgeAuto: (tabId, id) =>
          set(
            (state) => {
              const edge = ensureBuilderDocument(
                state,
                tabId,
              ).recipe.edges.find((candidate) => candidate.id === id)
              if (edge) edge.auto = !edge.auto
            },
            false,
            'builder/toggleEdgeAuto',
          ),

        addFilter: (tabId, filter) =>
          set(
            (state) => {
              ensureBuilderDocument(state, tabId).recipe.filters.push({
                ...filter,
              })
            },
            false,
            'builder/addFilter',
          ),

        removeFilter: (tabId, id) =>
          set(
            (state) => {
              const document = ensureBuilderDocument(state, tabId)
              document.recipe.filters = document.recipe.filters.filter(
                (filter) => filter.id !== id,
              )
            },
            false,
            'builder/removeFilter',
          ),

        addGroupRule: (tabId, rule) =>
          set(
            (state) => {
              const document = ensureBuilderDocument(state, tabId)
              document.recipe.groupRules = document.recipe.groupRules.filter(
                (existing) =>
                  existing.parentModelId !== rule.parentModelId ||
                  existing.childModelId !== rule.childModelId ||
                  existing.via !== rule.via,
              )
              document.recipe.groupRules.push({
                ...rule,
                layout: cloneJsonValue(rule.layout),
              })
            },
            false,
            'builder/addGroupRule',
          ),
        removeGroupRule: (tabId, id) =>
          set(
            (state) => {
              const document = ensureBuilderDocument(state, tabId)
              document.recipe.groupRules = document.recipe.groupRules.filter(
                (rule) => rule.id !== id,
              )
            },
            false,
            'builder/removeGroupRule',
          ),

        setGroupLayout: (tabId, groupLayout) =>
          set(
            (state) => {
              const document = ensureBuilderDocument(state, tabId)
              document.recipe.groupLayout = cloneJsonValue(groupLayout)
              document.recipe.groupRules = document.recipe.groupRules.map(
                (rule) =>
                  rule.mode === 'group'
                    ? {
                        ...rule,
                        layout: cloneJsonValue(groupLayout),
                      }
                    : rule,
              )
            },
            false,
            'builder/setGroupLayout',
          ),

        setLayoutAlgorithm: (tabId, algorithm) =>
          set(
            (state) => {
              ensureBuilderDocument(state, tabId).recipe.layoutAlgorithm =
                algorithm
            },
            false,
            'builder/setLayoutAlgorithm',
          ),

        setLayoutDirection: (tabId, direction) =>
          set(
            (state) => {
              ensureBuilderDocument(state, tabId).recipe.layoutDirection =
                direction
            },
            false,
            'builder/setLayoutDirection',
          ),
      },
    })),
    {
      name: 'BuilderStore',
      enabled: import.meta.env.DEV,
    },
  ),
)

export function getBuilderActionsSnapshot() {
  return useBuilderStore.getState().actions
}

export function getBuilderDocumentSnapshot(tabId: WorkbenchTabId) {
  const document = getBuilderDocument(useBuilderStore.getState(), tabId)
  return document
    ? {
        activeStepIndex: document.activeStepIndex,
        recipe: cloneRecipe(document.recipe),
        isSeeded: document.isSeeded,
      }
    : null
}

export function getBuilderRecipeSnapshot(tabId: WorkbenchTabId) {
  const document = getBuilderDocumentSnapshot(tabId)
  if (!document) return null

  return document.recipe
}

export function getBuilderActiveStepIndexSnapshot(tabId: WorkbenchTabId) {
  return getBuilderDocument(useBuilderStore.getState(), tabId)?.activeStepIndex
}

export function resetBuilderStoreForTests() {
  useBuilderStore.setState((state) => ({
    ...state,
    ...createInitialBuilderState(),
  }))
}

export const useBuilderActions = () => useBuilderStore((state) => state.actions)
export const useBuilderSteps = () => useBuilderStore((state) => state.steps)

export function useBuilderDocument(tabId: WorkbenchTabId | null | undefined) {
  return useBuilderStore((state) => getBuilderDocument(state, tabId))
}

export function useBuilderDocumentSelector<T>(
  tabId: WorkbenchTabId | null | undefined,
  selector: (state: BuilderState, document: BuilderDocumentState) => T,
  fallback: T,
) {
  return useBuilderStore((state) => {
    const document = getBuilderDocument(state, tabId)
    return document ? selector(state, document) : fallback
  })
}
