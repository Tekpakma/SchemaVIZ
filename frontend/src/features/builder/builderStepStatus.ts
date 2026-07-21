import type { ParseKeys } from 'i18next'

import { createTemplateTextContent } from '@/features/lexical/templateTextContent'
import type {
  RecipeData,
  RecipeModel,
  RecipeStep,
  RecipeStepKind,
} from './types'
import { DEFAULT_RECIPE_GROUP_LAYOUT } from './types'
import { hasCompleteLayerNodeContext } from './layerNodeContext'

export type BuilderStepStatusKind =
  'needs-input' | 'default' | 'ready' | 'configured'

export type BuilderStepStatus = {
  kind: BuilderStepStatusKind
  labelKey: ParseKeys<'translation'>
  hintKey: ParseKeys<'translation'>
}

const STATUS_KEYS: Record<
  BuilderStepStatusKind,
  {
    hintKey: ParseKeys<'translation'>
    labelKey: ParseKeys<'translation'>
  }
> = {
  'needs-input': {
    hintKey: 'builder.stepStatus.needsInputHint',
    labelKey: 'builder.stepStatus.needsInput',
  },
  default: {
    hintKey: 'builder.stepStatus.defaultHint',
    labelKey: 'builder.stepStatus.default',
  },
  ready: {
    hintKey: 'builder.stepStatus.readyHint',
    labelKey: 'builder.stepStatus.ready',
  },
  configured: {
    hintKey: 'builder.stepStatus.configuredHint',
    labelKey: 'builder.stepStatus.configured',
  },
}

function status(kind: BuilderStepStatusKind): BuilderStepStatus {
  return {
    kind,
    ...STATUS_KEYS[kind],
  }
}

function hasStartModel(recipe: RecipeData) {
  const startLayerId = recipe.layers[0]?.id
  return Boolean(
    startLayerId && recipe.models.some((m) => m.layerId === startLayerId),
  )
}

function isEmptyObject(value: unknown) {
  return (
    value != null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length === 0
  )
}

function jsonEqual(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function isDefaultQuickStyleDraft(recipe: RecipeData, model: RecipeModel) {
  if (model.styleTemplateId) return false

  const draft = recipe.styleDrafts[model.id]
  if (!draft) return true
  if (draft.sourceTemplateId || draft.persistedTemplateId) return false

  return (
    draft.name === `${model.alias || model.displayName} node` &&
    jsonEqual(
      draft.textContent,
      createTemplateTextContent(model.alias || model.displayName),
    ) &&
    isEmptyObject(draft.visualStyles) &&
    isEmptyObject(draft.dimensions) &&
    isEmptyObject(draft.typeSpecificData)
  )
}

function hasConfiguredStyle(recipe: RecipeData) {
  return recipe.models.some((model) => !isDefaultQuickStyleDraft(recipe, model))
}

function hasConfiguredLayout(recipe: RecipeData) {
  return (
    recipe.layoutAlgorithm !== 'Layered' ||
    recipe.layoutDirection !== 'LR' ||
    !jsonEqual(recipe.groupLayout, DEFAULT_RECIPE_GROUP_LAYOUT)
  )
}

function getStepStatusKind(
  recipe: RecipeData,
  kind: RecipeStepKind,
): BuilderStepStatusKind {
  switch (kind) {
    case 'layers':
      return hasStartModel(recipe) &&
        hasCompleteLayerNodeContext(recipe.layers, recipe.models)
        ? 'configured'
        : 'needs-input'
    case 'traversal':
      if (recipe.models.length <= 1) return 'ready'
      return recipe.edges.length > 0 ? 'configured' : 'needs-input'
    case 'filters':
      return recipe.filters.length > 0 ? 'configured' : 'default'
    case 'grouping':
      return recipe.groupRules.length > 0 ? 'configured' : 'default'
    case 'style':
      return hasConfiguredStyle(recipe) ? 'configured' : 'default'
    case 'layout':
      return hasConfiguredLayout(recipe) ? 'configured' : 'default'
    default:
      return 'ready'
  }
}

export function getRecipeStepStatuses(recipe: RecipeData, steps: RecipeStep[]) {
  return steps.map((step) => status(getStepStatusKind(recipe, step.kind)))
}
