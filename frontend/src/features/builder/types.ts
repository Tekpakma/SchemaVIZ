import type { ParseKeys } from 'i18next'

import type { LayoutAlgorithm } from '@/features/elk/algorithms'

export type RecipeStepKind =
  | 'layers'
  | 'examples'
  | 'traversal'
  | 'filters'
  | 'style'
  | 'layout'
  | 'promote'

export type { LayoutAlgorithm }

export interface RecipeLayer {
  id: string
  label: string
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
  via: string
  auto: boolean
  cost: number
  alt?: boolean
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
  examples: ExampleRecord[]
  edges: TraversalEdge[]
  filters: RecipeFilter[]
  swatches: string[]
  layoutAlgorithm: LayoutAlgorithm
  promoteOrg: string
  promoteVisibility: string
  promoteAudience: string
}
