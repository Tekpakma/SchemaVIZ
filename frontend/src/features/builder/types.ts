import type { ParseKeys } from 'i18next'

import type { SchemaRoute } from '@/api/contracts'
import type {
  CanvasFlowDirection,
  CanvasGroupLayoutPolicy,
} from '@/features/canvas/model/types'
import type { LayoutAlgorithm } from '@/features/elk/algorithms'

export type RecipeStepKind =
  | 'layers'
  | 'traversal'
  | 'filters'
  | 'grouping'
  | 'style'
  | 'layout'

export type { LayoutAlgorithm }
export type RecipeLayoutDirection = CanvasFlowDirection

export interface RecipeLayer {
  id: string
  label: string
}

export interface RecipeModel {
  id: string
  appLabel: string
  appVerboseName: string
  modelName: string
  modelId: string
  displayName: string
  layerId: string
  alias?: string
  styleTemplateId?: string | null
}

export type RecipeStyleDraftSaveState = 'idle' | 'saving' | 'saved' | 'error'

export interface RecipeStyleDraft {
  sourceTemplateId: string | null
  persistedTemplateId: string | null
  name: string
  textContent: unknown | null
  visualStyles: unknown
  dimensions: unknown
  typeSpecificData: unknown
  dirty: boolean
  saveState: RecipeStyleDraftSaveState
  error?: string
}

export interface ExampleRecord {
  id: string
  label: string
  kind: string
  idValue: string
  isDefault: boolean
}

export interface TraversalEdge {
  id: string
  from: string
  to: string
  fromModelId?: string
  toModelId?: string
  via: string
  routeSteps?: TraversalRouteStep[]
  auto: boolean
  cost: number
  alt?: boolean
}

export type TraversalRouteStep = SchemaRoute['route'][number]

export type GroupMode = 'none' | 'group' | 'breakout'

export interface RecipeGroupRule {
  id: string
  parentModelId: string
  childModelId: string
  via: string
  mode: GroupMode
  layout?: CanvasGroupLayoutPolicy
}

export const DEFAULT_RECIPE_GROUP_LAYOUT = {
  mode: 'auto-pack',
} satisfies CanvasGroupLayoutPolicy

export interface RecipeFilter {
  id: string
  layer: string
  expr: string
  suggested: boolean
  modelId?: string
  filterFields?: Record<string, unknown>
}

export interface RecipeStep {
  id: string
  kind: RecipeStepKind
  title: ParseKeys<'translation'>
  detail: ParseKeys<'translation'>
}

// TODO: Align with backend GenerationTemplate model once API is wired
// The backend GenerationTemplate (god node, 105 edges) holds the full
// recipe definition including version, scope, publishedBy, etc.
export interface RecipeData {
  title: string
  layers: RecipeLayer[]
  models: RecipeModel[]
  examples: ExampleRecord[]
  edges: TraversalEdge[]
  filters: RecipeFilter[]
  groupRules: RecipeGroupRule[]
  groupLayout: CanvasGroupLayoutPolicy
  styleDrafts: Record<string, RecipeStyleDraft>
  swatches: string[]
  layoutAlgorithm: LayoutAlgorithm
  layoutDirection: RecipeLayoutDirection
  shareSlug: string
  promoteOrg: string
  promoteVisibility: string
  promoteAudience: string
}
