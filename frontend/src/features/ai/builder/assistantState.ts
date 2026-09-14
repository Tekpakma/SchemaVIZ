import { create } from 'zustand'

import type { RecipeData } from '@/features/builder/types'

import type { DiagramSnapshot } from '../systemPrompt'

/** Compact view of the canvas that travels with every assistant message. */
export function buildDiagramSnapshot(
  recipe: RecipeData,
  activeExampleId: string | null,
): DiagramSnapshot {
  const byId = new Map(recipe.models.map((model) => [model.id, model]))
  const activeExample = activeExampleId
    ? recipe.examples.find((example) => example.id === activeExampleId)
    : null

  return {
    title: recipe.title,
    rootModel: recipe.models[0]?.modelId ?? null,
    models: recipe.models.map((model) => model.modelId),
    edges: recipe.edges.flatMap((edge) => {
      const from = edge.fromModelId ? byId.get(edge.fromModelId) : null
      const to = edge.toModelId ? byId.get(edge.toModelId) : null
      return from && to
        ? [{ from: from.modelId, to: to.modelId, via: edge.via }]
        : []
    }),
    layoutDirection: recipe.layoutDirection,
    activeRecord: activeExample
      ? {
          id: activeExample.idValue.slice(
            activeExample.idValue.indexOf(':') + 1,
          ),
          label: activeExample.label,
        }
      : null,
  }
}

type AssistantPanelState = {
  open: boolean
  setOpen: (open: boolean) => void
  toggle: () => void
}

/** Global so the command center can open the panel before the builder mounts. */
export const useAssistantPanelStore = create<AssistantPanelState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
  toggle: () => set((state) => ({ open: !state.open })),
}))
