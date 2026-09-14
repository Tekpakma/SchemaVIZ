import { clientTools } from '@tanstack/ai-client'

import type { BuilderDocumentActions } from '@/features/builder/builderWorkbench'
import { createRecipeLayer } from '@/features/builder/recipeDefaults'
import type {
  RecipeData,
  RecipeModel,
  TraversalEdge,
} from '@/features/builder/types'
import { DEFAULT_RECIPE_GROUP_LAYOUT } from '@/features/builder/types'
import { splitModelId } from '@/features/lexical/dataReference/modelUtils'

import type { DiagramSpec } from '../tools/diagramSpec'
import { createStyleDraft } from '../tools/diagramSpec'
import {
  applyDiagramSpecDef,
  removeModelsDef,
  setLayoutDirectionDef,
  setRootRecordDef,
} from '../tools/builderToolDefs'

export type BuilderToolBridge = {
  getRecipe: () => RecipeData
  actions: Pick<
    BuilderDocumentActions,
    | 'addEdge'
    | 'addExample'
    | 'addGroupRule'
    | 'addLayer'
    | 'addModel'
    | 'removeModel'
    | 'setActiveExample'
    | 'setEdgeLabels'
    | 'setLayoutDirection'
    | 'setStyleDraft'
    | 'setTitle'
  >
}

function createBuilderId(prefix: string) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`
}

/** Hop distance from the root along the spec's steps; unreachable models get 1. */
function depthByModel(spec: DiagramSpec): Map<string, number> {
  // Reference steps point at models that are drawn elsewhere; they must not
  // decide where a model lives.
  const structural = spec.steps.filter((step) => step.groupMode !== 'reference')
  const depths = new Map<string, number>([[spec.rootModel, 0]])
  let changed = true
  while (changed) {
    changed = false
    for (const step of structural) {
      const parentDepth = depths.get(step.fromModel)
      if (parentDepth !== undefined && !depths.has(step.toModel)) {
        depths.set(step.toModel, parentDepth + 1)
        changed = true
      }
    }
  }
  for (const step of spec.steps) {
    if (!depths.has(step.toModel)) depths.set(step.toModel, 1)
  }
  return depths
}

function toRecipeModel(modelId: string, layerId: string): RecipeModel | null {
  const ref = splitModelId(modelId)
  if (!ref) return null
  return {
    id: createBuilderId('model'),
    appLabel: ref.appLabel,
    appVerboseName: ref.appLabel,
    modelName: ref.modelName,
    modelId,
    displayName: ref.modelName,
    layerId,
  }
}

/**
 * The builder keeps exactly one model in the first layer (the root) and
 * suggests traversals between neighbouring layers, so models are placed by
 * their hop distance from the root.
 */
function ensureLayerForDepth(bridge: BuilderToolBridge, depth: number) {
  let layers = bridge.getRecipe().layers
  while (layers.length <= depth) {
    bridge.actions.addLayer(createRecipeLayer(`L${layers.length + 1}`))
    layers = bridge.getRecipe().layers
  }
  return layers[depth]!.id
}

export function createBuilderClientTools(bridge: BuilderToolBridge) {
  const applyDiagramSpec = applyDiagramSpecDef.client(({ spec, mode }) => {
    const replace = (mode ?? 'replace') === 'replace'
    const before = bridge.getRecipe()

    if (replace) {
      for (const model of before.models) bridge.actions.removeModel(model.id)
    } else {
      const root = before.models[0]
      if (root && root.modelId !== spec.rootModel) {
        throw new Error(
          `The canvas is rooted at ${root.modelId}; merging a spec rooted at ${spec.rootModel} is not possible. Use mode "replace" or start the spec from ${root.modelId}.`,
        )
      }
    }

    const depths = depthByModel(spec)
    const orderedModelIds = [
      spec.rootModel,
      ...spec.steps.flatMap((step) => [step.fromModel, step.toModel]),
    ].filter((id, index, all) => all.indexOf(id) === index)

    const addedModels: Array<string> = []
    for (const modelId of orderedModelIds) {
      if (bridge.getRecipe().models.some((m) => m.modelId === modelId)) continue
      const layerId = ensureLayerForDepth(bridge, depths.get(modelId) ?? 1)
      const model = toRecipeModel(modelId, layerId)
      if (!model) continue
      bridge.actions.addModel(model)
      addedModels.push(modelId)
    }

    const recipe = bridge.getRecipe()
    const byModelId = new Map(recipe.models.map((m) => [m.modelId, m]))

    // Every model the spec touches gets its look; existing drafts survive a
    // merge unless the spec styles that model explicitly.
    for (const modelId of orderedModelIds) {
      const model = byModelId.get(modelId)
      if (!model) continue
      const style = spec.styles?.[modelId]
      if (!replace && recipe.styleDrafts[model.id] && !style) continue
      bridge.actions.setStyleDraft(model.id, createStyleDraft(modelId, style))
    }

    for (const step of spec.steps) {
      const from = byModelId.get(step.fromModel)
      const to = byModelId.get(step.toModel)
      if (!from || !to) continue
      const exists = recipe.edges.some(
        (edge) =>
          edge.fromModelId === from.id &&
          edge.toModelId === to.id &&
          edge.via === step.relationship,
      )
      if (!exists) {
        const edge: TraversalEdge = {
          id: createBuilderId('edge'),
          from: from.displayName,
          to: to.displayName,
          fromModelId: from.id,
          toModelId: to.id,
          via: step.relationship,
          auto: false,
          cost: 1,
        }
        bridge.actions.addEdge(edge)
      }
      if (step.groupMode && step.groupMode !== 'edge') {
        bridge.actions.addGroupRule({
          id: createBuilderId('group'),
          parentModelId: from.id,
          childModelId: to.id,
          via: step.relationship,
          mode: step.groupMode,
          layout: { ...DEFAULT_RECIPE_GROUP_LAYOUT },
        })
      }
    }

    if (replace && spec.title.trim()) bridge.actions.setTitle(spec.title)
    if (spec.layoutDirection) {
      bridge.actions.setLayoutDirection(spec.layoutDirection)
    }
    if (spec.edgeLabels || replace) {
      bridge.actions.setEdgeLabels(spec.edgeLabels ?? 'auto')
    }

    const after = bridge.getRecipe()
    return {
      modelCount: after.models.length,
      edgeCount: after.edges.length,
      addedModels,
    }
  })

  const removeModels = removeModelsDef.client(({ modelIds }) => {
    const removed: Array<string> = []
    const notFound: Array<string> = []
    for (const modelId of modelIds) {
      const model = bridge
        .getRecipe()
        .models.find((m) => m.modelId === modelId || m.id === modelId)
      if (!model) {
        notFound.push(modelId)
        continue
      }
      bridge.actions.removeModel(model.id)
      removed.push(model.modelId)
    }
    return { removed, notFound }
  })

  const setLayoutDirection = setLayoutDirectionDef.client(({ direction }) => {
    bridge.actions.setLayoutDirection(direction)
    return { direction }
  })

  const setRootRecord = setRootRecordDef.client(({ recordId, label }) => {
    const recipe = bridge.getRecipe()
    const root = recipe.models[0]
    if (!root) {
      throw new Error('The canvas has no root model yet; apply a spec first.')
    }

    const idValue = `${root.appLabel}:${recordId}`
    let example = recipe.examples.find((ex) => ex.idValue === idValue)
    if (!example) {
      example = {
        id: `ex-${root.modelName}-${recordId}`,
        label,
        kind: root.displayName,
        idValue,
        isDefault: recipe.examples.length === 0,
      }
      bridge.actions.addExample(example)
    }
    bridge.actions.setActiveExample(example.id)

    return { rootModel: root.modelId, recordId }
  })

  return clientTools(
    applyDiagramSpec,
    removeModels,
    setLayoutDirection,
    setRootRecord,
  )
}
