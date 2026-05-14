import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import type {
  ExampleRecord,
  LayoutAlgorithm,
  RecipeData,
  RecipeFilter,
  RecipeLayer,
  RecipeStep,
  TraversalEdge,
} from '@/features/builder/types'
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
    kind: 'examples',
    title: 'builder.steps.examples.title',
    detail: 'builder.steps.examples.detail',
  },
  {
    id: 's4',
    kind: 'filters',
    title: 'builder.steps.filters.title',
    detail: 'builder.steps.filters.detail',
  },
  {
    id: 's5',
    kind: 'style',
    title: 'builder.steps.style.title',
    detail: 'builder.steps.style.detail',
  },
  {
    id: 's6',
    kind: 'layout',
    title: 'builder.steps.layout.title',
    detail: 'builder.steps.layout.detail',
  },
  {
    id: 's7',
    kind: 'promote',
    title: 'builder.steps.promote.title',
    detail: 'builder.steps.promote.detail',
  },
]

export type BuilderDocumentState = {
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
  reorderLayers: (tabId: WorkbenchTabId, layers: RecipeLayer[]) => void

  addExample: (tabId: WorkbenchTabId, example: ExampleRecord) => void
  removeExample: (tabId: WorkbenchTabId, id: string) => void
  setDefaultExample: (tabId: WorkbenchTabId, id: string) => void

  addEdge: (tabId: WorkbenchTabId, edge: TraversalEdge) => void
  removeEdge: (tabId: WorkbenchTabId, id: string) => void
  toggleEdgeAuto: (tabId: WorkbenchTabId, id: string) => void

  addFilter: (tabId: WorkbenchTabId, filter: RecipeFilter) => void
  removeFilter: (tabId: WorkbenchTabId, id: string) => void

  setSwatch: (tabId: WorkbenchTabId, index: number, color: string) => void
  setLayoutAlgorithm: (
    tabId: WorkbenchTabId,
    algorithm: LayoutAlgorithm,
  ) => void
}

function createInitialRecipe(): RecipeData {
  return {
    title: '',
    layers: [],
    examples: [],
    edges: [],
    filters: [],
    swatches: ['#C4006A', '#1D8B68', '#6A2B4D', '#18181B'],
    layoutAlgorithm: 'Layered',
    promoteOrg: '',
    promoteVisibility: 'org-wide',
    promoteAudience: '',
  }
}

function cloneRecipe(recipe: RecipeData): RecipeData {
  return {
    ...recipe,
    layers: recipe.layers.map((layer) => ({ ...layer })),
    examples: recipe.examples.map((example) => ({ ...example })),
    edges: recipe.edges.map((edge) => ({ ...edge })),
    filters: recipe.filters.map((filter) => ({ ...filter })),
    swatches: [...recipe.swatches],
  }
}

function createBuilderDocumentState(
  recipe = createInitialRecipe(),
): BuilderDocumentState {
  return {
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
              document.recipe.layers = document.recipe.layers.filter(
                (layer) => layer.id !== id,
              )
            },
            false,
            'builder/removeLayer',
          ),

        reorderLayers: (tabId, layers) =>
          set(
            (state) => {
              ensureBuilderDocument(state, tabId).recipe.layers = layers.map(
                (layer) => ({ ...layer }),
              )
            },
            false,
            'builder/reorderLayers',
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

        setSwatch: (tabId, index, color) =>
          set(
            (state) => {
              const swatches = ensureBuilderDocument(state, tabId).recipe
                .swatches
              if (index >= 0 && index < swatches.length) {
                swatches[index] = color
              }
            },
            false,
            'builder/setSwatch',
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
