import type { ParseKeys } from 'i18next'

import type { SchemaRoute } from '@/api/contracts'
import type { LayoutAlgorithm } from '@/features/elk/algorithms'

export type RecipeStepKind =
  | 'layers'
  | 'examples'
  | 'traversal'
  | 'filters'
  | 'grouping'
  | 'style'
  | 'layout'
  | 'promote'

export type { LayoutAlgorithm }

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

export interface RecipeGroupRule {
  id: string
  parentModelId: string
  childModelId: string
  via: string
}

export interface RecipeFilter {
  id: string
  layer: string
  expr: string
  suggested: boolean
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
  swatches: string[]
  layoutAlgorithm: LayoutAlgorithm
  promoteOrg: string
  promoteVisibility: string
  promoteAudience: string
}
