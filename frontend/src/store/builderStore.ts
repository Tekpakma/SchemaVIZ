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

type BuilderState = {
  activeStepIndex: number
  recipe: RecipeData
  steps: RecipeStep[]
  actions: BuilderActions
}

type BuilderActions = {
  setActiveStep: (index: number) => void
  nextStep: () => void
  prevStep: () => void
  setTitle: (title: string) => void

  addLayer: (layer: RecipeLayer) => void
  removeLayer: (id: string) => void
  reorderLayers: (layers: RecipeLayer[]) => void

  addExample: (example: ExampleRecord) => void
  removeExample: (id: string) => void
  setDefaultExample: (id: string) => void

  addEdge: (edge: TraversalEdge) => void
  removeEdge: (id: string) => void
  toggleEdgeAuto: (id: string) => void

  addFilter: (filter: RecipeFilter) => void
  removeFilter: (id: string) => void

  setSwatch: (index: number, color: string) => void
  setLayoutAlgorithm: (algorithm: LayoutAlgorithm) => void
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

const useBuilderStore = create<BuilderState>()(
  devtools(
    immer((set) => ({
      activeStepIndex: 0,
      recipe: createInitialRecipe(),
      steps: RECIPE_STEPS,
      actions: {
        setActiveStep: (index) =>
          set(
            (state) => {
              state.activeStepIndex = Math.max(
                0,
                Math.min(index, state.steps.length - 1),
              )
            },
            false,
            'builder/setActiveStep',
          ),

        nextStep: () =>
          set(
            (state) => {
              state.activeStepIndex = Math.min(
                state.activeStepIndex + 1,
                state.steps.length - 1,
              )
            },
            false,
            'builder/nextStep',
          ),

        prevStep: () =>
          set(
            (state) => {
              state.activeStepIndex = Math.max(state.activeStepIndex - 1, 0)
            },
            false,
            'builder/prevStep',
          ),

        setTitle: (title) =>
          set(
            (state) => {
              state.recipe.title = title
            },
            false,
            'builder/setTitle',
          ),

        addLayer: (layer) =>
          set(
            (state) => {
              state.recipe.layers.push(layer)
            },
            false,
            'builder/addLayer',
          ),

        removeLayer: (id) =>
          set(
            (state) => {
              state.recipe.layers = state.recipe.layers.filter(
                (l) => l.id !== id,
              )
            },
            false,
            'builder/removeLayer',
          ),

        reorderLayers: (layers) =>
          set(
            (state) => {
              state.recipe.layers = layers
            },
            false,
            'builder/reorderLayers',
          ),

        addExample: (example) =>
          set(
            (state) => {
              state.recipe.examples.push(example)
            },
            false,
            'builder/addExample',
          ),

        removeExample: (id) =>
          set(
            (state) => {
              state.recipe.examples = state.recipe.examples.filter(
                (e) => e.id !== id,
              )
            },
            false,
            'builder/removeExample',
          ),

        setDefaultExample: (id) =>
          set(
            (state) => {
              for (const ex of state.recipe.examples) {
                ex.isDefault = ex.id === id
              }
            },
            false,
            'builder/setDefaultExample',
          ),

        addEdge: (edge) =>
          set(
            (state) => {
              state.recipe.edges.push(edge)
            },
            false,
            'builder/addEdge',
          ),

        removeEdge: (id) =>
          set(
            (state) => {
              state.recipe.edges = state.recipe.edges.filter((e) => e.id !== id)
            },
            false,
            'builder/removeEdge',
          ),

        toggleEdgeAuto: (id) =>
          set(
            (state) => {
              const edge = state.recipe.edges.find((e) => e.id === id)
              if (edge) edge.auto = !edge.auto
            },
            false,
            'builder/toggleEdgeAuto',
          ),

        addFilter: (filter) =>
          set(
            (state) => {
              state.recipe.filters.push(filter)
            },
            false,
            'builder/addFilter',
          ),

        removeFilter: (id) =>
          set(
            (state) => {
              state.recipe.filters = state.recipe.filters.filter(
                (f) => f.id !== id,
              )
            },
            false,
            'builder/removeFilter',
          ),

        setSwatch: (index, color) =>
          set(
            (state) => {
              if (index >= 0 && index < state.recipe.swatches.length) {
                state.recipe.swatches[index] = color
              }
            },
            false,
            'builder/setSwatch',
          ),

        setLayoutAlgorithm: (algorithm) =>
          set(
            (state) => {
              state.recipe.layoutAlgorithm = algorithm
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

export const useBuilderActions = () => useBuilderStore((state) => state.actions)
export const useBuilderActiveStepIndex = () =>
  useBuilderStore((state) => state.activeStepIndex)
export const useBuilderSteps = () => useBuilderStore((state) => state.steps)
export const useBuilderActiveStep = () =>
  useBuilderStore((state) => state.steps[state.activeStepIndex]!)
export const useBuilderRecipe = () => useBuilderStore((state) => state.recipe)
export const useBuilderTitle = () =>
  useBuilderStore((state) => state.recipe.title)
export const useBuilderLayers = () =>
  useBuilderStore((state) => state.recipe.layers)
export const useBuilderExamples = () =>
  useBuilderStore((state) => state.recipe.examples)
export const useBuilderEdges = () =>
  useBuilderStore((state) => state.recipe.edges)
export const useBuilderFilters = () =>
  useBuilderStore((state) => state.recipe.filters)
export const useBuilderSwatches = () =>
  useBuilderStore((state) => state.recipe.swatches)
export const useBuilderLayoutAlgorithm = () =>
  useBuilderStore((state) => state.recipe.layoutAlgorithm)
